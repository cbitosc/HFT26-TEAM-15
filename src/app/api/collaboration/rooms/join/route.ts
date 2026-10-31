import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-guard";
import { prisma } from "@/lib/db";
import { hashRoomInviteCode, ROOM_MAX_MEMBERS } from "@/lib/collaboration-rooms";

export async function POST(request: Request) {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to join a collaboration room." }, { status: 401 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    const code = body && typeof body === "object" ? (body as Record<string, unknown>).inviteCode : null;
    if (typeof code !== "string" || code.length < 20 || code.length > 100) return NextResponse.json({ error: "Enter a valid invite code." }, { status: 400 });
    const room = await prisma.collaborationRoom.findUnique({ where: { inviteTokenHash: hashRoomInviteCode(code) } });
    if (!room) return NextResponse.json({ error: "This room invite is invalid." }, { status: 404 });
    const existing = await prisma.collaborationRoomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId } } });
    if (!existing) {
        const count = await prisma.collaborationRoomMember.count({ where: { roomId: room.id } });
        if (count >= ROOM_MAX_MEMBERS) return NextResponse.json({ error: "This room has reached its member limit." }, { status: 409 });
        await prisma.collaborationRoomMember.create({ data: { roomId: room.id, userId } });
    }
    return NextResponse.json({ roomId: room.id });
}
