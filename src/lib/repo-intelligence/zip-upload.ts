import { createHash } from "node:crypto";
import yauzl from "yauzl";
import { analyzeSourceFiles, getIntelligenceFileCategory } from "./analyzer";
import { enrichWithOsv, extractRepositoryDependencies } from "./dependencies";
import { REPO_INTELLIGENCE_VERSION, type RepositoryIntelligence, type SourceFileInput } from "./types";

export const ZIP_UPLOAD_LIMITS = {
    compressedBytes: 50 * 1024 * 1024,
    files: 800,
    entryCount: 20_000,
    fileBytes: 512 * 1024,
    totalBytes: 16 * 1024 * 1024,
} as const;

export class ZipUploadError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
        this.name = "ZipUploadError";
    }
}

export interface ZipAnalysisResult {
    name: string;
    analysis: RepositoryIntelligence;
    sources: Record<string, string>;
}

interface CollectedFiles {
    inputs: SourceFileInput[];
    skippedFiles: number;
    skipReasons: Record<string, number>;
    skippedFileExamples: { path: string; reason: string }[];
}

function safePath(path: string): string | null {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized || normalized.length > 1000 || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || /[\u0000-\u001f]/.test(normalized)) return null;
    const segments = normalized.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
    return normalized;
}

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, zip) => {
            if (error || !zip) reject(new ZipUploadError(error?.message.includes("relative path") ? "The ZIP contains an unsafe file path." : "This ZIP file is invalid or unsupported."));
            else resolve(zip);
        });
    });
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) return reject(error ?? new Error("Could not read ZIP entry."));
            const chunks: Buffer[] = [];
            let bytes = 0;
            let settled = false;
            stream.on("data", (chunk: Buffer) => {
                bytes += chunk.byteLength;
                if (bytes > maxBytes) {
                    settled = true;
                    stream.destroy();
                    reject(new ZipUploadError("The ZIP's expanded content exceeds the analysis size limits.", 413));
                    return;
                }
                chunks.push(Buffer.from(chunk));
            });
            stream.once("error", (streamError) => { if (!settled) reject(streamError); });
            stream.once("end", () => { if (!settled) resolve(Buffer.concat(chunks)); });
        });
    });
}

async function collectSourceFiles(buffer: Buffer): Promise<CollectedFiles> {
    const zip = await openZip(buffer);
    const files: SourceFileInput[] = [];
    const seenPaths = new Set<string>();
    let entryCount = 0;
    let totalBytes = 0;
    let skippedFiles = 0;
    const skipReasons: Record<string, number> = {};
    const skippedFileExamples: { path: string; reason: string }[] = [];
    const skipFile = (path: string, reason: string) => {
        skippedFiles += 1;
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        if (skippedFileExamples.length < 100) skippedFileExamples.push({ path, reason });
    };

    try {
        await new Promise<void>((resolve, reject) => {
            zip.once("error", reject);
            zip.once("end", resolve);
            zip.on("entry", (entry) => {
                void (async () => {
                    entryCount += 1;
                    if (entryCount > ZIP_UPLOAD_LIMITS.entryCount) throw new ZipUploadError("The ZIP contains too many entries (limit: 20,000).", 413);
                    if (entry.fileName.endsWith("/")) { zip.readEntry(); return; }
                    const path = safePath(entry.fileName);
                    if (!path) throw new ZipUploadError("The ZIP contains an unsafe file path.");
                    if (/(^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|\.next)(\/|$)/i.test(path)) { zip.readEntry(); return; }
                    if (seenPaths.has(path)) throw new ZipUploadError("The ZIP contains duplicate file paths.");
                    const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
                    if ((mode & 0xf000) === 0xa000) throw new ZipUploadError("ZIP files containing symbolic links are not supported.");
                    if ((mode & 0xf000) !== 0 && (mode & 0xf000) !== 0x8000) throw new ZipUploadError("ZIP archives may contain regular files only.");
                    if (!getIntelligenceFileCategory(path)) { zip.readEntry(); return; }
                    if (entry.uncompressedSize > ZIP_UPLOAD_LIMITS.fileBytes) { skipFile(path, "File exceeds per-file size limit"); zip.readEntry(); return; }
                    if (files.length >= ZIP_UPLOAD_LIMITS.files || totalBytes + entry.uncompressedSize > ZIP_UPLOAD_LIMITS.totalBytes) {
                        throw new ZipUploadError("The ZIP exceeds the analysis limits (800 files and 16 MB of source content).", 413);
                    }
                    const contentBuffer = await readEntry(zip, entry, Math.min(ZIP_UPLOAD_LIMITS.fileBytes, ZIP_UPLOAD_LIMITS.totalBytes - totalBytes));
                    if (totalBytes + contentBuffer.byteLength > ZIP_UPLOAD_LIMITS.totalBytes) throw new ZipUploadError("The ZIP exceeds the total source content limit.", 413);
                    totalBytes += contentBuffer.byteLength;
                    if (contentBuffer.includes(0)) { skipFile(path, "Binary content"); zip.readEntry(); return; }
                    const content = contentBuffer.toString("utf8");
                    seenPaths.add(path);
                    files.push({ path, content, size: contentBuffer.byteLength, sha: createHash("sha256").update(contentBuffer).digest("hex") });
                    zip.readEntry();
                })().catch(reject);
            });
            zip.readEntry();
        });
    } catch (error) {
        if (error instanceof ZipUploadError) throw error;
        if (error instanceof Error && error.message.includes("relative path")) throw new ZipUploadError("The ZIP contains an unsafe file path.");
        throw new ZipUploadError("This ZIP file is invalid or unsupported.");
    } finally {
        zip.close();
    }
    return { inputs: files, skippedFiles, skipReasons, skippedFileExamples };
}

export async function analyzeZip(buffer: Buffer, fileName: string): Promise<ZipAnalysisResult> {
    if (buffer.byteLength > ZIP_UPLOAD_LIMITS.compressedBytes) {
        throw new ZipUploadError("ZIP files must be 50 MB or smaller.", 413);
    }
    const collected = await collectSourceFiles(buffer);
    const inputs = collected.inputs;
    if (inputs.length === 0) throw new ZipUploadError("No supported source, manifest, configuration, or documentation files were found in this ZIP.");
    const startedAt = new Date();
    const extracted = analyzeSourceFiles(inputs);
    const dependencies = await enrichWithOsv(extractRepositoryDependencies(inputs));
    const completedAt = new Date();
    const fileNameWithoutExtension = fileName.replace(/\.zip$/i, "").trim().slice(0, 100) || "Uploaded repository";
    const analysis: RepositoryIntelligence = {
        owner: "uploaded",
        repo: fileNameWithoutExtension,
        branch: "uploaded archive",
        commitSha: "local-archive",
        analyzerVersion: REPO_INTELLIGENCE_VERSION,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        coverage: {
            status: collected.skippedFiles > 0 ? "partial" : "complete",
            totalDiscoveredFiles: inputs.length + collected.skippedFiles,
            inspectedFiles: extracted.files.length,
            skippedFiles: collected.skippedFiles,
            skipReasons: collected.skipReasons,
            skippedFileExamples: collected.skippedFileExamples,
            treeTruncated: false,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            limits: { maxFiles: ZIP_UPLOAD_LIMITS.files, maxFileBytes: ZIP_UPLOAD_LIMITS.fileBytes, maxTotalBytes: ZIP_UPLOAD_LIMITS.totalBytes, maxDurationMs: 45_000 },
        },
        files: extracted.files,
        technologies: extracted.technologies,
        dependencies,
        dependencyCoverage: {
            reported: dependencies.length,
            truncated: false,
            advisoryChecked: dependencies.filter((item) => item.advisoryState === "checked").length,
            advisoryUnavailable: dependencies.filter((item) => item.advisoryState === "unavailable").length,
            advisoryNotChecked: dependencies.filter((item) => item.advisoryState === "not-checked").length,
            advisoryLimit: 50,
        },
        features: extracted.features,
    };
    const sources = Object.fromEntries(inputs.map((input) => [input.path, input.content]));
    return { name: fileNameWithoutExtension, analysis, sources };
}

export async function readUploadFile(file: File): Promise<Buffer> {
    if (!file.name.toLowerCase().endsWith(".zip")) throw new ZipUploadError("Choose a .zip file.");
    if (file.size > ZIP_UPLOAD_LIMITS.compressedBytes) throw new ZipUploadError("ZIP files must be 50 MB or smaller.", 413);
    return Buffer.from(await file.arrayBuffer());
}
