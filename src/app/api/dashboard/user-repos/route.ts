import { auth } from "@/lib/auth";
import { getGitHubAccessTokenForUser } from "@/lib/services/github-account";
import { NextResponse } from "next/server";
import { getInvalidSessionApiError, getSessionAuthState, getSessionUserId } from "@/lib/session-guard";

export async function GET() {
    const session = await auth();
    const authState = getSessionAuthState(session);

    if (authState === "unauthenticated") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (authState === "invalid") {
        return NextResponse.json(getInvalidSessionApiError(), { status: 401 });
    }

    const userId = getSessionUserId(session);
    if (!userId) {
        return NextResponse.json(getInvalidSessionApiError(), { status: 401 });
    }

    try {
        const accessToken = await getGitHubAccessTokenForUser(userId);
        const tokenToUse = accessToken;
        if (!tokenToUse) return NextResponse.json({ error: "No GitHub token available" }, { status: 500 });
        const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
            headers: {
                Authorization: `Bearer ${tokenToUse}`,
                Accept: "application/vnd.github.v3+json",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            console.error("GitHub API error fetching user repos", { status: res.status });
            return NextResponse.json({ error: "Failed to fetch repositories" }, { status: res.status });
        }

        const data: unknown = await res.json();
        const repos = Array.isArray(data) ? data : [];

        // Check if the token we used was the user's specific access token (which implies we requested scopes)
        // If they have private repos returned, or if they successfully used an access_token, we assume they have private access.
        const hasPrivateAccess = repos.some((repo: unknown) => !!repo && typeof repo === "object" && "private" in repo && repo.private === true);

        return NextResponse.json({
            repos,
            hasPrivateAccess,
        });

    } catch (error) {
        console.error("Error fetching user repos:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
