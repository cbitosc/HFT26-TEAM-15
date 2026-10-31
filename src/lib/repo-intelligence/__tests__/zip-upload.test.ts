import { describe, expect, it, vi } from "vitest";

vi.mock("../dependencies", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../dependencies")>();
    return { ...actual, enrichWithOsv: vi.fn(async (dependencies) => dependencies) };
});

import { analyzeZip, ZipUploadError, ZIP_UPLOAD_LIMITS } from "../zip-upload";

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Record<string, string>): Buffer {
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const [fileName, text] of Object.entries(entries)) {
        const name = Buffer.from(fileName);
        const data = Buffer.from(text);
        const checksum = crc32(data);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt32LE(checksum, 14);
        header.writeUInt32LE(data.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(name.length, 26);
        const record = Buffer.concat([header, name, data]);
        local.push(record);

        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(0x02014b50, 0);
        directory.writeUInt16LE(20, 4);
        directory.writeUInt16LE(20, 6);
        directory.writeUInt32LE(checksum, 16);
        directory.writeUInt32LE(data.length, 20);
        directory.writeUInt32LE(data.length, 24);
        directory.writeUInt16LE(name.length, 28);
        directory.writeUInt32LE(offset, 42);
        central.push(Buffer.concat([directory, name]));
        offset += record.length;
    }
    const centralBytes = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(entries).length, 8);
    end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(centralBytes.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, centralBytes, end]);
}

describe("analyzeZip", () => {
    it("extracts supported files and reports source, technologies, and dependencies", async () => {
        const result = await analyzeZip(zip({
            "demo/src/index.ts": 'import { start } from "./start";\nexport function main() { return start(); }',
            "demo/src/start.ts": "export const start = () => true;",
            "demo/package.json": JSON.stringify({ dependencies: { react: "18.2.0" } }),
        }), "demo.zip");

        expect(result.name).toBe("demo");
        expect(result.analysis.files.map((file) => file.path)).toContain("demo/src/index.ts");
        expect(result.analysis.dependencies).toContainEqual(expect.objectContaining({ name: "react", version: "18.2.0" }));
        expect(result.sources["demo/src/index.ts"]).toContain("function main");
        expect(result.analysis.coverage.inspectedFiles).toBe(3);
    });

    it("rejects archive paths that could escape the repository root", async () => {
        await expect(analyzeZip(zip({ "../outside.ts": "export const secret = true;" }), "unsafe.zip"))
            .rejects.toBeInstanceOf(ZipUploadError);
    });

    it("marks binary supported files as partial coverage", async () => {
        const result = await analyzeZip(zip({ "demo/src/index.ts": "export const marker = 'ok';", "demo/src/binary.ts": "\u0000binary" }), "demo.zip");
        expect(result.analysis.coverage.status).toBe("partial");
        expect(result.analysis.coverage.skippedFiles).toBe(1);
        expect(result.analysis.coverage.skipReasons["Binary content"]).toBe(1);
    });

    it("rejects archives larger than the compressed upload limit", async () => {
        await expect(analyzeZip(Buffer.alloc(ZIP_UPLOAD_LIMITS.compressedBytes + 1), "large.zip"))
            .rejects.toMatchObject({ status: 413 });
    });
});
