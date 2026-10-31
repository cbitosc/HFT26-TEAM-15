import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-guard";
import { prisma } from "@/lib/db";
import { createRoomInviteCode, hashRoomInviteCode } from "@/lib/collaboration-rooms";

export async function POST(_request: Request, { params }: { params: Promise<{ roomId: string }> }) {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to manage this room invite." }, { status: 401 });
    const { roomId } = await params;
    const room = await prisma.collaborationRoom.findFirst({ where: { id: roomId, ownerId: userId }, select: { id: true } });
    if (!room) return NextResponse.json({ error: "Only the room owner can create an invite." }, { status: 403 });
    const inviteCode = createRoomInviteCode();
    await prisma.collaborationRoom.update({ where: { id: roomId }, data: { inviteTokenHash: hashRoomInviteCode(inviteCode) } });
    return NextResponse.json({ inviteCode });
}
