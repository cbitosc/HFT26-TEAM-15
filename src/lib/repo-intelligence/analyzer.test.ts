import { describe, expect, it } from "vitest";
import { analyzeSourceFiles } from "./analyzer";

describe("analyzeSourceFiles", () => {
    it("extracts imports, exports, Next App Router handlers and evidence-backed routes", () => {
        const result = analyzeSourceFiles([
            {
                path: "src/app/api/widgets/route.ts",
                sha: "blob-route",
                size: 92,
                content: [
                    'import { NextResponse } from "next/server";',
                    'import { listWidgets } from "@/lib/widgets";',
                    "export async function GET() { return NextResponse.json(await listWidgets()); }",
                    "export async function POST() { return NextResponse.json({ ok: true }); }",
                ].join("\n"),
            },
            {
                path: "src/lib/widgets.ts",
                sha: "blob-widgets",
                size: 44,
                content: "export function listWidgets() { return []; }",
            },
        ]);

        const route = result.files.find((file) => file.path.endsWith("route.ts"));
        expect(route?.routes).toEqual([{ path: "/api/widgets", kind: "route-handler", methods: ["GET", "POST"], line: 3 }]);
        expect(route?.imports.map((item) => [item.source, item.kind])).toEqual([
            ["next/server", "external"],
            ["@/lib/widgets", "internal"],
        ]);
        expect(route?.entryPoint).toBe(true);
        expect(result.features[0]).toMatchObject({ title: "API route: /api/widgets (GET, POST)", confidence: "high" });
        expect(result.features[0].evidence[0]).toMatchObject({ path: "src/app/api/widgets/route.ts", kind: "route", observed: true });
    });

    it("does not turn README-only claims into implementation features", () => {
        const result = analyzeSourceFiles([
            { path: "README.md", sha: "readme", size: 40, content: "This repository implements payments and authentication." },
            { path: "src/app/page.tsx", sha: "page", size: 30, content: "export default function Home() { return null; }" },
        ]);

        expect(result.features.map((feature) => feature.title)).toEqual(["Page: /"]);
        expect(result.technologies.some((technology) => technology.name === "payments" || technology.name === "authentication")).toBe(false);
    });

    it("marks malformed source as a parse warning instead of inventing symbols", () => {
        const result = analyzeSourceFiles([
            { path: "src/broken.ts", sha: "bad", size: 20, content: "export function broken( {" },
        ]);

        expect(result.files[0].analysisState).toBe("parse-warning");
        expect(result.files[0].warning).toBeTruthy();
        expect(result.files[0].symbols).toEqual([]);
    });

    it("does not mark local declarations inside exported functions as exported", () => {
        const result = analyzeSourceFiles([
            { path: "src/lib/example.ts", sha: "example", size: 80, content: "export function outer() { function local() {} const value = 1; }" },
        ]);

        expect(result.files[0].symbols.find((symbol) => symbol.name === "outer")?.exported).toBe(true);
        expect(result.files[0].symbols.find((symbol) => symbol.name === "local")?.exported).toBe(false);
        expect(result.files[0].symbols.find((symbol) => symbol.name === "value")?.exported).toBe(false);
    });

    it("extracts class methods and direct function/constructor calls", () => {
        const result = analyzeSourceFiles([
            { path: "src/entry.ts", sha: "entry", size: 80, content: "export function boot() { helper(); new Worker(); }" },
            { path: "src/worker.ts", sha: "worker", size: 90, content: "export function helper() {}\nexport class Worker { run() { helper(); } }" },
        ]);

        expect(result.files[0].calls).toEqual(expect.arrayContaining([
            expect.objectContaining({ caller: "boot", target: "helper", kind: "call" }),
            expect.objectContaining({ caller: "boot", target: "Worker", kind: "construct" }),
        ]));
        expect(result.files[1].symbols).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: "Worker", kind: "class" }),
            expect.objectContaining({ name: "Worker.run", kind: "function" }),
        ]));
        expect(result.files[1].calls).toContainEqual(expect.objectContaining({ caller: "Worker.run", target: "helper", kind: "call" }));
    });

    it("classifies Python imports and symbols deterministically", () => {
        const result = analyzeSourceFiles([
            { path: "service.py", sha: "py", size: 42, content: "import os\nfrom flask import Flask\n\ndef create_app():\n    return Flask(__name__)" },
        ]);

        expect(result.files[0].language).toBe("Python");
        expect(result.files[0].imports.map((item) => item.source)).toEqual(["os", "flask"]);
        expect(result.files[0].symbols.map((item) => item.name)).toContain("create_app");
        expect(result.technologies.some((item) => item.name === "flask" && item.ecosystem === "PyPI")).toBe(true);
        expect(result.technologies.some((item) => item.name === "os")).toBe(false);
    });

    it("reports technologies as declared when they are not imported in inspected source", () => {
        const result = analyzeSourceFiles([
            { path: "package.json", sha: "pkg", size: 60, content: JSON.stringify({ dependencies: { react: "^19.0.0" }, devDependencies: { vite: "^7.0.0" } }) },
        ]);

        expect(result.technologies).toHaveLength(2);
        expect(result.technologies[0].evidence[0]).toMatchObject({ kind: "manifest", strength: "medium" });
        expect(result.files[0].layer).toBe("configuration");
    });
});
