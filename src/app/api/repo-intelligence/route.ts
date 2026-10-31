import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSessionAuthState, getSessionUserId, getInvalidSessionApiError } from "@/lib/session-guard";
import { getGitHubAccessTokenForUser } from "@/lib/services/github-account";
import { analyzeRepository, RepositoryAnalysisError } from "@/lib/services/repo-intelligence-service";
import { validateRepoAnalysisInput } from "@/lib/repo-intelligence/validation";
import { REPO_INTELLIGENCE_VERSION, type RepositoryIntelligence } from "@/lib/repo-intelligence/types";

export const maxDuration = 60;

function errorResponse(error: unknown): NextResponse {
    if (error instanceof RepositoryAnalysisError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Repository intelligence request failed:", error);
    return NextResponse.json({ error: "Repository analysis is temporarily unavailable.", code: "ANALYSIS_UNAVAILABLE" }, { status: 503 });
}

async function resolveActor() {
    const session = await auth();
    const authState = getSessionAuthState(session);
    if (authState === "invalid") return { error: NextResponse.json(getInvalidSessionApiError(), { status: 401 }) };
    const userId = getSessionUserId(session);
    let accessToken: string | undefined;
    if (userId) {
        try {
            accessToken = (await getGitHubAccessTokenForUser(userId)) ?? undefined;
        } catch (error) {
            console.error("Could not read server-side GitHub account credential:", error);
        }
    }
    return { userId: userId ?? undefined, accessToken };
}

export async function POST(request: NextRequest) {
    const actor = await resolveActor();
    if (actor.error) return actor.error;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const validated = validateRepoAnalysisInput(body);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    try {
        const requestBody = body as Record<string, unknown>;
        const requestKeyHeader = request.headers.get("idempotency-key");
        const requestKeyInput = requestKeyHeader ?? requestBody.requestKey;
        const requestKey = typeof requestKeyInput === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(requestKeyInput) ? requestKeyInput : randomUUID();
        const prior = await prisma.repositoryAnalysisJob.findUnique({ where: { requestKey } });
        if (prior) {
            if (prior.owner !== validated.value.owner || prior.repo !== validated.value.repo || prior.userId !== (actor.userId ?? null)) {
                return NextResponse.json({ error: "Idempotency key was already used for a different request." }, { status: 409 });
            }
            return NextResponse.json({ job: { id: prior.id, status: prior.status.toLowerCase(), progress: prior.progress, stage: prior.stage, message: prior.message, error: prior.errorCode } }, { status: 202 });
        }

        const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const ip = request.headers.get("x-real-ip") ?? forwardedFor;
        const actorKey = actor.userId ? `user:${actor.userId}` : `ip:${createHmac("sha256", process.env.AUTH_SECRET ?? "repomind-rate-limit").update(ip).digest("hex")}`;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentJobs = await prisma.repositoryAnalysisJob.count({ where: { actorKey, createdAt: { gte: oneHourAgo } } });
        const maxJobsPerHour = actor.userId ? 20 : 5;
        if (recentJobs >= maxJobsPerHour) return NextResponse.json({ error: "Repository analysis limit reached. Try again later." }, { status: 429 });

        const job = await prisma.repositoryAnalysisJob.create({ data: {
            requestKey,
            owner: validated.value.owner,
            repo: validated.value.repo,
            branch: validated.value.branch,
            userId: actor.userId,
            actorKey,
        }, select: { id: true, status: true, progress: true, stage: true, message: true } });

        after(async () => {
            const started = await prisma.repositoryAnalysisJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "RUNNING", stage: "starting", progress: 5, message: "Starting repository analysis." } });
            if (started.count === 0) return;
            try {
                const result = await analyzeRepository({
                    ...validated.value,
                    userId: actor.userId,
                    accessToken: actor.accessToken ?? undefined,
                    forceRefresh: requestBody.forceRefresh === true,
                    onProgress: async (stage, progress, message) => {
                        const update = await prisma.repositoryAnalysisJob.updateMany({ where: { id: job.id, status: "RUNNING", progress: { lt: progress } }, data: { stage, progress, message } });
                        if (update.count > 0) return true;
                        const current = await prisma.repositoryAnalysisJob.findUnique({ where: { id: job.id }, select: { status: true } });
                        return current?.status === "RUNNING";
                    },
                });
                await prisma.repositoryAnalysisJob.updateMany({ where: { id: job.id, status: "RUNNING" }, data: {
                    status: result.analysis.coverage.status === "complete" ? "COMPLETED" : "PARTIAL",
                    progress: 100,
                    stage: "complete",
                    message: result.cached ? "Loaded the cached analysis snapshot." : "Repository analysis completed.",
                    resultId: result.analysis.id,
                    completedAt: new Date(),
                } });
            } catch (error) {
                if (error instanceof RepositoryAnalysisError && error.code === "ANALYSIS_CANCELLED") return;
                const safeMessage = error instanceof RepositoryAnalysisError ? error.message : "Repository analysis failed. Try again.";
                const safeCode = error instanceof RepositoryAnalysisError ? error.code : "ANALYSIS_FAILED";
                console.error("Repository intelligence job failed:", { jobId: job.id, code: safeCode, error });
                await prisma.repositoryAnalysisJob.updateMany({ where: { id: job.id, status: "RUNNING" }, data: { status: "FAILED", stage: "failed", message: safeMessage, errorCode: safeCode, completedAt: new Date() } });
            }
        });
        return NextResponse.json({ job: { ...job, status: job.status.toLowerCase() } }, { status: 202 });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function PATCH(request: NextRequest) {
    const actor = await resolveActor();
    if (actor.error) return actor.error;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const id = body && typeof body === "object" && "jobId" in body && typeof body.jobId === "string" ? body.jobId : "";
    const requestKey = body && typeof body === "object" && "requestKey" in body && typeof body.requestKey === "string" ? body.requestKey : "";
    if (!id || !requestKey) return NextResponse.json({ error: "jobId and requestKey are required." }, { status: 400 });
    const job = await prisma.repositoryAnalysisJob.findUnique({ where: { id } });
    if (!job || job.requestKey !== requestKey || (job.userId && job.userId !== actor.userId)) return NextResponse.json({ error: "Analysis job not found." }, { status: 404 });
    if (job.status === "QUEUED" || job.status === "RUNNING") {
        await prisma.repositoryAnalysisJob.updateMany({ where: { id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", stage: "cancelled", message: "Analysis cancelled by the user.", completedAt: new Date() } });
    }
    return NextResponse.json({ cancelled: true });
}

export async function GET(request: NextRequest) {
    const actor = await resolveActor();
    if (actor.error) return actor.error;

    const search = request.nextUrl.searchParams;
    const jobId = search.get("jobId");
    if (jobId) {
        try {
            await prisma.repositoryAnalysisJob.updateMany({
                where: { id: jobId, status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
                data: { status: "FAILED", stage: "recovery", message: "Analysis did not finish. Start a new analysis to retry.", errorCode: "JOB_INTERRUPTED", completedAt: new Date() },
            });
            const job = await prisma.repositoryAnalysisJob.findUnique({ where: { id: jobId }, select: { id: true, owner: true, repo: true, branch: true, status: true, progress: true, stage: true, message: true, errorCode: true, resultId: true, userId: true, updatedAt: true } });
            if (!job || (job.userId && job.userId !== actor.userId)) return NextResponse.json({ error: "Analysis job not found." }, { status: 404 });
            return NextResponse.json({ job: { ...job, status: job.status.toLowerCase(), error: job.errorCode, errorCode: undefined, userId: undefined } });
        } catch (error) { return errorResponse(error); }
    }
    const validated = validateRepoAnalysisInput({ owner: search.get("owner"), repo: search.get("repo"), branch: search.get("branch") ?? undefined });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const privateScope = actor.userId ? `user:${actor.userId}` : "__no_private_scope__";

    try {
        const record = await prisma.repositoryIntelligence.findFirst({
            where: {
                owner: validated.value.owner,
                repo: validated.value.repo,
                ...(validated.value.branch ? { branch: validated.value.branch } : {}),
                analyzerVersion: REPO_INTELLIGENCE_VERSION,
                cacheScope: { in: ["public", privateScope] },
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true, result: true, status: true, updatedAt: true },
        });
        if (!record) return NextResponse.json({ analysis: null }, { status: 200 });
        return NextResponse.json({ analysis: { ...(record.result as unknown as RepositoryIntelligence), id: record.id }, cached: true });
    } catch (error) {
        return errorResponse(error);
    }
}
