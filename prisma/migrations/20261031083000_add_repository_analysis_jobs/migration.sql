CREATE TYPE "RepositoryAnalysisJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

CREATE TABLE "RepositoryAnalysisJob" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT,
    "status" "RepositoryAnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "message" TEXT NOT NULL DEFAULT 'Analysis queued.',
    "errorCode" TEXT,
    "resultId" TEXT,
    "userId" TEXT,
    "actorKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RepositoryAnalysisJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositoryAnalysisJob_requestKey_key" ON "RepositoryAnalysisJob"("requestKey");
CREATE INDEX "RepositoryAnalysisJob_userId_createdAt_idx" ON "RepositoryAnalysisJob"("userId", "createdAt" DESC);
CREATE INDEX "RepositoryAnalysisJob_owner_repo_createdAt_idx" ON "RepositoryAnalysisJob"("owner", "repo", "createdAt" DESC);
CREATE INDEX "RepositoryAnalysisJob_status_updatedAt_idx" ON "RepositoryAnalysisJob"("status", "updatedAt");
CREATE INDEX "RepositoryAnalysisJob_actorKey_createdAt_idx" ON "RepositoryAnalysisJob"("actorKey", "createdAt" DESC);

ALTER TABLE "RepositoryAnalysisJob" ADD CONSTRAINT "RepositoryAnalysisJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
