import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildInvalidSessionSignOutRedirect, getSessionAuthState } from "@/lib/session-guard";
import { CollaborationHome } from "@/components/collaboration/CollaborationHome";

export const metadata = { title: "Collaboration Rooms", description: "Create private, invite-only rooms to plan and work together with other developers." };

export default async function CollaborationPage() {
    const session = await auth();
    const authState = getSessionAuthState(session);
    if (authState === "unauthenticated") redirect("/");
    if (authState === "invalid") redirect(buildInvalidSessionSignOutRedirect());
    return <main className="mx-auto min-h-screen max-w-6xl px-4 py-12 text-white"><CollaborationHome /></main>;
}
