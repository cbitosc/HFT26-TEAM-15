import { describe, expect, it } from "vitest";
import { createRoomInviteCode, hashRoomInviteCode, isRoomTaskStatus, parseRoomInput, parseRoomMessage, parseRoomTaskTitle } from "@/lib/collaboration-rooms";

describe("collaboration room validation", () => {
    it("normalizes room fields and only accepts GitHub repository URLs", () => {
        expect(parseRoomInput({ name: "  Pairing  ", goal: " Ship a feature ", repositoryUrl: "https://github.com/acme/widget/" })).toEqual({ name: "Pairing", goal: "Ship a feature", repositoryUrl: "https://github.com/acme/widget" });
        expect(parseRoomInput({ name: "Pairing", goal: "Goal", repositoryUrl: "https://example.com/acme/widget" })).toBeNull();
        expect(parseRoomInput({ name: " ", goal: "Goal" })).toBeNull();
    });

    it("bounds messages and tasks", () => {
        expect(parseRoomMessage("  hello  ")).toBe("hello");
        expect(parseRoomMessage(" ")).toBeNull();
        expect(parseRoomMessage("x".repeat(2001))).toBeNull();
        expect(parseRoomTaskTitle("  Implement login ")).toBe("Implement login");
        expect(parseRoomTaskTitle("x".repeat(161))).toBeNull();
        expect(isRoomTaskStatus("DONE")).toBe(true);
        expect(isRoomTaskStatus("DELETED")).toBe(false);
    });

    it("creates high-entropy invite codes and stores only their one-way hash", () => {
        const first = createRoomInviteCode();
        const second = createRoomInviteCode();
        expect(first).not.toBe(second);
        expect(first.length).toBeGreaterThanOrEqual(32);
        expect(hashRoomInviteCode(first)).toHaveLength(64);
        expect(hashRoomInviteCode(first)).not.toBe(first);
    });
});
