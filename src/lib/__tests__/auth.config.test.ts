import { describe, expect, it } from "vitest";
import authConfig, { getConfiguredOAuthProviders } from "@/lib/auth.config";
import { INVALID_SESSION_ERROR_CODE } from "@/lib/session-guard";

describe("auth.config callbacks", () => {
    it("routes sign-in and provider errors to the homepage feedback UI", () => {
        expect(authConfig.pages?.signIn).toBe("/");
        expect(authConfig.pages?.error).toBe("/");
    });

    it("registers only OAuth providers with complete non-placeholder credentials", () => {
        expect(getConfiguredOAuthProviders({ AUTH_GITHUB_ID: "local-placeholder", AUTH_GITHUB_SECRET: "local-placeholder" } as NodeJS.ProcessEnv)).toHaveLength(0);
        const providers = getConfiguredOAuthProviders({
            AUTH_GOOGLE_ID: "google-client-id",
            AUTH_GOOGLE_SECRET: "google-client-secret",
            AUTH_GITHUB_ID: "github-client-id",
        } as NodeJS.ProcessEnv);
        expect(providers.map((provider) => provider.id)).toEqual(["google"]);
    });

    it("uses token.sub as fallback id in jwt callback", async () => {
        const jwt = authConfig.callbacks?.jwt;
        expect(jwt).toBeTypeOf("function");

        const result = await jwt?.({
            token: { sub: "user_sub_id" },
            profile: undefined,
            account: undefined,
            user: undefined,
            trigger: "update",
            session: null,
            isNewUser: false,
        } as never);

        expect(result?.id).toBe("user_sub_id");
        expect(result?.error).toBeUndefined();
    });

    it("marks session as invalid when no user id can be resolved", async () => {
        const session = authConfig.callbacks?.session;
        expect(session).toBeTypeOf("function");

        const result = await session?.({
            session: {
                expires: "2099-01-01T00:00:00.000Z",
                user: {
                    name: "Test",
                    email: "test@example.com",
                    image: null,
                },
            },
            token: {},
            user: undefined,
            newSession: undefined,
            trigger: "update",
        } as never);

        const resultWithError = result as { error?: string } | undefined;
        expect(resultWithError?.error).toBe(INVALID_SESSION_ERROR_CODE);
    });
});
