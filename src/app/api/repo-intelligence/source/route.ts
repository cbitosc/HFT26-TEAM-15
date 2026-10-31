import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCachedFile, cacheFile } from "@/lib/cache";
import { createGitHubClient } from "@/lib/github";
import { getSessionAuthState, getSessionUserId, getInvalidSessionApiError } from "@/lib/session-guard";
import { getGitHubAccessTokenForUser } from "@/lib/services/github-account";
import { REPO_INTELLIGENCE_VERSION, type RepositoryIntelligence } from "@/lib/repo-intelligence/types";

export async function GET(request: NextRequest) {
    const session = await auth();
    const authState = getSessionAuthState(session);
    if (authState === "invalid") return NextResponse.json(getInvalidSessionApiError(), { status: 401 });
    const userId = getSessionUserId(session) ?? undefined;
    const params = request.nextUrl.searchParams;
    const id = params.get("analysisId");
    const owner = params.get("owner")?.trim().toLowerCase();
    const repo = params.get("repo")?.trim().toLowerCase();
    const path = params.get("path") ?? "";
    if (!id || !owner || !repo || !path || path.startsWith("/") || path.includes("\\") || path.split("/").some((segment) => segment === ".." || !segment)) {
        return NextResponse.json({ error: "A valid analysisId, owner, repo, and repository-relative path are required." }, { status: 400 });
    }

    try {
        const privateScope = userId ? `user:${userId}` : "__no_private_scope__";
        const record = await prisma.repositoryIntelligence.findFirst({
            where: { id, owner, repo, analyzerVersion: REPO_INTELLIGENCE_VERSION, cacheScope: { in: ["public", privateScope] } },
            select: { result: true, cacheScope: true },
        });
        if (!record) return NextResponse.json({ error: "Analysis snapshot not found." }, { status: 404 });
        const analysis = record.result as unknown as RepositoryIntelligence;
        const file = analysis.files.find((item) => item.path === path);
        if (!file) return NextResponse.json({ error: "This file was not included in the analysis snapshot." }, { status: 404 });

        const accessToken = userId ? await getGitHubAccessTokenForUser(userId) ?? undefined : undefined;
        if (record.cacheScope.startsWith("user:") && (!userId || !accessToken)) return NextResponse.json({ error: "GitHub authorization is required for this private repository." }, { status: 403 });
        const policy = { audience: userId ? "authenticated" as const : "anonymous" as const, actorId: userId ?? "repo-intelligence-anonymous", visibility: record.cacheScope === "public" ? "public" as const : "private" as const };
        let content = await getCachedFile(owner, repo, file.path, file.blobSha, policy);
        if (content === null || content === undefined) {
            const response = await createGitHubClient(accessToken).rest.git.getBlob({ owner, repo, file_sha: file.blobSha });
            content = Buffer.from(response.data.content, "base64").toString("utf8");
            if (content.includes("\u0000")) return NextResponse.json({ error: "The selected source is binary and cannot be previewed." }, { status: 415 });
            if (Buffer.byteLength(content, "utf8") > 512 * 1024) return NextResponse.json({ error: "The selected source exceeds the preview size limit." }, { status: 413 });
            await cacheFile(owner, repo, file.path, file.blobSha, content, policy);
        }
        return NextResponse.json({ path: file.path, blobSha: file.blobSha, content, lineCount: file.lineCount }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 502;
        console.error("Repository source preview failed:", { owner, repo, status });
        return NextResponse.json({ error: status === 404 ? "Source file is no longer available at this revision." : "Source file could not be loaded." }, { status: status === 404 ? 404 : 502 });
    }
}
