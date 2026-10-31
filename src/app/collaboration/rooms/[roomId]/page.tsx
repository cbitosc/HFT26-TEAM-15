import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildInvalidSessionSignOutRedirect, getSessionAuthState } from "@/lib/session-guard";
import { CollaborationRoomWorkspace } from "@/components/collaboration/CollaborationRoomWorkspace";

export default async function CollaborationRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const session = await auth();
    const authState = getSessionAuthState(session);
    if (authState === "unauthenticated") redirect("/");
    if (authState === "invalid") redirect(buildInvalidSessionSignOutRedirect());
    const { roomId } = await params;
    return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 text-white"><CollaborationRoomWorkspace roomId={roomId} /></main>;
}
