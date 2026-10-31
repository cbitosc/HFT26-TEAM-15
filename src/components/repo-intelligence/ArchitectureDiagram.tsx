"use client";

import { useMemo, useState } from "react";
import type { ArchitectureGraph as ArchitectureGraphData } from "@/lib/repo-intelligence/symbol-graph";

interface Props {
    graph: ArchitectureGraphData;
    onSelectFile: (path: string, line?: number) => void;
    title?: string;
}

const NODE_WIDTH = 236;
const NODE_HEIGHT = 54;
const COLUMN_GAP = 270;
const ROW_GAP = 88;
const COLUMNS = 5;

export function ArchitectureDiagram({ graph, onSelectFile, title = "Architecture diagram" }: Props) {
    const [filter, setFilter] = useState("");
    const [view, setView] = useState<"architecture" | "flow">("architecture");
    const entryPointNodes = graph.nodes.filter((node) => node.kind === "file" && node.entryPoint);
    const flowDepths = useMemo(() => {
        const adjacency = new Map<string, string[]>();
        for (const edge of graph.edges) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
        const queue = entryPointNodes.map((node) => node.id);
        const depths = new Map(queue.map((id) => [id, 0]));
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const current = queue[cursor];
            for (const target of adjacency.get(current) ?? []) {
                if (depths.has(target)) continue;
                depths.set(target, (depths.get(current) ?? 0) + 1);
                queue.push(target);
            }
        }
        return { depths, order: queue };
    }, [entryPointNodes, graph.edges]);

    const visibleNodes = useMemo(() => {
        const candidates = view === "flow"
            ? flowDepths.order.map((id) => graph.nodes.find((node) => node.id === id)).filter((node): node is ArchitectureGraphData["nodes"][number] => Boolean(node))
            : graph.nodes;
        const needle = filter.trim().toLowerCase();
        if (!needle) return candidates;
        const matched = new Set(candidates.filter((node) => `${node.kind} ${node.label} ${node.path} ${node.entryPointEvidence?.map((item) => item.description).join(" ") ?? ""}`.toLowerCase().includes(needle)).map((node) => node.id));
        const seeds = new Set(matched);
        for (const edge of graph.edges) {
            if (seeds.has(edge.from)) matched.add(edge.to);
            if (seeds.has(edge.to)) matched.add(edge.from);
        }
        return candidates.filter((node) => matched.has(node.id));
    }, [filter, flowDepths.order, graph.edges, graph.nodes, view]);

    const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
    const visibleEdges = useMemo(() => graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)), [graph.edges, visibleIds]);
    const positions = useMemo(() => {
        if (view === "flow") {
            const rows = new Map<number, number>();
            return new Map(visibleNodes.map((node) => {
                const depth = flowDepths.depths.get(node.id) ?? 0;
                const row = rows.get(depth) ?? 0;
                rows.set(depth, row + 1);
                return [node.id, { x: 125 + depth * COLUMN_GAP, y: 35 + row * ROW_GAP }];
            }));
        }
        return new Map(visibleNodes.map((node, index) => [node.id, {
            x: 125 + (index % COLUMNS) * COLUMN_GAP,
            y: 35 + Math.floor(index / COLUMNS) * ROW_GAP,
        }]));
    }, [flowDepths.depths, view, visibleNodes]);
    const maxDepth = Math.max(0, ...visibleNodes.map((node) => flowDepths.depths.get(node.id) ?? 0));
    const maxRows = view === "flow"
        ? Math.max(1, ...Array.from({ length: maxDepth + 1 }, (_, depth) => visibleNodes.filter((node) => flowDepths.depths.get(node.id) === depth).length))
        : Math.ceil(visibleNodes.length / COLUMNS);
    const height = Math.max(130, maxRows * ROW_GAP + 30);
    const width = view === "flow" ? Math.max(COLUMN_GAP + 20, (maxDepth + 1) * COLUMN_GAP + 20) : COLUMNS * COLUMN_GAP + 20;

    return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h2 className="text-lg font-medium">{title}</h2>
                <p className="mt-1 text-xs text-zinc-500">{visibleNodes.length} nodes · {visibleEdges.length} directed links · {graph.ambiguousCalls} ambiguous calls omitted</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <select aria-label="Graph view" value={view} onChange={(event) => setView(event.target.value as "architecture" | "flow")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <option value="architecture">Architecture graph</option>
                    <option value="flow">Data flow (static call paths)</option>
                </select>
                <input aria-label="Filter architecture nodes" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files, functions, classes" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400" aria-label="Architecture diagram legend">
            <span><i className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-blue-900" />{view === "flow" ? "Entry point" : "File"}</span>
            <span><i className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-zinc-700" />Function</span>
            <span><i className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-rose-950" />Class</span>
            <span>{view === "flow" ? "Arrows follow statically resolved calls from detected entry points. This does not track individual variable values." : "Solid arrows show calls or constructors; dotted arrows link files to symbols. Dynamic calls are not inferred."}</span>
        </div>
        <div className="mt-3 rounded-xl border border-zinc-800 bg-black/20 p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Detected entry points ({entryPointNodes.length})</h3>
            {entryPointNodes.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No entry points were identified from the inspected source evidence.</p> : <div className="mt-2 flex flex-wrap gap-2">
                {entryPointNodes.slice(0, 30).map((node) => <button key={node.id} type="button" onClick={() => onSelectFile(node.path, node.entryPointEvidence?.[0]?.line)} className="rounded-lg border border-blue-900/70 bg-blue-950/40 px-2.5 py-1.5 text-left text-xs text-blue-100 hover:border-blue-500/70">
                    <span className="block font-medium">{node.path}</span>
                    <span className="mt-0.5 block text-blue-200/70">{node.entryPointEvidence?.map((item) => `${item.kind}: ${item.description}`).join(" · ")}</span>
                </button>)}
            </div>}
            {entryPointNodes.length > 30 && <p className="mt-2 text-xs text-zinc-500">Showing the first 30 detected entry points.</p>}
        </div>
        {graph.truncated && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">The graph reached its node or edge safety limit. Filter by file, function, or class to inspect a smaller part.</p>}
        <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-zinc-800 bg-black/40">
            {visibleNodes.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">{view === "flow" && entryPointNodes.length === 0 ? "No execution flow can be shown because no entry points were detected." : "No files or symbols match this filter."}</p> : <svg role="img" aria-label={`${title} with ${visibleNodes.length} files, functions, and classes`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="min-w-full">
                <title>{view === "flow" ? "Static call flow from detected entry points. Select a node to open its source." : "Directed file and symbol graph. Select a node to open its source file."}</title>
                <defs><marker id="architecture-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" /></marker></defs>
                <g aria-hidden="true">{visibleEdges.map((edge) => {
                    const from = positions.get(edge.from);
                    const to = positions.get(edge.to);
                    if (!from || !to) return null;
                    const contained = edge.kind === "contains";
                    const stroke = contained ? "#3f3f46" : edge.kind === "constructs" ? "#c084fc" : "#60a5fa";
                    const path = view === "flow"
                        ? `M ${from.x + NODE_WIDTH / 2} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x - NODE_WIDTH / 2} ${to.y}`
                        : `M ${from.x} ${from.y + NODE_HEIGHT / 2} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y - NODE_HEIGHT / 2}`;
                    return <g key={edge.id}><path d={path} fill="none" stroke={stroke} strokeWidth={contained ? 1 : 1.7} strokeDasharray={contained ? "4 4" : undefined} markerEnd="url(#architecture-arrowhead)" /><title>{`${edge.kind}: ${edge.count} reference(s)${edge.lines.length ? ` near line ${edge.lines.join(", ")}` : ""}`}</title></g>;
                })}</g>
                {visibleNodes.map((node) => {
                    const point = positions.get(node.id)!;
                    const fill = node.kind === "file" ? "#172554" : node.kind === "class" ? "#4c1d35" : "#27272a";
                    const stroke = node.kind === "file" ? (node.entryPoint ? "#38bdf8" : "#3b82f6") : node.kind === "class" ? "#be185d" : "#52525b";
                    const primary = node.kind === "file" ? `${node.entryPoint ? "Entry: " : ""}${node.label}` : `${node.kind}: ${node.label}`;
                    const secondary = node.kind === "file" ? node.path : `${node.path}${node.line ? `:${node.line}` : ""}`;
                    const shorten = (text: string, limit: number) => text.length > limit ? `…${text.slice(-(limit - 1))}` : text;
                    return <g key={node.id} role="button" tabIndex={0} aria-label={`${primary}, ${secondary}`} onClick={() => onSelectFile(node.path, node.line)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectFile(node.path, node.line); } }} className="cursor-pointer">
                        <rect x={point.x - NODE_WIDTH / 2} y={point.y - NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx="9" fill={fill} stroke={stroke} />
                        <text x={point.x} y={point.y - 5} fill="#f4f4f5" textAnchor="middle" fontSize="12">{shorten(primary, 30)}</text>
                        <text x={point.x} y={point.y + 15} fill="#a1a1aa" textAnchor="middle" fontSize="10">{shorten(secondary, 36)}</text>
                    </g>;
                })}
            </svg>}
        </div>
        {graph.ambiguousCalls > 0 && <p className="mt-2 text-xs text-zinc-500">Calls with same-name targets in multiple files are omitted rather than guessed. The graph shows statically recognized calls only.</p>}
    </section>;
}
