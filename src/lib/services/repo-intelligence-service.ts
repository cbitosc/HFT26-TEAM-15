import type { Octokit } from "octokit";
import { prisma } from "@/lib/db";
import { cacheFile, getCachedFile, type FileCachePolicy } from "@/lib/cache";
import { createGitHubClient, type FileNode } from "@/lib/github";
import { isBinaryFile, shouldSkipFile } from "@/lib/file-filters";
import { analyzeSourceFiles, getIntelligenceFileCategory } from "@/lib/repo-intelligence/analyzer";
import { enrichWithOsv, extractRepositoryDependencies } from "@/lib/repo-intelligence/dependencies";
import { REPO_INTELLIGENCE_VERSION, type AnalysisCoverage, type FileSkip, type RepositoryIntelligence, type SourceFileInput } from "@/lib/repo-intelligence/types";

export const REPO_ANALYSIS_LIMITS = {
    maxFiles: 800,
    maxFileBytes: 512 * 1024,
    maxTotalBytes: 16 * 1024 * 1024,
    maxDurationMs: 45_000,
    maxTreeDirectories: 1_000,
    maxTreeEntries: 20_000,
    concurrency: 8,
    maxSkipExamples: 100,
} as const;

export class RepositoryAnalysisError extends Error {
    constructor(message: string, readonly status: number = 500, readonly code = "ANALYSIS_FAILED") {
        super(message);
        this.name = "RepositoryAnalysisError";
    }
}

interface TreeResult {
    entries: FileNode[];
    truncated: boolean;
}

interface AnalysisOptions {
    owner: string;
    repo: string;
    branch?: string;
    userId?: string;
    accessToken?: string;
    forceRefresh?: boolean;
    client?: Octokit;
    now?: () => number;
    onProgress?: (stage: string, progress: number, message: string) => boolean | void | Promise<boolean | void>;
}

async function reportProgress(options: AnalysisOptions, stage: string, progress: number, message: string): Promise<void> {
    const accepted = await options.onProgress?.(stage, progress, message);
    if (accepted === false) throw new RepositoryAnalysisError("Repository analysis was cancelled.", 409, "ANALYSIS_CANCELLED");
}

function normalizeName(value: string): string {
    return value.trim().toLowerCase();
}

function isSafeRepoPath(path: string): boolean {
    if (!path || path.startsWith("/") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return false;
    return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function getSkipReason(node: FileNode): string | null {
    if (!isSafeRepoPath(node.path)) return "Unsafe repository path";
    if (node.mode === "120000") return "Symbolic link";
    if (node.type !== "blob") return "Not a source file";
    if (isBinaryFile(node.path)) return "Binary file";
    if (shouldSkipFile(node) && !node.path.toLowerCase().endsWith("package-lock.json")) {
        if ((node.size ?? 0) > 1_000_000) return "Existing GitHub file-size limit";
        if (!/[\\/](?:package-lock\.json|requirements\.txt|go\.mod|cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|gemfile|composer\.json)$/i.test(`/${node.path}`)) return "Lock file is excluded from source parsing";
        return "Excluded by shared repository file filter";
    }
    if (!getIntelligenceFileCategory(node.path)) return "Unsupported file type";
    if ((node.size ?? 0) > REPO_ANALYSIS_LIMITS.maxFileBytes) return "File exceeds analysis size limit";
    return null;
}

async function fetchCompleteTree(client: Octokit, owner: string, repo: string, commitSha: string): Promise<TreeResult> {
    const recursive = await client.rest.git.getTree({ owner, repo, tree_sha: commitSha, recursive: "true" });
    if (!recursive.data.truncated) return { entries: recursive.data.tree as FileNode[], truncated: false };

    // GitHub truncates recursive trees above its response limit. Walk subtrees to recover a bounded complete listing.
    const entries: FileNode[] = [];
    const queue: Array<{ sha: string; prefix: string }> = [{ sha: commitSha, prefix: "" }];
    let directoriesVisited = 0;
    while (queue.length > 0 && directoriesVisited < REPO_ANALYSIS_LIMITS.maxTreeDirectories && entries.length < REPO_ANALYSIS_LIMITS.maxTreeEntries) {
        const batch = queue.splice(0, REPO_ANALYSIS_LIMITS.concurrency);
        directoriesVisited += batch.length;
        const pages = await Promise.all(batch.map(({ sha }) => client.rest.git.getTree({ owner, repo, tree_sha: sha })));
        for (let index = 0; index < pages.length; index += 1) {
            const { prefix } = batch[index];
            for (const entry of pages[index].data.tree as FileNode[]) {
                const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;
                if (entry.type === "tree") queue.push({ sha: entry.sha, prefix: fullPath });
                else entries.push({ ...entry, path: fullPath });
                if (entries.length >= REPO_ANALYSIS_LIMITS.maxTreeEntries) break;
            }
        }
    }
    return {
        entries,
        truncated: queue.length > 0 || entries.length >= REPO_ANALYSIS_LIMITS.maxTreeEntries,
    };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await run(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

function incrementReason(reasons: Record<string, number>, reason: string): void {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
}

async function fetchBlob(
    client: Octokit,
    owner: string,
    repo: string,
    file: FileNode,
    policy: FileCachePolicy,
): Promise<SourceFileInput> {
    const sha = file.sha;
    const cached = await getCachedFile(owner, repo, file.path, sha, policy);
    if (cached !== null && cached !== undefined) return { path: file.path, sha, size: file.size ?? Buffer.byteLength(cached, "utf8"), content: cached };
    const response = await client.rest.git.getBlob({ owner, repo, file_sha: sha });
    const content = Buffer.from(response.data.content, "base64").toString("utf8");
    if (content.includes("\u0000")) throw new RepositoryAnalysisError("Binary content was returned for a source file.", 422, "BINARY_CONTENT");
    await cacheFile(owner, repo, file.path, sha, content, policy);
    return { path: file.path, sha, size: file.size ?? Buffer.byteLength(content, "utf8"), content };
}

function cacheScopeFor(isPrivate: boolean, userId?: string): string {
    return isPrivate ? `user:${userId}` : "public";
}

export async function analyzeRepository(options: AnalysisOptions): Promise<{ analysis: RepositoryIntelligence; cached: boolean }> {
    const owner = normalizeName(options.owner);
    const repo = normalizeName(options.repo);
    const branchInput = options.branch?.trim();
    const now = options.now ?? Date.now;
    const startedAtMs = now();
    if (!/^[a-z0-9._-]{1,100}$/i.test(owner) || owner.startsWith(".") || owner.endsWith(".")) {
        throw new RepositoryAnalysisError("Invalid GitHub owner.", 400, "INVALID_OWNER");
    }
    if (!/^[a-z0-9._-]{1,100}$/i.test(repo) || repo.startsWith(".") || repo.endsWith(".") || repo.endsWith(".git")) {
        throw new RepositoryAnalysisError("Invalid GitHub repository name.", 400, "INVALID_REPOSITORY");
    }
    if (branchInput && (branchInput.length > 200 || /[\u0000-\u001f]/.test(branchInput))) {
        throw new RepositoryAnalysisError("Invalid branch name.", 400, "INVALID_BRANCH");
    }

    const client = options.client ?? createGitHubClient(options.accessToken, 12_000);
    let repoResponse;
    try {
        repoResponse = await client.rest.repos.get({ owner, repo });
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 502;
        if (status === 404) throw new RepositoryAnalysisError("Repository not found or inaccessible.", 404, "REPOSITORY_NOT_FOUND");
        if (status === 403 || status === 429) throw new RepositoryAnalysisError("GitHub rate limit or permission limit reached. Try again later.", 429, "GITHUB_RATE_LIMIT");
        throw new RepositoryAnalysisError("Could not load repository metadata from GitHub.", 502, "GITHUB_UNAVAILABLE");
    }

    const metadata = repoResponse.data;
    await reportProgress(options, "metadata", 15, "Repository metadata loaded.");
    if (metadata.private && (!options.userId || !options.accessToken)) {
        throw new RepositoryAnalysisError("Sign in with an authorized GitHub account to analyze this private repository.", 403, "PRIVATE_REPOSITORY_AUTH_REQUIRED");
    }
    const branch = branchInput || metadata.default_branch;
    let branchResponse;
    try {
        branchResponse = await client.rest.repos.getBranch({ owner, repo, branch });
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 502;
        if (status === 404) throw new RepositoryAnalysisError(`Branch “${branch}” was not found.`, 404, "BRANCH_NOT_FOUND");
        if (status === 403 || status === 429) throw new RepositoryAnalysisError("GitHub rate limit or permission limit reached. Try again later.", 429, "GITHUB_RATE_LIMIT");
        throw new RepositoryAnalysisError("Could not resolve this branch on GitHub.", 502, "GITHUB_UNAVAILABLE");
    }
    const commitSha = branchResponse.data.commit.sha;
    await reportProgress(options, "revision", 25, `Resolved branch ${branch} to commit ${commitSha.slice(0, 10)}.`);
    const cacheScope = cacheScopeFor(metadata.private, options.userId);
    const where = {
        owner_repo_branch_commitSha_analyzerVersion_cacheScope: {
            owner,
            repo,
            branch,
            commitSha,
            analyzerVersion: REPO_INTELLIGENCE_VERSION,
            cacheScope,
        },
    };

    if (!options.forceRefresh) {
        const existing = await prisma.repositoryIntelligence.findUnique({ where });
        if (existing && (existing.status === "complete" || existing.status === "partial")) {
            return { analysis: { ...(existing.result as unknown as RepositoryIntelligence), id: existing.id }, cached: true };
        }
    }

    let treeResult: TreeResult;
    try {
        treeResult = await fetchCompleteTree(client, owner, repo, commitSha);
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 502;
        if (status === 403 || status === 429) throw new RepositoryAnalysisError("GitHub rate limit or permission limit reached while reading the repository tree.", 429, "GITHUB_RATE_LIMIT");
        throw new RepositoryAnalysisError("Could not load the repository file tree from GitHub.", 502, "GITHUB_TREE_UNAVAILABLE");
    }
    await reportProgress(options, "file_tree", 40, `Discovered ${treeResult.entries.length} repository tree entries.`);

    const blobs = treeResult.entries.filter((node) => node.type === "blob");
    const skipped: FileSkip[] = [];
    const skipReasons: Record<string, number> = {};
    const candidates: FileNode[] = [];
    for (const node of blobs) {
        const reason = getSkipReason(node);
        if (reason) {
            incrementReason(skipReasons, reason);
            if (skipped.length < REPO_ANALYSIS_LIMITS.maxSkipExamples) skipped.push({ path: node.path, reason });
        } else {
            candidates.push(node);
        }
    }

    if (candidates.length > REPO_ANALYSIS_LIMITS.maxFiles) {
        const overflow = candidates.splice(REPO_ANALYSIS_LIMITS.maxFiles);
        incrementReason(skipReasons, "Maximum analyzed-file count");
        skipReasons["Maximum analyzed-file count"] += overflow.length;
        for (const node of overflow.slice(0, Math.max(0, REPO_ANALYSIS_LIMITS.maxSkipExamples - skipped.length))) skipped.push({ path: node.path, reason: "Maximum analyzed-file count" });
    }

    const isPrivate = Boolean(metadata.private);
    await reportProgress(options, "source_selection", 50, `Selected ${candidates.length} supported files; ${Object.values(skipReasons).reduce((sum, count) => sum + count, 0)} entries are excluded or over limits.`);
    const cachePolicy: FileCachePolicy = {
        audience: isPrivate ? "authenticated" : options.userId ? "authenticated" : "anonymous",
        actorId: options.userId ?? "repo-intelligence-anonymous",
        visibility: isPrivate ? "private" : "public",
    };
    const contents: SourceFileInput[] = [];
    let totalBytes = 0;
    let failedFetches = 0;
    await mapConcurrent(candidates, REPO_ANALYSIS_LIMITS.concurrency, async (node) => {
        if (now() - startedAtMs > REPO_ANALYSIS_LIMITS.maxDurationMs) {
            incrementReason(skipReasons, "Analysis time limit");
            if (skipped.length < REPO_ANALYSIS_LIMITS.maxSkipExamples) skipped.push({ path: node.path, reason: "Analysis time limit" });
            return;
        }
        if (totalBytes + (node.size ?? 0) > REPO_ANALYSIS_LIMITS.maxTotalBytes) {
            incrementReason(skipReasons, "Total content size limit");
            if (skipped.length < REPO_ANALYSIS_LIMITS.maxSkipExamples) skipped.push({ path: node.path, reason: "Total content size limit" });
            return;
        }
        try {
            const input = await fetchBlob(client, owner, repo, node, cachePolicy);
            totalBytes += Buffer.byteLength(input.content, "utf8");
            if (totalBytes > REPO_ANALYSIS_LIMITS.maxTotalBytes) {
                totalBytes -= Buffer.byteLength(input.content, "utf8");
                incrementReason(skipReasons, "Total content size limit");
                if (skipped.length < REPO_ANALYSIS_LIMITS.maxSkipExamples) skipped.push({ path: node.path, reason: "Total content size limit" });
                return;
            }
            contents.push(input);
        } catch {
            failedFetches += 1;
            incrementReason(skipReasons, "GitHub file fetch failed");
            if (skipped.length < REPO_ANALYSIS_LIMITS.maxSkipExamples) skipped.push({ path: node.path, reason: "GitHub file fetch failed" });
        }
    });

    await reportProgress(options, "source_analysis", 82, `Read ${contents.length} supported files; ${failedFetches} file reads failed.`);

    const deterministic = analyzeSourceFiles(contents);
    const extractedDependencies = extractRepositoryDependencies(contents);
    const dependencies = await enrichWithOsv(extractedDependencies);
    const dependencyCoverage = {
        reported: dependencies.length,
        truncated: dependencies.length >= 2_000,
        advisoryChecked: dependencies.filter((item) => item.advisoryState === "checked").length,
        advisoryUnavailable: dependencies.filter((item) => item.advisoryState === "unavailable").length,
        advisoryNotChecked: dependencies.filter((item) => item.advisoryState === "not-checked").length,
        advisoryLimit: 50,
    };
    await reportProgress(options, "dependency_advisories", 94, `Built source inventory and checked ${dependencies.filter((item) => item.advisoryState !== "not-checked").length} exact dependency versions against OSV.`);
    const completedAtMs = now();
    const partialReasons = new Set(["Existing GitHub file-size limit", "File exceeds analysis size limit", "Maximum analyzed-file count", "Analysis time limit", "Total content size limit", "GitHub file fetch failed"]);
    const status = treeResult.truncated || Object.keys(skipReasons).some((reason) => partialReasons.has(reason)) || deterministic.files.some((file) => file.analysisState === "parse-warning") ? "partial" : "complete";
    const coverage: AnalysisCoverage = {
        status,
        totalDiscoveredFiles: blobs.length,
        inspectedFiles: deterministic.files.length,
        skippedFiles: Object.values(skipReasons).reduce((sum, count) => sum + count, 0),
        skipReasons,
        skippedFileExamples: skipped,
        treeTruncated: treeResult.truncated,
        durationMs: Math.max(0, completedAtMs - startedAtMs),
        limits: {
            maxFiles: REPO_ANALYSIS_LIMITS.maxFiles,
            maxFileBytes: REPO_ANALYSIS_LIMITS.maxFileBytes,
            maxTotalBytes: REPO_ANALYSIS_LIMITS.maxTotalBytes,
            maxDurationMs: REPO_ANALYSIS_LIMITS.maxDurationMs,
        },
    };
    const analysis: RepositoryIntelligence = {
        owner,
        repo,
        branch,
        commitSha,
        analyzerVersion: REPO_INTELLIGENCE_VERSION,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date(completedAtMs).toISOString(),
        coverage,
        files: deterministic.files,
        technologies: deterministic.technologies,
        dependencies,
        dependencyCoverage,
        features: deterministic.features,
    };

    await reportProgress(options, "persisting", 97, "Persisting the versioned repository intelligence snapshot.");
    const stored = await prisma.repositoryIntelligence.upsert({
        where,
        create: {
            ...where.owner_repo_branch_commitSha_analyzerVersion_cacheScope,
            cacheScope,
            status,
            startedAt: new Date(startedAtMs),
            completedAt: new Date(completedAtMs),
            coverage: coverage as object,
            result: analysis as object,
            userId: isPrivate ? options.userId : null,
        },
        update: {
            status,
            startedAt: new Date(startedAtMs),
            completedAt: new Date(completedAtMs),
            coverage: coverage as object,
            result: analysis as object,
        },
        select: { id: true },
    });
    analysis.id = stored.id;
    return { analysis, cached: false };
}
