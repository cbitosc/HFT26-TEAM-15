-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "githubLogin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastQueryAt" DATETIME,
    "queryCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    PRIMARY KEY ("provider", "providerAccountId"),
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,

    PRIMARY KEY ("identifier", "token")
);

-- CreateTable
CREATE TABLE "RepoScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "depth" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "RepoScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanFindingVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "findingFingerprint" TEXT NOT NULL,
    "findingIndex" INTEGER NOT NULL,
    "ruleId" TEXT,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER,
    "confidence" TEXT,
    "verificationStatus" TEXT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL,
    "gateDecision" TEXT NOT NULL,
    "verificationScore" REAL,
    "verificationSignals" JSONB,
    "verificationRationale" TEXT,
    "exploitabilityTag" TEXT,
    "closedAt" DATETIME,
    "reopenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScanFindingVerification_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepoScan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixVerificationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "findingFingerprint" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "changedFiles" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "regressionTestsPassed" BOOLEAN,
    "regressionSummary" TEXT,
    "targetedRescanPassed" BOOLEAN,
    "targetedRescanFindings" INTEGER,
    "fullRescanTriggered" BOOLEAN NOT NULL DEFAULT false,
    "fullRescanPassed" BOOLEAN,
    "closeReasons" JSONB,
    "finalizedAt" DATETIME,
    "autoSignedOffAt" DATETIME,
    "requestedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FixVerificationRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FixVerificationRun_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepoScan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepoScanShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RepoScanShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RepoScanShareLink_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepoScan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportFalsePositive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "findingFingerprint" TEXT NOT NULL,
    "findingIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER,
    "confidence" TEXT,
    "isSharedView" BOOLEAN NOT NULL DEFAULT false,
    "submittedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    CONSTRAINT "ReportFalsePositive_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReportFalsePositive_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RepoScan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportFalsePositive_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecentSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    CONSTRAINT "RecentSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "conversationKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "owner" TEXT,
    "repo" TEXT,
    "username" TEXT,
    "messages" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "userId" TEXT,
    "conversationKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "owner" TEXT,
    "repo" TEXT,
    "username" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "partialText" TEXT NOT NULL DEFAULT '',
    "finalText" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepositoryIntelligence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "analyzerVersion" TEXT NOT NULL,
    "cacheScope" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME NOT NULL,
    "coverage" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepositoryIntelligence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepositoryAnalysisJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestKey" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "message" TEXT NOT NULL DEFAULT 'Analysis queued.',
    "errorCode" TEXT,
    "resultId" TEXT,
    "userId" TEXT,
    "actorKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "RepositoryAnalysisJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionalEmailDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "toEmail" TEXT NOT NULL,
    "templateData" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "providerEventType" TEXT,
    "providerPayload" JSONB,
    "lastAttemptAt" DATETIME,
    "nextRetryAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransactionalEmailDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date" TEXT,
    "author" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "keywords" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubLogin_key" ON "User"("githubLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "RepoScan_owner_repo_timestamp_idx" ON "RepoScan"("owner", "repo", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "RepoScan_userId_timestamp_idx" ON "RepoScan"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ScanFindingVerification_scanId_createdAt_idx" ON "ScanFindingVerification"("scanId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ScanFindingVerification_owner_repo_findingFingerprint_createdAt_idx" ON "ScanFindingVerification"("owner", "repo", "findingFingerprint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ScanFindingVerification_lifecycleStatus_createdAt_idx" ON "ScanFindingVerification"("lifecycleStatus", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ScanFindingVerification_scanId_findingFingerprint_findingIndex_key" ON "ScanFindingVerification"("scanId", "findingFingerprint", "findingIndex");

-- CreateIndex
CREATE INDEX "FixVerificationRun_scanId_createdAt_idx" ON "FixVerificationRun"("scanId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FixVerificationRun_owner_repo_findingFingerprint_createdAt_idx" ON "FixVerificationRun"("owner", "repo", "findingFingerprint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FixVerificationRun_status_createdAt_idx" ON "FixVerificationRun"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RepoScanShareLink_scanId_key" ON "RepoScanShareLink"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoScanShareLink_tokenHash_key" ON "RepoScanShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "RepoScanShareLink_scanId_createdAt_idx" ON "RepoScanShareLink"("scanId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RepoScanShareLink_createdByUserId_createdAt_idx" ON "RepoScanShareLink"("createdByUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RepoScanShareLink_expiresAt_idx" ON "RepoScanShareLink"("expiresAt");

-- CreateIndex
CREATE INDEX "ReportFalsePositive_scanId_createdAt_idx" ON "ReportFalsePositive"("scanId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReportFalsePositive_status_createdAt_idx" ON "ReportFalsePositive"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReportFalsePositive_submittedByUserId_createdAt_idx" ON "ReportFalsePositive"("submittedByUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RecentSearch_userId_timestamp_idx" ON "RecentSearch"("userId", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RecentSearch_userId_query_key" ON "RecentSearch"("userId", "query");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_updatedAt_idx" ON "ChatConversation"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_userId_conversationKey_key" ON "ChatConversation"("userId", "conversationKey");

-- CreateIndex
CREATE INDEX "ChatRun_actorId_updatedAt_idx" ON "ChatRun"("actorId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ChatRun_conversationKey_updatedAt_idx" ON "ChatRun"("conversationKey", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatRun_actorId_conversationKey_clientRequestId_key" ON "ChatRun"("actorId", "conversationKey", "clientRequestId");

-- CreateIndex
CREATE INDEX "RepositoryIntelligence_owner_repo_branch_updatedAt_idx" ON "RepositoryIntelligence"("owner", "repo", "branch", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "RepositoryIntelligence_userId_updatedAt_idx" ON "RepositoryIntelligence"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "repository_intelligence_unique_commit_scope" ON "RepositoryIntelligence"("owner", "repo", "branch", "commitSha", "analyzerVersion", "cacheScope");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryAnalysisJob_requestKey_key" ON "RepositoryAnalysisJob"("requestKey");

-- CreateIndex
CREATE INDEX "RepositoryAnalysisJob_userId_createdAt_idx" ON "RepositoryAnalysisJob"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RepositoryAnalysisJob_owner_repo_createdAt_idx" ON "RepositoryAnalysisJob"("owner", "repo", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RepositoryAnalysisJob_status_updatedAt_idx" ON "RepositoryAnalysisJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "RepositoryAnalysisJob_actorKey_createdAt_idx" ON "RepositoryAnalysisJob"("actorKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TransactionalEmailDelivery_status_nextRetryAt_idx" ON "TransactionalEmailDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "TransactionalEmailDelivery_providerMessageId_idx" ON "TransactionalEmailDelivery"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalEmailDelivery_userId_template_key" ON "TransactionalEmailDelivery"("userId", "template");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_published_publishedAt_idx" ON "BlogPost"("published", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "BlogPost_published_createdAt_idx" ON "BlogPost"("published", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BlogPost_slug_idx" ON "BlogPost"("slug");
