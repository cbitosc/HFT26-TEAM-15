import type { ArchitectureLayer, IntelligenceFile } from "./types";

export interface DependencyGraphNode {
    id: string;
    path: string;
    language: string;
    category: IntelligenceFile["category"];
    entryPoint: boolean;
    importCount: number;
    routeCount: number;
    kind: "module" | "external" | "unresolved";
    layer: ArchitectureLayer | "dependency" | "unresolved";
}

export interface DependencyGraphEdge {
    from: string;
    to: string;
    source: string;
    line: number;
    kind: "internal" | "external" | "unresolved";
}

export interface DependencyGraph {
    nodes: DependencyGraphNode[];
    edges: DependencyGraphEdge[];
    unresolved: number;
    truncated: boolean;
}

function candidates(path: string): string[] {
    const base = path.replace(/\.(?:[cm]?[jt]sx?|vue|svelte)$/i, "");
    return [path, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"].map((ext) => `${base}${ext}`),
        ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((file) => `${base}/${file}`)];
}

export function resolveSourceImport(from: string, source: string, filePaths: Set<string>, aliases: Record<string, string> = { "@/*": "src/*" }): string | undefined {
    const sourceAlias = Object.entries(aliases).find(([key]) => source === key || source.startsWith(key.replace(/\*$/, "")));
    let target: string;
    if (source.startsWith("./") || source.startsWith("../")) {
        const parts = from.split("/");
        parts.pop();
        for (const part of source.split("/")) {
            if (!part || part === ".") continue;
            if (part === "..") parts.pop();
            else parts.push(part);
        }
        target = parts.join("/");
    } else if (sourceAlias) {
        const [key, value] = sourceAlias;
        target = `${value.replace(/\*$/, "")}${source.slice(key.replace(/\*$/, "").length)}`.replace(/^\.\//, "");
    } else return undefined;
    return candidates(target).find((candidate) => filePaths.has(candidate));
}

/** Builds a bounded source graph. `tsconfigPaths` are optional aliases such as {"@/*":"src/*"}. */
export function buildDependencyGraph(files: IntelligenceFile[], options: { maxNodes?: number; maxEdges?: number; tsconfigPaths?: Record<string, string> } = {}): DependencyGraph {
    const maxNodes = options.maxNodes ?? 1500;
    const maxEdges = options.maxEdges ?? 5000;
    const selected = files.filter((file) => file.category === "source").slice(0, maxNodes);
    const byPath = new Set(selected.map((file) => file.path));
    const nodes: DependencyGraphNode[] = selected.map((file) => ({ id: file.path, path: file.path, language: file.language, category: file.category,
        entryPoint: file.entryPoint, importCount: file.imports.length, routeCount: file.routes.filter((route) => route.kind !== "layout").length, kind: "module", layer: file.layer }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: DependencyGraphEdge[] = [];
    let unresolved = 0;
    let nodeTruncated = false;
    const aliases = options.tsconfigPaths ?? { "@/*": "src/*" };
    for (const file of selected) {
        for (const imported of file.imports) {
            const internal = resolveSourceImport(file.path, imported.source, byPath, aliases);
            const unresolvedImport = imported.kind === "relative" || imported.kind === "internal";
            const kind: DependencyGraphEdge["kind"] = internal ? "internal" : unresolvedImport ? "unresolved" : "external";
            const nonModuleKind: "external" | "unresolved" = unresolvedImport ? "unresolved" : "external";
            if (kind === "unresolved") unresolved += 1;
            const target = internal ?? `${kind}:${imported.source}`;
            if (!internal && !nodeIds.has(target)) {
                if (nodes.length < maxNodes) {
                    nodes.push({ id: target, path: imported.source, language: nonModuleKind === "external" ? "External" : "Unresolved", category: "manifest", entryPoint: false, importCount: 0, routeCount: 0, kind: nonModuleKind, layer: nonModuleKind === "external" ? "dependency" : "unresolved" });
                    nodeIds.add(target);
                } else nodeTruncated = true;
            }
            if (edges.length < maxEdges) edges.push({ from: file.path, to: target, source: imported.source, line: imported.line, kind });
        }
    }
    return { nodes, edges, unresolved, truncated: nodeTruncated || files.filter((file) => file.category === "source").length > maxNodes || files.reduce((count, file) => count + file.imports.length, 0) > maxEdges };
}
