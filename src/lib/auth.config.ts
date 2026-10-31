import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { INVALID_SESSION_ERROR_CODE } from "./session-guard";

function hasOAuthCredentials(value: string | undefined): value is string {
    const credential = value?.trim();
    return Boolean(credential && !/^(local-placeholder|your_|placeholder|example)/i.test(credential));
}

export function getConfiguredOAuthProviders(env: NodeJS.ProcessEnv = process.env): NextAuthConfig["providers"] {
    const providers: NextAuthConfig["providers"] = [];
    if (hasOAuthCredentials(env.AUTH_GITHUB_ID) && hasOAuthCredentials(env.AUTH_GITHUB_SECRET)) {
        providers.push(GitHub({ clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET }));
    }
    if (hasOAuthCredentials(env.AUTH_GOOGLE_ID) && hasOAuthCredentials(env.AUTH_GOOGLE_SECRET)) {
        providers.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
    }
    return providers;
}

const authConfig: NextAuthConfig = {
    providers: getConfiguredOAuthProviders(),
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false;
            }
            return true;
        },
        async jwt({ token, profile, account, user }) {
            const candidateUserId = user?.id ?? token.id ?? token.sub;
            token.id = typeof candidateUserId === "string" ? candidateUserId : undefined;
            if (profile?.login) {
                token.username = profile.login;
            }
            if (account?.access_token) {
                token.accessToken = account.access_token;
            }
            if (account?.scope) {
                token.oauthScope = account.scope;
            }
            if (!token.id) {
                token.error = INVALID_SESSION_ERROR_CODE;
            } else {
                delete token.error;
            }
            return token;
        },
        async session({ session, token }) {
            const resolvedUserId = typeof token.id === "string" ? token.id : (typeof token.sub === "string" ? token.sub : undefined);
            if (resolvedUserId && session.user) {
                session.user.id = resolvedUserId;
            }
            if (typeof token.username === "string" && session.user) {
                session.user.username = token.username;
            }
            if (typeof token.oauthScope === "string") {
                session.oauthScope = token.oauthScope;
            }
            if (!resolvedUserId) {
                session.error = INVALID_SESSION_ERROR_CODE;
            }
            return session;
        },
    },
    pages: {
        signIn: "/",
        error: "/",
    },
};

export default authConfig;
