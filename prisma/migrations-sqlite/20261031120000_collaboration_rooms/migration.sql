CREATE TABLE "CollaborationRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "inviteTokenHash" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CollaborationRoomMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CollaborationRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CollaborationRoomMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationRoomMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CollaborationRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationRoomMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CollaborationRoomTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationRoomTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CollaborationRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationRoomTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CollaborationRoom_inviteTokenHash_key" ON "CollaborationRoom"("inviteTokenHash");
CREATE INDEX "CollaborationRoom_ownerId_updatedAt_idx" ON "CollaborationRoom"("ownerId", "updatedAt" DESC);
CREATE UNIQUE INDEX "CollaborationRoomMember_roomId_userId_key" ON "CollaborationRoomMember"("roomId", "userId");
CREATE INDEX "CollaborationRoomMember_userId_joinedAt_idx" ON "CollaborationRoomMember"("userId", "joinedAt" DESC);
CREATE INDEX "CollaborationRoomMessage_roomId_createdAt_idx" ON "CollaborationRoomMessage"("roomId", "createdAt" DESC);
CREATE INDEX "CollaborationRoomTask_roomId_status_createdAt_idx" ON "CollaborationRoomTask"("roomId", "status", "createdAt");
