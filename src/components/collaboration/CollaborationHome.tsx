"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type RoomSummary = { id: string; name: string; goal: string; repositoryUrl: string | null; role: string; updatedAt: string; _count: { members: number; messages: number; tasks: number } };

export function CollaborationHome() {
    const router = useRouter();
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [name, setName] = useState("");
    const [goal, setGoal] = useState("");
    const [repositoryUrl, setRepositoryUrl] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [createdCode, setCreatedCode] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    async function loadRooms() {
        setLoading(true);
        const response = await fetch("/api/collaboration/rooms", { cache: "no-store" });
        const data = await response.json() as { rooms?: RoomSummary[]; error?: string };
        if (response.ok) setRooms(data.rooms ?? []);
        else setError(data.error ?? "Rooms could not be loaded.");
        setLoading(false);
    }
    useEffect(() => { void loadRooms(); }, []);

    async function createRoom(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch("/api/collaboration/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, goal, repositoryUrl }) });
            const data = await response.json() as { room?: { id: string }; inviteCode?: string; error?: string };
            if (!response.ok || !data.room || !data.inviteCode) throw new Error(data.error ?? "Room could not be created.");
            setCreatedCode(data.inviteCode); setName(""); setGoal(""); setRepositoryUrl("");
            await loadRooms();
            router.push(`/collaboration/rooms/${data.room.id}?invite=${encodeURIComponent(data.inviteCode)}`);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Room could not be created."); }
        finally { setBusy(false); }
    }

    async function joinRoom(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch("/api/collaboration/rooms/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inviteCode: inviteCode.trim() }) });
            const data = await response.json() as { roomId?: string; error?: string };
            if (!response.ok || !data.roomId) throw new Error(data.error ?? "Could not join room.");
            router.push(`/collaboration/rooms/${data.roomId}`);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not join room."); }
        finally { setBusy(false); }
    }

    async function copyInvite(code: string) {
        const link = `${window.location.origin}/collaboration/join?invite=${encodeURIComponent(code)}`;
        await navigator.clipboard.writeText(link);
        setNotice("Invite link copied. Send it to your teammate; they can sign in and join the room.");
    }

    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get("invite");
        if (code) setInviteCode(code);
    }, []);

    return <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4"><div><Link href="/" className="text-xs text-blue-300 hover:text-blue-200">← RepoMind</Link><h1 className="mt-2 text-3xl font-semibold">Collaboration rooms</h1><p className="mt-2 max-w-2xl text-sm text-zinc-400">Create a private space for a shared goal, connect a GitHub repository, plan tasks, and discuss the work with your team.</p></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">Invite only · up to 8 developers</span></header>
        {(error || notice) && <div role={error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>{error || notice}</div>}
        {createdCode && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4"><div className="text-sm font-medium">Room created. Share its invite link.</div><div className="mt-3 flex flex-wrap gap-2"><code className="break-all rounded bg-black/30 px-3 py-2 text-xs">{createdCode}</code><button onClick={() => void copyInvite(createdCode)} className="rounded-lg bg-blue-400 px-3 py-2 text-xs font-medium text-black">Copy invite link</button></div></div>}
        <div className="grid gap-5 lg:grid-cols-2">
            <form onSubmit={(event) => void createRoom(event)} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><h2 className="text-lg font-medium">Create a room</h2><label className="block text-xs text-zinc-400">Room name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Checkout refactor" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label><label className="block text-xs text-zinc-400">Shared goal<textarea required maxLength={500} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="What are you and your teammate trying to accomplish?" rows={3} className="mt-1 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label><label className="block text-xs text-zinc-400">GitHub repository (optional)<input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repo" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label><button disabled={busy} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50">{busy ? "Working…" : "Create room"}</button></form>
            <form onSubmit={(event) => void joinRoom(event)} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><h2 className="text-lg font-medium">Join with an invite</h2><p className="text-sm text-zinc-400">Paste the invite code from a teammate. Only room members can see the room’s goal, messages, and task list.</p><label className="block text-xs text-zinc-400">Invite code<input required value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Paste invite code or open an invite link" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label><button disabled={busy} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Joining…" : "Join room"}</button></form>
        </div>
        <section><h2 className="mb-3 text-lg font-medium">Your rooms</h2>{loading ? <p role="status" className="text-sm text-zinc-500">Loading rooms…</p> : rooms.length === 0 ? <p className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-500">You have not joined a room yet.</p> : <div className="grid gap-3 md:grid-cols-2">{rooms.map((room) => <Link key={room.id} href={`/collaboration/rooms/${room.id}`} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 hover:border-blue-500/40"><div className="flex justify-between gap-3"><h3 className="font-medium">{room.name}</h3><span className="text-xs text-zinc-500">{room.role.toLowerCase()}</span></div><p className="mt-2 line-clamp-2 text-sm text-zinc-400">{room.goal}</p>{room.repositoryUrl && <p className="mt-2 truncate text-xs text-blue-300">{room.repositoryUrl}</p>}<p className="mt-3 text-xs text-zinc-500">{room._count.members} members · {room._count.tasks} tasks · {room._count.messages} messages</p></Link>)}</div>}</section>
    </div>;
}
