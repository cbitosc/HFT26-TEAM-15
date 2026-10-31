"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthProviderButtons } from "@/components/AuthProviderButtons";

export function CollaborationInvite({ inviteCode }: { inviteCode: string }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [error, setError] = useState("");
    const code = inviteCode;

    useEffect(() => {
        if (!session || !code) return;
        let active = true;
        fetch("/api/collaboration/rooms/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inviteCode: code }) })
            .then(async (response) => {
                const data = await response.json() as { roomId?: string; error?: string };
                if (!response.ok || !data.roomId) throw new Error(data.error ?? "This invite could not be accepted.");
                if (active) router.replace(`/collaboration/rooms/${data.roomId}`);
            })
            .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "This invite could not be accepted."); });
        return () => { active = false; };
    }, [session, code, router]);

    return <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 text-white"><section className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center"><h1 className="text-2xl font-semibold">You’re invited to collaborate</h1><p className="mt-3 text-sm text-zinc-400">Sign in to join this private RepoMind room. Room content is visible only to its members.</p>{status === "loading" ? <p role="status" className="mt-5 text-sm text-zinc-500">Checking your sign-in…</p> : session ? <p role="status" className="mt-5 text-sm text-zinc-300">Joining room…</p> : <div className="mt-5 flex justify-center"><AuthProviderButtons callbackUrl={window.location.href} /></div>}{error && <p role="alert" className="mt-4 text-sm text-amber-300">{error}</p>}<p className="mt-5"><Link href="/" className="text-xs text-blue-300">Back to RepoMind</Link></p></section></main>;
}
