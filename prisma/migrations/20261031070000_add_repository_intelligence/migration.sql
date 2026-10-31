CREATE TABLE "RepositoryIntelligence" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "analyzerVersion" TEXT NOT NULL,
    "cacheScope" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "coverage" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryIntelligence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repository_intelligence_unique_commit_scope"
ON "RepositoryIntelligence"("owner", "repo", "branch", "commitSha", "analyzerVersion", "cacheScope");

CREATE INDEX "RepositoryIntelligence_owner_repo_branch_updatedAt_idx"
ON "RepositoryIntelligence"("owner", "repo", "branch", "updatedAt" DESC);

CREATE INDEX "RepositoryIntelligence_userId_updatedAt_idx"
ON "RepositoryIntelligence"("userId", "updatedAt" DESC);

ALTER TABLE "RepositoryIntelligence" ADD CONSTRAINT "RepositoryIntelligence_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
