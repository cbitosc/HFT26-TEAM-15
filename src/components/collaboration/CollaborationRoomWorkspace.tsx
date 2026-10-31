"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Person = { id?: string; name: string | null; githubLogin: string | null; image?: string | null };
type RoomData = {
    id: string; name: string; goal: string; repositoryUrl: string | null; ownerId: string;
    members: Array<{ id: string; role: string; user: Person }>;
    messages: Array<{ id: string; body: string; createdAt: string; user: Person }>;
    tasks: Array<{ id: string; title: string; status: string; createdBy: Person }>;
};

function displayName(person: Person) { return person.githubLogin || person.name || "Developer"; }

export function CollaborationRoomWorkspace({ roomId }: { roomId: string }) {
    const [room, setRoom] = useState<RoomData | null>(null);
    const [currentUserId, setCurrentUserId] = useState("");
    const [message, setMessage] = useState("");
    const [task, setTask] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (initial = false) => {
        const response = await fetch(`/api/collaboration/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" });
        const data = await response.json() as { room?: RoomData; userId?: string; error?: string };
        if (!response.ok || !data.room) { if (initial) setError(data.error ?? "This room could not be loaded."); }
        else { setRoom(data.room); if (data.userId) setCurrentUserId(data.userId); }
        if (initial) setLoading(false);
    }, [roomId]);

    useEffect(() => {
        void load(true);
        const timer = window.setInterval(() => void load(), 8000);
        const code = new URLSearchParams(window.location.search).get("invite");
        if (code) { setInviteCode(code); window.history.replaceState({}, "", window.location.pathname); }
        return () => window.clearInterval(timer);
    }, [load]);

    async function submit(type: "message" | "task", event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch(`/api/collaboration/rooms/${encodeURIComponent(roomId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(type === "message" ? { type, body: message } : { type, title: task }) });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error ?? "Your update could not be saved.");
            if (type === "message") setMessage(""); else setTask("");
            await load();
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Your update could not be saved."); }
        finally { setBusy(false); }
    }

    async function toggleTask(taskId: string, status: string) {
        const nextStatus = status === "DONE" ? "OPEN" : "DONE";
        const response = await fetch(`/api/collaboration/rooms/${encodeURIComponent(roomId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId, status: nextStatus }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) setError(data.error ?? "Task could not be updated."); else await load();
    }

    async function createInvite() {
        setError(""); setNotice("");
        try {
            const response = await fetch(`/api/collaboration/rooms/${encodeURIComponent(roomId)}/invite`, { method: "POST" });
            const data = await response.json() as { inviteCode?: string; error?: string };
            if (!response.ok || !data.inviteCode) throw new Error(data.error ?? "Invite could not be created.");
            const link = `${window.location.origin}/collaboration/join?invite=${encodeURIComponent(data.inviteCode)}`;
            setInviteCode(data.inviteCode);
            await navigator.clipboard.writeText(link);
            setNotice("New invite link copied. Any older invite code for this room has been revoked.");
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Invite could not be created."); }
    }

    if (loading) return <p role="status" className="py-20 text-center text-sm text-zinc-400">Loading collaboration room…</p>;
    if (!room) return <section className="mx-auto max-w-xl rounded-2xl border border-zinc-800 p-6"><h1 className="text-xl font-semibold">Room unavailable</h1><p role="alert" className="mt-2 text-sm text-amber-200">{error || "This room does not exist or you are not a member."}</p><Link href="/collaboration" className="mt-4 inline-block text-sm text-blue-300">Back to rooms</Link></section>;

    return <div className="space-y-6">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><Link href="/collaboration" className="text-xs text-blue-300">← All rooms</Link><div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold">{room.name}</h1><p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-zinc-300">{room.goal}</p>{room.repositoryUrl && <a href={room.repositoryUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-blue-300 hover:underline">{room.repositoryUrl}</a>}</div>{room.ownerId === currentUserId && <button onClick={() => void createInvite()} className="rounded-lg border border-zinc-600 px-3 py-2 text-xs hover:bg-white/5">Create / rotate invite</button>}</div>{inviteCode && <div className="mt-4 break-all rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">Invite code: <code>{inviteCode}</code></div>}{notice && <p role="status" className="mt-3 text-xs text-emerald-300">{notice}</p>}</header>
        {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Shared task board</h2><span className="text-xs text-zinc-500">{room.tasks.filter((item) => item.status === "DONE").length}/{room.tasks.length} complete</span></div><form onSubmit={(event) => void submit("task", event)} className="mt-3 flex gap-2"><input required maxLength={160} value={task} onChange={(event) => setTask(event.target.value)} placeholder="Add a task for the room" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/><button disabled={busy} className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black">Add task</button></form><ul className="mt-4 space-y-2">{room.tasks.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-black/20 p-3"><button type="button" aria-label={`${item.status === "DONE" ? "Reopen" : "Complete"} task: ${item.title}`} onClick={() => void toggleTask(item.id, item.status)} className={`h-5 w-5 shrink-0 rounded border ${item.status === "DONE" ? "border-emerald-500 bg-emerald-500/30" : "border-zinc-600"}`}>{item.status === "DONE" ? "✓" : ""}</button><span className={`flex-1 text-sm ${item.status === "DONE" ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{item.title}</span><span className="text-[10px] text-zinc-600">by {displayName(item.createdBy)}</span></li>)}</ul>{room.tasks.length === 0 && <p className="mt-4 text-sm text-zinc-500">Add the first task to divide up the work.</p>}</section>
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Room discussion</h2><span className="text-xs text-zinc-500">Refreshes every 8 seconds</span></div><div aria-live="polite" className="mt-4 max-h-[420px] min-h-36 space-y-3 overflow-auto">{room.messages.map((item) => <article key={item.id} className="rounded-lg border border-zinc-800 bg-black/20 p-3"><div className="flex justify-between gap-3"><span className="text-xs font-medium text-blue-200">{displayName(item.user)}</span><time className="text-[10px] text-zinc-600">{new Date(item.createdAt).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">{item.body}</p></article>)}{room.messages.length === 0 && <p className="pt-10 text-center text-sm text-zinc-500">Use this thread to share decisions, questions, and progress.</p>}</div><form onSubmit={(event) => void submit("message", event)} className="mt-4 flex gap-2"><textarea required maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a room update…" rows={2} className="min-w-0 flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/><button disabled={busy} className="self-end rounded-lg bg-blue-400 px-3 py-2 text-xs font-medium text-black">Send</button></form></section>
            </div>
            <aside className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5"><h2 className="text-lg font-medium">Developers <span className="text-sm text-zinc-500">{room.members.length}/8</span></h2><ul className="mt-4 space-y-3">{room.members.map((member) => <li key={member.id} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-xs">{displayName(member.user).slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm">{displayName(member.user)}</span><span className="text-[10px] text-zinc-500">{member.role.toLowerCase()}</span></li>)}</ul><p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-500">Only invited members can read or add room content. Share the room invite with people you want to work with.</p></aside>
        </div>
    </div>;
}
