import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-guard";
import { prisma } from "@/lib/db";
import { isRoomTaskStatus, parseRoomMessage, parseRoomTaskTitle } from "@/lib/collaboration-rooms";

type RouteContext = { params: Promise<{ roomId: string }> };

async function getMember(roomId: string, userId: string) {
    return prisma.collaborationRoomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
}

export async function GET(_request: Request, { params }: RouteContext) {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to access this room." }, { status: 401 });
    const { roomId } = await params;
    if (!await getMember(roomId, userId)) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    const room = await prisma.collaborationRoom.findUnique({
        where: { id: roomId },
        include: {
            members: { orderBy: { joinedAt: "asc" }, include: { user: { select: { id: true, name: true, githubLogin: true, image: true } } } },
            messages: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { id: true, name: true, githubLogin: true, image: true } } } },
            tasks: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true, githubLogin: true } } } },
        },
    });
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    return NextResponse.json({ room: { ...room, messages: room.messages.reverse() }, userId });
}

export async function POST(request: Request, { params }: RouteContext) {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to contribute to this room." }, { status: 401 });
    const { roomId } = await params;
    if (!await getMember(roomId, userId)) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const payload = body as Record<string, unknown>;
    if (payload.type === "message") {
        const text = parseRoomMessage(payload.body);
        if (!text) return NextResponse.json({ error: "Messages must contain 1 to 2,000 characters." }, { status: 400 });
        const message = await prisma.collaborationRoomMessage.create({ data: { roomId, userId, body: text }, include: { user: { select: { id: true, name: true, githubLogin: true, image: true } } } });
        return NextResponse.json({ message }, { status: 201 });
    }
    if (payload.type === "task") {
        const title = parseRoomTaskTitle(payload.title);
        if (!title) return NextResponse.json({ error: "Tasks must contain 1 to 160 characters." }, { status: 400 });
        const task = await prisma.collaborationRoomTask.create({ data: { roomId, createdById: userId, title }, include: { createdBy: { select: { name: true, githubLogin: true } } } });
        return NextResponse.json({ task }, { status: 201 });
    }
    return NextResponse.json({ error: "Choose a message or task action." }, { status: 400 });
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const userId = getSessionUserId(await auth());
    if (!userId) return NextResponse.json({ error: "Sign in to update room tasks." }, { status: 401 });
    const { roomId } = await params;
    if (!await getMember(roomId, userId)) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { taskId, status } = body as Record<string, unknown>;
    if (typeof taskId !== "string" || !isRoomTaskStatus(status)) return NextResponse.json({ error: "Provide a valid task and status." }, { status: 400 });
    const result = await prisma.collaborationRoomTask.updateMany({ where: { id: taskId, roomId }, data: { status } });
    if (result.count === 0) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
}
