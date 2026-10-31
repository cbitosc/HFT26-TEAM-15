import { describe, expect, it } from "vitest";
import { buildDependencyGraph } from "./graph";
import type { IntelligenceFile } from "./types";

const file = (path: string, imports: IntelligenceFile["imports"] = [], entryPoint = false): IntelligenceFile => ({
    path, blobSha: "sha", size: 10, lineCount: 1, language: "TypeScript", layer: "domain", category: "source", analysisState: "analyzed",
    entryPoint, imports, symbols: [], calls: [], routes: [],
});

describe("buildDependencyGraph", () => {
    it("resolves relative and tsconfig alias edges while preserving external dependencies", () => {
        const graph = buildDependencyGraph([
            file("src/app/page.tsx", [{ source: "../lib/card", line: 2, kind: "relative" }, { source: "@/lib/util", line: 3, kind: "internal" }, { source: "react", line: 4, kind: "external" }], true),
            file("src/lib/card.tsx"), file("src/lib/util.ts"),
        ], { tsconfigPaths: { "@/*": "src/*" } });
        expect(graph.edges.map(({ kind, to }) => [kind, to])).toEqual([
            ["internal", "src/lib/card.tsx"], ["internal", "src/lib/util.ts"], ["external", "external:react"],
        ]);
        expect(graph.nodes.find((node) => node.path === "src/app/page.tsx")?.entryPoint).toBe(true);
        expect(graph.nodes.find((node) => node.path === "react")?.kind).toBe("external");
        expect(graph.unresolved).toBe(0);
    });

    it("reports unresolved internal edges and enforces bounds", () => {
        const graph = buildDependencyGraph([file("a.ts", [{ source: "./missing", line: 1, kind: "relative" }])], { maxNodes: 1, maxEdges: 0 });
        expect(graph.nodes).toHaveLength(1);
        expect(graph.edges).toHaveLength(0);
        expect(graph.unresolved).toBe(1);
    });
});
