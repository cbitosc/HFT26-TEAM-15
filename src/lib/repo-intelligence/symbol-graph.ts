import type { IntelligenceFile, SourceSymbol } from "./types";
import { resolveSourceImport } from "./graph";

export type ArchitectureNodeKind = "file" | "function" | "class";
export type ArchitectureEdgeKind = "contains" | "calls" | "constructs";

export interface ArchitectureNode {
    id: string;
    kind: ArchitectureNodeKind;
    path: string;
    label: string;
    line?: number;
    exported?: boolean;
}

export interface ArchitectureEdge {
    id: string;
    from: string;
    to: string;
    kind: ArchitectureEdgeKind;
    lines: number[];
    count: number;
}

export interface ArchitectureGraph {
    nodes: ArchitectureNode[];
    edges: ArchitectureEdge[];
    truncated: boolean;
    ambiguousCalls: number;
}

function fileId(path: string): string { return `file:${path}`; }
function symbolId(path: string, symbol: SourceSymbol): string { return `symbol:${path}:${symbol.name}:${symbol.line}`; }
function basename(path: string): string { return path.split("/").at(-1) ?? path; }

/** Build a bounded file/symbol/call graph. Calls are emitted only when the target resolves uniquely. */
export function buildArchitectureGraph(files: IntelligenceFile[], options: { maxNodes?: number; maxEdges?: number } = {}): ArchitectureGraph {
    const maxNodes = options.maxNodes ?? 2500;
    const maxEdges = options.maxEdges ?? 5000;
    const nodes: ArchitectureNode[] = [];
    const fileNodes = new Map<string, string>();
    type SymbolNodeRef = { nodeId: string; path: string; symbol: SourceSymbol };
    let truncated = false;

    for (const file of files) {
        if (nodes.length >= maxNodes) { truncated = true; break; }
        const id = fileId(file.path);
        nodes.push({ id, kind: "file", path: file.path, label: basename(file.path) });
        fileNodes.set(file.path, id);
    }

    const byFileAndName = new Map<string, SymbolNodeRef[]>();
    const addFileSymbol = (key: string, value: SymbolNodeRef) => {
        const values = byFileAndName.get(key) ?? [];
        values.push(value);
        byFileAndName.set(key, values);
    };

    let ambiguousCalls = 0;
    for (const file of files) {
        if (!fileNodes.has(file.path)) continue;
        for (const symbol of file.symbols) {
            if (symbol.kind !== "function" && symbol.kind !== "route-handler" && symbol.kind !== "class") continue;
            if (nodes.length >= maxNodes) { truncated = true; break; }
            const id = symbolId(file.path, symbol);
            const kind: ArchitectureNodeKind = symbol.kind === "class" ? "class" : "function";
            nodes.push({ id, kind, path: file.path, label: symbol.name, line: symbol.line, exported: symbol.exported });
            const ref = { nodeId: id, path: file.path, symbol };
            addFileSymbol(`${file.path}\0${symbol.name}`, ref);
            const shortName = symbol.name.split(".").at(-1)!;
            if (shortName !== symbol.name) addFileSymbol(`${file.path}\0short:${shortName}`, ref);
        }
    }

    const edgeMap = new Map<string, ArchitectureEdge>();
    const paths = new Set(fileNodes.keys());
    const resolveCandidates = (file: IntelligenceFile, targetName: string): SymbolNodeRef[] => {
        const local = byFileAndName.get(`${file.path}\0${targetName}`) ?? [];
        if (local.length) return local;
        const shortName = targetName.split(".").at(-1)!;
        const localShort = byFileAndName.get(`${file.path}\0short:${shortName}`) ?? [];
        if (localShort.length) return localShort;
        const segments = targetName.split(".");
        const localBinding = segments[0];
        const suffix = segments.slice(1).join(".");
        const found = new Map<string, SymbolNodeRef>();
        for (const imported of file.imports) {
            for (const binding of imported.bindings ?? []) {
                if (binding.local !== localBinding) continue;
                const importedPath = resolveSourceImport(file.path, imported.source, paths);
                if (!importedPath) continue;
                const importedName = binding.imported === "*" ? suffix : [binding.imported, suffix].filter(Boolean).join(".");
                const candidates = binding.imported === "default"
                    ? files.find((candidate) => candidate.path === importedPath)?.symbols
                        .filter((symbol) => symbol.exported && (symbol.kind === "class" || symbol.kind === "function" || symbol.kind === "route-handler"))
                        .flatMap((symbol) => byFileAndName.get(`${importedPath}\0${suffix ? `${symbol.name}.${suffix}` : symbol.name}`) ?? []) ?? []
                    : byFileAndName.get(`${importedPath}\0${importedName}`) ?? [];
                for (const candidate of candidates) found.set(candidate.nodeId, candidate);
            }
        }
        return Array.from(found.values());
    };
    const addEdge = (from: string, to: string, kind: ArchitectureEdgeKind, line?: number) => {
        const key = `${from}\0${to}\0${kind}`;
        const existing = edgeMap.get(key);
        if (existing) {
            existing.count += 1;
            if (line && existing.lines.length < 5 && !existing.lines.includes(line)) existing.lines.push(line);
            return;
        }
        if (edgeMap.size >= maxEdges) { truncated = true; return; }
        edgeMap.set(key, { id: key, from, to, kind, lines: line ? [line] : [], count: 1 });
    };

    for (const file of files) {
        const sourceFileId = fileNodes.get(file.path);
        if (!sourceFileId) continue;
        for (const symbol of file.symbols) {
            if (symbol.kind !== "function" && symbol.kind !== "route-handler" && symbol.kind !== "class") continue;
            for (const target of byFileAndName.get(`${file.path}\0${symbol.name}`) ?? []) addEdge(sourceFileId, target.nodeId, "contains", symbol.line);
        }
        for (const call of file.calls ?? []) {
            const callers = call.caller ? byFileAndName.get(`${file.path}\0${call.caller}`) ?? [] : [];
            const callerId = callers.length === 1 ? callers[0].nodeId : sourceFileId;
            const candidates = resolveCandidates(file, call.target);
            const typeFiltered = call.kind === "construct" ? candidates.filter((candidate) => candidate.symbol.kind === "class") : candidates;
            const unique = new Map(typeFiltered.map((candidate) => [candidate.nodeId, candidate]));
            if (unique.size !== 1) {
                if (unique.size > 1) {
                    // A same-name symbol in multiple files is not enough evidence to invent a call edge.
                    ambiguousCalls += 1;
                }
                continue;
            }
            const target = Array.from(unique.values())[0];
            if (target.nodeId === callerId && call.caller) continue;
            addEdge(callerId, target.nodeId, call.kind === "construct" || target.symbol.kind === "class" ? "constructs" : "calls", call.line);
        }
    }

    return { nodes, edges: Array.from(edgeMap.values()), truncated, ambiguousCalls };
}
