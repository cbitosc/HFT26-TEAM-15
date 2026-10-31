"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDependencyGraph } from "@/lib/repo-intelligence/graph";
import { buildArchitectureGraph } from "@/lib/repo-intelligence/symbol-graph";
import { ArchitectureDiagram } from "@/components/repo-intelligence/ArchitectureDiagram";
import type { RepositoryIntelligence } from "@/lib/repo-intelligence/types";

interface Props { owner: string; repo: string }
type ApiResult = { analysis: RepositoryIntelligence | null; cached?: boolean; error?: string };
type JobState = { id: string; status: string; progress: number; stage: string; message: string; error?: string };

export function IntelligenceWorkspace({ owner, repo }: Props) {
    const [analysis, setAnalysis] = useState<RepositoryIntelligence | null>(null);
    const [loading, setLoading] = useState(false);
    const [job, setJob] = useState<JobState | null>(null);
    const [activeRequestKey, setActiveRequestKey] = useState("");
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [selectedPath, setSelectedPath] = useState("");
    const [selectedLine, setSelectedLine] = useState<number | undefined>();
    const [sourceContent, setSourceContent] = useState("");
    const [sourceLoading, setSourceLoading] = useState(false);
    const [sourceError, setSourceError] = useState("");
    const [edgeFilter, setEdgeFilter] = useState("all");
    const [graphLanguage, setGraphLanguage] = useState("all");
    const [graphLayer, setGraphLayer] = useState("all");
    const [graphPathPrefix, setGraphPathPrefix] = useState("");
    const [graphNodeType, setGraphNodeType] = useState("all");

    const load = useCallback(async (forceRefresh = false) => {
        setLoading(true); setError("");
        try {
            const requestKey = crypto.randomUUID();
            setActiveRequestKey(requestKey);
            const response = await fetch("/api/repo-intelligence", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ owner, repo, forceRefresh, requestKey }),
            });
            const data = await response.json() as { job?: JobState; error?: string };
            if (!response.ok || !data.job) throw new Error(data.error ?? "Analysis could not be queued.");
            let current = data.job;
            setJob(current);
            for (let attempt = 0; attempt < 55; attempt += 1) {
                if (["completed", "partial", "failed", "cancelled"].includes(current.status)) break;
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const poll = await fetch(`/api/repo-intelligence?jobId=${encodeURIComponent(current.id)}`, { cache: "no-store" });
                const update = await poll.json() as { job?: JobState; error?: string };
                if (!poll.ok || !update.job) throw new Error(update.error ?? "Analysis job status could not be loaded.");
                current = update.job;
                setJob(current);
            }
            if (current.status === "failed") throw new Error(current.message || "Repository analysis failed.");
            if (current.status === "cancelled") throw new Error("Repository analysis was cancelled.");
            if (!["completed", "partial"].includes(current.status)) throw new Error("Analysis is still running. Return shortly and refresh to see its saved result.");
            const snapshot = await fetch(`/api/repo-intelligence?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`, { cache: "no-store" });
            const result = await snapshot.json() as ApiResult;
            if (!snapshot.ok || !result.analysis) throw new Error(result.error ?? "Analysis completed but the result could not be loaded.");
            setAnalysis(result.analysis);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Repository analysis failed."); }
        finally { setLoading(false); }
    }, [owner, repo]);

    const cancel = async () => {
        if (!job?.id) return;
        try { await fetch("/api/repo-intelligence", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: job.id, requestKey: activeRequestKey }) }); }
        finally { setJob((current) => current ? { ...current, status: "cancelled", message: "Analysis cancelled by the user." } : current); setLoading(false); }
    };

    useEffect(() => {
        let active = true;
        fetch(`/api/repo-intelligence?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
            .then(async (response) => response.ok ? response.json() as Promise<ApiResult> : null)
            .then((data) => { if (active && data?.analysis) setAnalysis(data.analysis); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [owner, repo]);

    useEffect(() => {
        if (!analysis?.id || !selectedPath) { setSourceContent(""); setSourceError(""); return; }
        const controller = new AbortController();
        setSourceLoading(true); setSourceError("");
        const params = new URLSearchParams({ analysisId: analysis.id, owner, repo, path: selectedPath });
        fetch(`/api/repo-intelligence/source?${params}`, { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const data = await response.json() as { content?: string; error?: string };
                if (!response.ok || typeof data.content !== "string") throw new Error(data.error ?? "Source preview is unavailable.");
                setSourceContent(data.content);
            })
            .catch((caught) => { if (!controller.signal.aborted) setSourceError(caught instanceof Error ? caught.message : "Source preview is unavailable."); })
            .finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
        return () => controller.abort();
    }, [analysis?.id, owner, repo, selectedPath]);

    useEffect(() => {
        if (sourceLoading || !sourceContent || !selectedLine) return;
        document.getElementById(`source-line-${selectedLine}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [sourceContent, sourceLoading, selectedLine, selectedPath]);

    const selectFile = (path: string, line?: number) => {
        setSelectedPath(path);
        setSelectedLine(line);
    };

    const graph = useMemo(() => analysis ? buildDependencyGraph(analysis.files) : null, [analysis]);
    const architectureGraph = useMemo(() => analysis ? buildArchitectureGraph(analysis.files) : null, [analysis]);
    const visibleFiles = useMemo(() => (analysis?.files ?? []).filter((file) =>
        (category === "all" || file.category === category) && file.path.toLowerCase().includes(query.toLowerCase())), [analysis, category, query]);
    const visibleGraph = useMemo(() => {
        if (!graph) return null;
        const prefix = graphPathPrefix.trim().toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
        const nodes = graph.nodes.filter((node) =>
            (graphLanguage === "all" || node.language === graphLanguage) &&
            (graphLayer === "all" || node.layer === graphLayer) &&
            (!prefix || node.kind !== "module" || node.path.toLowerCase() === prefix || node.path.toLowerCase().startsWith(`${prefix}/`)) &&
            (graphNodeType === "all" || (graphNodeType === "entry" ? node.entryPoint : graphNodeType === "routes" ? node.routeCount > 0 : node.kind === graphNodeType ||
                (node.kind === "module" && graph.edges.some((edge) => edge.from === node.id && edge.kind === graphNodeType)))),
        );
        const ids = new Set(nodes.map((node) => node.id));
        const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
        return { ...graph, nodes, edges };
    }, [graph, graphLanguage, graphLayer, graphPathPrefix, graphNodeType]);
    const displayGraph = useMemo(() => visibleGraph ? { ...visibleGraph, edges: visibleGraph.edges.filter((edge) => edgeFilter === "all" || edge.kind === edgeFilter) } : null, [visibleGraph, edgeFilter]);
    const visibleEdges = displayGraph?.edges ?? [];
    const selected = analysis?.files.find((file) => file.path === selectedPath);

    return <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div><h2 className="font-medium">Source snapshot</h2><p className="mt-1 text-sm text-zinc-500">{analysis ? `${analysis.branch} · ${analysis.commitSha.slice(0, 10)} · ${analysis.coverage.status} coverage` : "No saved analysis yet."}</p></div>
            <div className="flex gap-2">{loading && <button type="button" onClick={() => void cancel()} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300">Cancel</button>}<button type="button" onClick={() => void load(Boolean(analysis))} disabled={loading} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:cursor-wait disabled:opacity-60">{loading ? "Analyzing repository…" : analysis ? "Refresh analysis" : "Analyze repository"}</button></div>
        </div>
        {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {loading && <div role="status" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><div className="flex justify-between gap-3 text-sm"><span className="text-zinc-200">{job?.message ?? "Queueing repository analysis."}</span><span className="text-zinc-500">{job?.progress ?? 0}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-blue-400 transition-all" style={{ width: `${job?.progress ?? 0}%` }} /></div><p className="mt-2 text-xs text-zinc-500">Stage: {job?.stage ?? "queued"}. Progress is reported from completed analysis stages.</p></div>}
        {analysis && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[["Inspected files", analysis.coverage.inspectedFiles], ["Skipped files", analysis.coverage.skippedFiles], ["Technologies", analysis.technologies.length], ["Dependencies", analysis.dependencies.length]].map(([label, count]) => <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><div className="text-2xl font-semibold">{count}</div><div className="mt-1 text-xs text-zinc-500">{label}</div></div>)}
            </div>
            {analysis.coverage.status === "partial" && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Partial coverage: {Object.entries(analysis.coverage.skipReasons).map(([reason, count]) => `${reason} (${count})`).join(" · ") || "some repository files could not be inspected"}. Results describe inspected files only.</div>}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-medium">Module graph</h2><p className="text-xs text-zinc-500">{visibleGraph?.nodes.length ?? 0} visible nodes · {visibleEdges.length} matching imports · {graph?.unresolved ?? 0} unresolved</p></div><select aria-label="Filter dependency graph" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs" value={edgeFilter} onChange={(event) => setEdgeFilter(event.target.value)}><option value="all">All imports</option><option value="internal">Internal</option><option value="external">External</option><option value="unresolved">Unresolved</option></select></div>
                    <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Filter graph directory" placeholder="Directory prefix" value={graphPathPrefix} onChange={(event) => setGraphPathPrefix(event.target.value)} className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"/><select aria-label="Filter graph language" value={graphLanguage} onChange={(event) => setGraphLanguage(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"><option value="all">All languages</option>{Array.from(new Set((graph?.nodes ?? []).map((node) => node.language))).sort().map((language) => <option key={language} value={language}>{language}</option>)}</select><select aria-label="Filter architecture layer" value={graphLayer} onChange={(event) => setGraphLayer(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"><option value="all">All layers</option>{["application", "api", "presentation", "services", "domain", "data", "configuration", "tests", "infrastructure", "dependency", "unresolved", "other"].map((layer) => <option key={layer} value={layer}>{layer}</option>)}</select><select aria-label="Filter graph node type" value={graphNodeType} onChange={(event) => setGraphNodeType(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"><option value="all">All node types</option><option value="entry">Entry points</option><option value="routes">Route files</option><option value="external">External dependencies</option><option value="unresolved">Unresolved modules</option></select><button type="button" onClick={() => { setGraphPathPrefix(""); setGraphLanguage("all"); setGraphLayer("all"); setGraphNodeType("all"); setEdgeFilter("all"); }} className="rounded-lg px-2 py-2 text-xs text-blue-300 hover:bg-white/5">Clear filters</button></div>
                    {graph?.truncated && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">The graph reached its node or edge limit; only the bounded visible graph is shown.</p>}
                    {displayGraph && <ModuleGraph graph={displayGraph} onSelect={(path) => selectFile(path)} />}
                    <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">Import evidence</h3>
                    <div className="mt-2 max-h-[300px] space-y-2 overflow-auto">
                        {visibleEdges.slice(0, 500).map((edge, index) => <button key={`${edge.from}:${edge.line}:${index}`} onClick={() => setSelectedPath(edge.from)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border border-zinc-800/80 bg-black/30 p-3 text-left text-xs hover:border-blue-400/40"><span className="truncate text-zinc-300" title={edge.from}>{edge.from}</span><span className="text-zinc-600">→</span><span className={edge.kind === "internal" ? "truncate text-blue-300" : edge.kind === "unresolved" ? "truncate text-amber-300" : "truncate text-zinc-500"} title={edge.to}>{edge.to}</span></button>)}
                        {visibleEdges.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">No imports match this filter.</p>}
                    </div>
                </section>
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><h2 className="text-lg font-medium">Technologies</h2><div className="mt-4 flex flex-wrap gap-2">{analysis.technologies.map((item) => <button key={item.name} onClick={() => { setQuery(item.evidence[0]?.path ?? ""); setCategory("all"); setSelectedPath(item.evidence[0]?.path ?? ""); }} className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-blue-400/40">{item.name}<span className="ml-2 text-zinc-500">{item.ecosystem}</span></button>)}</div><h3 className="mt-7 text-sm font-medium">Dependencies and advisories</h3><p className="mt-1 text-xs text-zinc-500">{analysis.dependencyCoverage.reported} inventoried · {analysis.dependencyCoverage.advisoryChecked} exact versions checked · {analysis.dependencyCoverage.advisoryUnavailable} lookups unavailable · {analysis.dependencyCoverage.advisoryNotChecked} not checked (OSV cap {analysis.dependencyCoverage.advisoryLimit}){analysis.dependencyCoverage.truncated ? " · inventory truncated at its safety limit" : ""}. Showing up to 300 dependencies here.</p><ul className="mt-3 max-h-72 space-y-2 overflow-auto">{analysis.dependencies.slice(0, 300).map((dependency) => <li key={`${dependency.ecosystem}:${dependency.name}:${dependency.version}`} className="rounded-xl border border-zinc-800 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all text-sm text-zinc-200">{dependency.name} <span className="text-zinc-500">{dependency.version}</span></span><span className="text-xs text-zinc-500">{dependency.ecosystem}{dependency.direct ? " · direct" : " · transitive"}{dependency.development ? " · development" : " · production"}</span></div>{dependency.advisoryState === "unavailable" && <p className="mt-1 text-xs text-amber-300">Advisory lookup unavailable.</p>}{dependency.advisories?.map((advisory) => <div key={advisory.id} className="mt-2 text-xs"><a href={advisory.url} target="_blank" rel="noreferrer" className="text-red-300 underline">{advisory.id}{advisory.summary ? ` · ${advisory.summary}` : ""}</a><span className="ml-2 uppercase text-zinc-400">{advisory.severity}</span><p className="mt-1 text-zinc-500">{advisory.fixedVersion ? `Known fixed version: ${advisory.fixedVersion}.` : "Review the advisory for current patched versions."}</p></div>)}<Evidence owner={owner} repo={repo} evidence={dependency.evidence} onSelect={setSelectedPath} /></li>)}</ul><h3 className="mt-7 text-sm font-medium">Observed features and routes</h3><ul className="mt-3 space-y-3">{analysis.features.slice(0, 40).map((feature) => <li key={feature.title} className="rounded-xl border border-zinc-800 p-3"><div className="text-sm text-zinc-200">{feature.title}</div><p className="mt-1 text-xs text-zinc-500">{feature.description}</p><Evidence owner={owner} repo={repo} evidence={feature.evidence} onSelect={setSelectedPath} /></li>)}</ul></section>
            </div>
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-medium">Source explorer</h2><p className="text-xs text-zinc-500">Files: {visibleFiles.length}</p></div><div className="flex flex-wrap gap-2"><input aria-label="Search source files" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paths" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/><select aria-label="Filter source category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="all">All types</option><option value="source">Source</option><option value="manifest">Manifest</option><option value="configuration">Configuration</option><option value="documentation">Documentation</option></select></div></div>
                {architectureGraph && <div className="mt-4"><ArchitectureDiagram graph={architectureGraph} onSelectFile={selectFile} title="Architecture and data-flow visualization" /></div>}
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,.65fr)_minmax(0,1.35fr)]"><div className="max-h-[480px] overflow-auto rounded-xl border border-zinc-800">{visibleFiles.slice(0, 1000).map((file) => <button key={file.path} onClick={() => selectFile(file.path)} className={`block w-full truncate border-b border-zinc-800/70 px-3 py-2 text-left text-xs ${selectedPath === file.path ? "bg-blue-400/10 text-blue-200" : "text-zinc-400 hover:bg-white/5"}`}>{file.path}</button>)}</div><div className="min-h-56 rounded-xl border border-zinc-800 bg-black/30 p-4">{selected ? <><div className="flex flex-wrap items-center justify-between gap-2"><div className="break-all text-sm text-zinc-200">{selected.path}</div><span className="text-xs text-zinc-500">{selected.language} · {selected.lineCount} lines · {selected.analysisState}</span></div>{selected.warning && <p className="mt-2 text-xs text-amber-300">Parser note: {selected.warning}</p>}<div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">{selected.imports.map((item, index) => <span key={`${item.line}-${index}`}>L{item.line} imports <code className="text-blue-200">{item.source}</code></span>)}{selected.symbols.map((item, index) => <span key={`${item.line}-${index}`}>L{item.line} {item.exported ? "export " : ""}{item.kind} <code className="text-zinc-200">{item.name}</code></span>)}</div><div className="mt-4 max-h-[480px] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">{sourceLoading ? <p role="status" className="text-sm text-zinc-500">Loading this revision&apos;s source…</p> : sourceError ? <p role="alert" className="text-sm text-amber-300">{sourceError}</p> : sourceContent ? <pre className="text-xs leading-5 text-zinc-300"><code>{sourceContent.split(/\r?\n/).map((line, index) => <span id={`source-line-${index + 1}`} key={index} className={`block whitespace-pre ${selectedLine === index + 1 ? "bg-blue-500/15 text-blue-100" : ""}`}><span className="mr-4 inline-block w-10 select-none text-right text-zinc-600">{index + 1}</span>{line || " "}</span>)}</code></pre> : <p className="text-xs text-zinc-500">This file has no content to preview.</p>}</div></> : <p className="text-sm text-zinc-500">Choose a file or graph edge to inspect source evidence.</p>}</div></div>
            </section>
        </>}
    </section>;
}

function ModuleGraph({ graph, onSelect }: { graph: NonNullable<ReturnType<typeof buildDependencyGraph>>; onSelect: (path: string) => void }) {
    const nodes = graph.nodes.slice(0, 72);
    const positions = new Map(nodes.map((node, index) => [node.id, { x: 115 + (index % 4) * 190, y: 42 + Math.floor(index / 4) * 92 }]));
    const height = Math.max(150, Math.ceil(nodes.length / 4) * 92 + 20);
    const edges = graph.edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to)).slice(0, 180);
    return <div className="mt-4 max-h-[440px] overflow-auto rounded-xl border border-zinc-800 bg-black/30 p-2">
        <svg role="img" aria-label={`Source module graph with ${nodes.length} files`} viewBox={`0 0 880 ${height}`} className="min-w-[700px]" style={{ height: `${height}px`, width: "880px" }}>
            <title>Internal source module graph. Select a node to inspect its imports and symbols.</title>
            <g aria-hidden="true">{edges.map((edge, index) => { const from = positions.get(edge.from)!; const to = positions.get(edge.to)!; const color = edge.kind === "internal" ? "#52525b" : edge.kind === "external" ? "#047857" : "#b45309"; return <g key={`${edge.from}:${edge.line}:${index}`}><line x1={from.x} y1={from.y + 22} x2={to.x} y2={to.y - 22} stroke={color} strokeWidth="1.5"/><title>{edge.from}:{edge.line} imports {edge.source}</title></g>; })}</g>
            {nodes.map((node) => { const point = positions.get(node.id)!; const canSelect = node.kind === "module"; const fill = node.entryPoint ? "#172554" : node.kind === "external" ? "#052e2b" : node.kind === "unresolved" ? "#422006" : "#18181b"; const stroke = node.entryPoint ? "#3b82f6" : node.kind === "external" ? "#059669" : node.kind === "unresolved" ? "#d97706" : "#3f3f46"; const label = node.path.length > 30 ? `…${node.path.slice(-27)}` : node.path; return <g key={node.id} role={canSelect ? "button" : undefined} tabIndex={canSelect ? 0 : undefined} aria-label={`${label}${node.entryPoint ? ", entry point" : ""}${node.kind !== "module" ? `, ${node.kind} dependency` : ""}`} onClick={() => canSelect && onSelect(node.path)} onKeyDown={(event) => { if (canSelect && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(node.path); } }} className={canSelect ? "cursor-pointer" : undefined}>
                <rect x={point.x - 100} y={point.y - 22} width="200" height="44" rx="10" fill={fill} stroke={stroke}/>
                <text x={point.x} y={point.y + 4} fill={node.entryPoint ? "#bfdbfe" : "#d4d4d8"} textAnchor="middle" fontSize="11">{label}</text>
            </g>; })}
        </svg>
        {graph.nodes.length > nodes.length && <p className="px-2 pb-1 text-xs text-amber-300">Showing the first {nodes.length} graph nodes. Use the file explorer for the inspected source files.</p>}
    </div>;
}

function Evidence({ owner, repo, evidence, onSelect }: { owner: string; repo: string; evidence: RepositoryIntelligence["features"][number]["evidence"]; onSelect: (path: string) => void }) {
    return <div className="mt-2 flex flex-wrap gap-2">{evidence.map((item, index) => <a key={`${item.path}:${item.startLine}:${index}`} href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/HEAD/${item.path}${item.startLine ? `#L${item.startLine}` : ""}`} target="_blank" rel="noreferrer" onClick={() => onSelect(item.path)} className="text-xs text-blue-300 underline decoration-blue-300/30 underline-offset-2">{item.path}{item.startLine ? `:${item.startLine}` : ""}</a>)}</div>;
}
