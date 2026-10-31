import { createHash, randomBytes } from "node:crypto";

export const ROOM_MAX_MEMBERS = 8;
export const ROOM_NAME_MAX_LENGTH = 80;
export const ROOM_GOAL_MAX_LENGTH = 500;
export const ROOM_MESSAGE_MAX_LENGTH = 2000;
export const ROOM_TASK_MAX_LENGTH = 160;

export function createRoomInviteCode(): string {
    return randomBytes(24).toString("base64url");
}

export function hashRoomInviteCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
}

export function parseRoomInput(value: unknown): { name: string; goal: string; repositoryUrl?: string } | null {
    if (!value || typeof value !== "object") return null;
    const input = value as Record<string, unknown>;
    if (typeof input.name !== "string" || typeof input.goal !== "string") return null;
    const name = input.name.trim();
    const goal = input.goal.trim();
    if (!name || name.length > ROOM_NAME_MAX_LENGTH || !goal || goal.length > ROOM_GOAL_MAX_LENGTH) return null;
    let repositoryUrl: string | undefined;
    if (input.repositoryUrl !== undefined && input.repositoryUrl !== "") {
        if (typeof input.repositoryUrl !== "string" || input.repositoryUrl.length > 300) return null;
        try {
            const url = new URL(input.repositoryUrl);
            if (url.protocol !== "https:" || url.hostname !== "github.com" || !/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)) return null;
            repositoryUrl = `https://github.com${url.pathname.replace(/\/$/, "")}`;
        } catch { return null; }
    }
    return { name, goal, repositoryUrl };
}

export function parseRoomMessage(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const body = value.trim();
    return body.length > 0 && body.length <= ROOM_MESSAGE_MAX_LENGTH ? body : null;
}

export function parseRoomTaskTitle(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const title = value.trim();
    return title.length > 0 && title.length <= ROOM_TASK_MAX_LENGTH ? title : null;
}

export function isRoomTaskStatus(value: unknown): value is "OPEN" | "DONE" {
    return value === "OPEN" || value === "DONE";
}
