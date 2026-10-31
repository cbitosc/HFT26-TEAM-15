import { describe, expect, it } from "vitest";
import { analyzeSourceFiles } from "./analyzer";
import { buildArchitectureGraph } from "./symbol-graph";

describe("buildArchitectureGraph", () => {
    it("connects file nodes to symbols and uniquely resolved call/constructor targets", () => {
        const files = analyzeSourceFiles([
            { path: "src/entry.ts", sha: "entry", size: 140, content: 'import { helper as assist, Worker as Runner } from "./worker";\nexport function boot() { assist(); new Runner(); new Runner().run(); }' },
            { path: "src/worker.ts", sha: "worker", size: 80, content: "export function helper() {}\nexport class Worker { run() { helper(); } }" },
        ]).files;
        const graph = buildArchitectureGraph(files);
        const boot = graph.nodes.find((node) => node.path === "src/entry.ts" && node.label === "boot");
        const helper = graph.nodes.find((node) => node.path === "src/worker.ts" && node.label === "helper");
        const worker = graph.nodes.find((node) => node.path === "src/worker.ts" && node.label === "Worker");
        const workerRun = graph.nodes.find((node) => node.path === "src/worker.ts" && node.label === "Worker.run");

        expect(boot?.kind).toBe("function");
        expect(helper?.kind).toBe("function");
        expect(worker?.kind).toBe("class");
        expect(graph.edges).toContainEqual(expect.objectContaining({ from: boot?.id, to: helper?.id, kind: "calls" }));
        expect(graph.edges).toContainEqual(expect.objectContaining({ from: boot?.id, to: worker?.id, kind: "constructs" }));
        expect(graph.edges).toContainEqual(expect.objectContaining({ from: boot?.id, to: workerRun?.id, kind: "calls" }));
        expect(graph.edges.some((edge) => edge.kind === "contains" && edge.to === boot?.id)).toBe(true);
    });

    it("omits ambiguous same-name call targets and enforces node limits", () => {
        const files = analyzeSourceFiles([
            { path: "a.ts", sha: "a", size: 120, content: "class First { parse() {} }\nclass Second { parse() {} }\nfunction run() { parse(); }" },
        ]).files;
        expect(files[0].calls).toContainEqual(expect.objectContaining({ target: "parse" }));
        const ambiguous = buildArchitectureGraph(files);
        expect(ambiguous.ambiguousCalls).toBeGreaterThan(0);
        expect(ambiguous.edges.some((edge) => edge.kind === "calls")).toBe(false);
        expect(buildArchitectureGraph(files, { maxNodes: 1 }).truncated).toBe(true);
    });

    it("does not invent cross-file call links without an import relationship", () => {
        const files = analyzeSourceFiles([
            { path: "caller.ts", sha: "caller", size: 40, content: "function run() { helper(); }" },
            { path: "helper.ts", sha: "helper", size: 20, content: "export function helper() {}" },
        ]).files;
        const graph = buildArchitectureGraph(files);
        expect(graph.edges.some((edge) => edge.kind === "calls")).toBe(false);
    });
});
