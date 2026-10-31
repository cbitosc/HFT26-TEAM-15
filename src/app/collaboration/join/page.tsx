import { CollaborationInvite } from "@/components/collaboration/CollaborationInvite";

export const metadata = { title: "Join collaboration room" };

export default async function CollaborationInvitePage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
    const { invite = "" } = await searchParams;
    return <CollaborationInvite inviteCode={invite} />;
}
