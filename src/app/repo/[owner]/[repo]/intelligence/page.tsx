import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Network, ScanSearch } from "lucide-react";
import { IntelligenceWorkspace } from "@/components/repo-intelligence/IntelligenceWorkspace";

interface Props { params: Promise<{ owner: string; repo: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { owner, repo } = await params;
    return { title: `${owner}/${repo} Repository Intelligence`, robots: { index: false, follow: false } };
}

export default async function RepositoryIntelligencePage({ params }: Props) {
    const { owner, repo } = await params;
    return <main className="min-h-screen bg-black px-5 py-8 text-white md:px-10">
        <div className="mx-auto max-w-7xl">
            <Link href={`/repo/${owner}/${repo}`} className="mb-7 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4" />{owner}/{repo}</Link>
            <header className="mb-8 flex items-start gap-4 border-b border-zinc-800 pb-7">
                <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-3 text-blue-300"><Network className="h-6 w-6" /></div>
                <div><h1 className="text-3xl font-semibold">Repository intelligence</h1><p className="mt-2 text-zinc-400">Deterministic source and dependency evidence for <span className="text-zinc-200">{owner}/{repo}</span>.</p></div>
            </header>
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400"><ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /><p>Findings link to inspected files and lines. A listed route or import confirms its source entry point; it does not imply that every related behavior is complete.</p></div>
            <IntelligenceWorkspace owner={owner} repo={repo} />
        </div>
    </main>;
}
