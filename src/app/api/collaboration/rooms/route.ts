import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-guard";
import { prisma } from "@/lib/db";
import { createRoomInviteCode, hashRoomInviteCode, parseRoomInput } from "@/lib/collaboration-rooms";

export async function GET() {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to use collaboration rooms." }, { status: 401 });
    const memberships = await prisma.collaborationRoomMember.findMany({
        where: { userId }, orderBy: { joinedAt: "desc" },
        include: { room: { include: { _count: { select: { members: true, messages: true, tasks: true } } } } },
    });
    return NextResponse.json({ rooms: memberships.map(({ room, role }) => ({ ...room, role })) });
}

export async function POST(request: Request) {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to create a collaboration room." }, { status: 401 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    const input = parseRoomInput(body);
    if (!input) return NextResponse.json({ error: "Provide a room name and goal. GitHub repository links must be valid https://github.com/owner/repo URLs." }, { status: 400 });
    const inviteCode = createRoomInviteCode();
    const room = await prisma.$transaction(async (tx) => {
        const created = await tx.collaborationRoom.create({
            data: { ...input, inviteTokenHash: hashRoomInviteCode(inviteCode), ownerId: userId },
        });
        await tx.collaborationRoomMember.create({ data: { roomId: created.id, userId, role: "OWNER" } });
        return created;
    });
    return NextResponse.json({ room, inviteCode }, { status: 201 });
}
