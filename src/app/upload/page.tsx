import type { Metadata } from "next";
import Link from "next/link";
import { createSeoMetadata } from "@/lib/seo";
import { ZipUploadClient } from "@/components/ZipUploadClient";

export const metadata: Metadata = createSeoMetadata({
    title: "Analyze a ZIP Archive",
    description: "Upload a source archive to explore its architecture, technologies, dependencies, and source files.",
    canonical: "/upload",
    ogTitle: "Analyze a repository ZIP with RepoMind",
    ogDescription: "Inspect a ZIP archive's source structure and dependencies.",
});

export default function UploadPage() {
    return <main className="min-h-screen bg-black px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-6xl">
            <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Back to RepoMind</Link>
            <header className="mx-auto mb-8 mt-10 max-w-2xl text-center">
                <h1 className="text-3xl font-semibold sm:text-4xl">Analyze a repository ZIP</h1>
                <p className="mt-3 text-zinc-400">Upload a source archive to inspect its architecture, imports, technologies, dependencies, and source files.</p>
            </header>
            <ZipUploadClient />
        </div>
    </main>;
}
