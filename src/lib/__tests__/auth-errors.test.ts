import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "@/lib/auth-errors";

describe("getAuthErrorMessage", () => {
    it("explains OAuth configuration and callback errors without exposing server details", () => {
        expect(getAuthErrorMessage("Configuration")).toContain("Client ID, Client Secret, and callback URL");
        expect(getAuthErrorMessage("OAuthCallbackError")).toContain("callback URL");
    });

    it("returns a safe fallback for unknown errors and null for no error", () => {
        expect(getAuthErrorMessage("internal-stack-trace")).toBe("GitHub sign-in failed. Please try again.");
        expect(getAuthErrorMessage(null)).toBeNull();
    });
});
