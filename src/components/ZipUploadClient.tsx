"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDependencyGraph } from "@/lib/repo-intelligence/graph";
import { buildArchitectureGraph } from "@/lib/repo-intelligence/symbol-graph";
import { ArchitectureDiagram } from "@/components/repo-intelligence/ArchitectureDiagram";
import type { RepositoryIntelligence } from "@/lib/repo-intelligence/types";

interface UploadResult {
    name: string;
    analysis: RepositoryIntelligence;
    sources: Record<string, string>;
}

export function ZipUploadClient() {
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [selectedPath, setSelectedPath] = useState("");
    const [selectedLine, setSelectedLine] = useState<number | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const graph = useMemo(() => result ? buildDependencyGraph(result.analysis.files) : null, [result]);
    const architectureGraph = useMemo(() => result ? buildArchitectureGraph(result.analysis.files) : null, [result]);

    useEffect(() => {
        if (!selectedLine) return;
        document.getElementById(`zip-source-line-${selectedLine}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [selectedLine, selectedPath, result]);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!file) return;
        setLoading(true);
        setError("");
        setResult(null);
        setSelectedPath("");
        try {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch("/api/repo-intelligence/upload", { method: "POST", body: form });
            const data = await response.json() as UploadResult | { error?: string };
            if (!response.ok || !("analysis" in data)) {
                const message = "error" in data ? data.error : undefined;
                throw new Error(message ?? "The ZIP could not be analyzed.");
            }
            setResult(data);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The ZIP could not be analyzed.");
        } finally {
            setLoading(false);
        }
    };

    return <>
        <form onSubmit={submit} className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-7">
            <label htmlFor="repo-zip" className="mb-2 block text-sm font-medium">Repository ZIP file</label>
            <input id="repo-zip" type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} className="block w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700" />
            <p className="mt-2 text-xs text-zinc-500">ZIP only · up to 50 MB · analyzes at most 800 supported files and 16 MB of source. Repository code is not executed or saved.</p>
            <button type="submit" disabled={!file || loading} className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Analyzing archive…" : "Analyze ZIP"}</button>
            {loading && <p role="status" className="mt-3 text-sm text-zinc-400">Reading source files and checking supported exact dependency versions against OSV.</p>}
            {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        </form>

        {result && <section className="mt-8 space-y-6" aria-label="ZIP analysis results">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-zinc-500">Analysis result</p><h2 className="mt-1 text-2xl font-semibold">{result.name}</h2><p className="mt-1 text-sm text-zinc-500">Uploaded archive · {result.analysis.coverage.durationMs} ms</p></div><button type="button" onClick={() => { setResult(null); setFile(null); setSelectedPath(""); }} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5">Upload another ZIP</button></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[["Inspected files", result.analysis.coverage.inspectedFiles], ["Technologies", result.analysis.technologies.length], ["Dependencies", result.analysis.dependencies.length], ["Observed features", result.analysis.features.length]].map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-zinc-500">{label}</div></div>)}
            </div>
            {result.analysis.coverage.status === "partial" && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Partial coverage: {Object.entries(result.analysis.coverage.skipReasons).map(([reason, count]) => `${reason} (${count})`).join(" · ")}. Results cover only inspected files.</p>}
            <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><h3 className="text-lg font-medium">Technologies detected</h3><div className="mt-3 flex flex-wrap gap-2">{result.analysis.technologies.map((item) => <span key={`${item.name}:${item.ecosystem}`} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-200">{item.name} <span className="text-zinc-500">{item.ecosystem}</span></span>)}{result.analysis.technologies.length === 0 && <p className="text-sm text-zinc-500">No technology markers found.</p>}</div><h3 className="mt-6 text-lg font-medium">Module graph</h3><p className="mt-1 text-xs text-zinc-500">{graph?.nodes.length ?? 0} source modules · {graph?.edges.length ?? 0} imports · {graph?.unresolved ?? 0} unresolved</p><div className="mt-3 max-h-72 space-y-1 overflow-auto rounded-xl border border-zinc-800 bg-black/30 p-3">{graph?.edges.slice(0, 200).map((edge, index) => <button key={`${edge.from}:${edge.line}:${index}`} onClick={() => setSelectedPath(edge.from)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5"><span className="truncate text-zinc-300">{edge.from}:{edge.line}</span><span className="text-zinc-600">→</span><span className={`truncate ${edge.kind === "internal" ? "text-blue-300" : edge.kind === "unresolved" ? "text-amber-300" : "text-zinc-500"}`}>{edge.to}</span></button>)}{!graph?.edges.length && <p className="p-2 text-sm text-zinc-500">No imports were found in the supported source files.</p>}</div></section>
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><h3 className="text-lg font-medium">Dependencies and advisories</h3><p className="mt-1 text-xs text-zinc-500">{result.analysis.dependencyCoverage.advisoryChecked} exact versions checked · {result.analysis.dependencyCoverage.advisoryUnavailable} lookups unavailable · version ranges are not checked.</p><ul className="mt-3 max-h-[390px] space-y-2 overflow-auto">{result.analysis.dependencies.slice(0, 300).map((dependency) => <li key={`${dependency.ecosystem}:${dependency.name}:${dependency.version}`} className="rounded-lg border border-zinc-800 p-3"><p className="break-all text-sm">{dependency.name} <span className="text-zinc-500">{dependency.version}</span></p>{dependency.advisories?.map((advisory) => <p key={advisory.id} className="mt-1 text-xs"><a className="text-red-300 underline" href={advisory.url} target="_blank" rel="noreferrer">{advisory.id} · {advisory.severity}</a></p>)}{dependency.advisoryState === "unavailable" && <p className="mt-1 text-xs text-amber-300">Advisory service unavailable.</p>}</li>)}{!result.analysis.dependencies.length && <li className="text-sm text-zinc-500">No supported dependency manifests were found.</li>}</ul></section>
            </div>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-medium">Source explorer</h3><p className="text-xs text-zinc-500">Select a file to inspect its contents and extracted imports and symbols.</p></div><input aria-label="Filter source file paths" placeholder="Filter paths" onChange={(event) => { const first = result.analysis.files.find((item) => item.path.toLowerCase().includes(event.target.value.toLowerCase())); setSelectedPath(first?.path ?? ""); setSelectedLine(undefined); }} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" /></div>{architectureGraph && <div className="mt-4"><ArchitectureDiagram graph={architectureGraph} onSelectFile={(path, line) => { setSelectedPath(path); setSelectedLine(line); }} title="Architecture and data-flow visualization" /></div>}<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,.55fr)_minmax(0,1.45fr)]"><nav aria-label="Uploaded source files" className="max-h-[500px] overflow-auto rounded-xl border border-zinc-800">{result.analysis.files.map((item) => <button key={item.path} onClick={() => { setSelectedPath(item.path); setSelectedLine(undefined); }} className={`block w-full truncate border-b border-zinc-800/70 px-3 py-2 text-left text-xs ${selectedPath === item.path ? "bg-blue-400/10 text-blue-200" : "text-zinc-400 hover:bg-white/5"}`}>{item.path}</button>)}</nav><div className="min-h-64 overflow-auto rounded-xl border border-zinc-800 bg-black/40 p-4">{(() => { const item = result.analysis.files.find((candidate) => candidate.path === selectedPath); return item ? <><div className="break-all text-sm text-zinc-200">{item.path}</div><p className="mt-1 text-xs text-zinc-500">{item.language} · {item.lineCount} lines · {item.analysisState}</p><div className="mt-3 flex flex-wrap gap-2">{item.imports.map((entry, index) => <span key={`${entry.line}:${index}`} className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-blue-200">L{entry.line} imports {entry.source}</span>)}{item.symbols.map((entry, index) => <span key={`${entry.line}:${index}`} className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-zinc-300">L{entry.line} {entry.kind} {entry.name}</span>)}</div><pre className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-300">{result.sources[item.path]?.split(/\r?\n/).map((line, index) => <span id={`zip-source-line-${index + 1}`} key={index} className={`block min-h-5 whitespace-pre ${selectedLine === index + 1 ? "bg-blue-500/15 text-blue-100" : ""}`}><span className="mr-4 inline-block w-10 select-none text-right text-zinc-600">{String(index + 1).padStart(4, " ")}</span>{line || " "}</span>)}</pre></> : <p className="text-sm text-zinc-500">Choose a file from the archive.</p>; })()}</div></div></section>
            <p className="text-xs text-zinc-600">Uploaded source was processed for this request and is not saved in RepoMind. ZIP archives are never executed.</p>
        </section>}
    </>;
}
