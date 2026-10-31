# Collaboration rooms

Collaboration rooms give a small group of signed-in developers a private place to coordinate work around one goal and, optionally, one GitHub repository. Members share a discussion thread and a simple task board. Each room is limited to eight developers.

## User flow

1. A signed-in user opens `/collaboration`, creates a room name and goal, and may attach an `https://github.com/owner/repo` link.
2. The creator becomes the room owner. The room page offers **Create / rotate invite**. The owner copies the resulting `/collaboration/join?invite=...` URL and sends it to teammates.
3. Invitees sign in with a configured Google or GitHub provider, and the invite route joins them to the room. Existing members can also join by pasting an invite code on the collaboration home page.
4. Members see the room goal, member list, shared tasks and room discussion. Task status and messages are shared with all room members. The client polls room state every eight seconds.

Invite codes are generated from cryptographic random bytes. Only a SHA-256 hash is persisted. Rotating an invite replaces the previous hash, invalidating earlier codes. Anyone holding the current invite can join until the eight-member cap is reached, so invite links should be shared only with intended teammates. Only members can read the room API; non-members receive a not-found response. The room owner is the only user who can rotate its invite.

## Implementation and data flow

- `src/app/collaboration/page.tsx` and `src/app/collaboration/rooms/[roomId]/page.tsx` require a valid NextAuth session.
- `src/components/collaboration/CollaborationHome.tsx` creates rooms and joins via code; `CollaborationInvite.tsx` preserves invite links through GitHub sign-in; `CollaborationRoomWorkspace.tsx` polls and displays the room, posts messages/tasks, and updates task states.
- `src/app/api/collaboration/rooms/route.ts` lists a user's memberships and creates rooms with an owner membership in one Prisma transaction.
- `src/app/api/collaboration/rooms/join/route.ts` hashes and validates an invite, then adds the signed-in user if capacity allows.
- `src/app/api/collaboration/rooms/[roomId]/route.ts` enforces membership for reads, posts and task updates. Reads return up to the latest 100 messages.
- `src/app/api/collaboration/rooms/[roomId]/invite/route.ts` restricts invite rotation to the owner.
- `src/components/AuthProviderButtons.tsx` renders only providers exposed by Auth.js, so an unconfigured provider is not offered.
- `src/lib/collaboration-rooms.ts` contains invite generation/hashing and bounded request validation.
- `prisma/schema.prisma` adds `CollaborationRoom`, `CollaborationRoomMember`, `CollaborationRoomMessage` and `CollaborationRoomTask`, related to existing `User` records. The forward-only SQLite migration is `prisma/migrations-sqlite/20261031120000_collaboration_rooms/migration.sql`.

## API contract

- `GET /api/collaboration/rooms`: list rooms for the current user.
- `POST /api/collaboration/rooms`: `{ name, goal, repositoryUrl? }`; responds with the room and the initial invite code (shown only at creation time).
- `POST /api/collaboration/rooms/join`: `{ inviteCode }`; responds with `{ roomId }`.
- `GET /api/collaboration/rooms/{roomId}`: member-only room metadata, members, latest messages and tasks.
- `POST /api/collaboration/rooms/{roomId}`: `{ type: "message", body }` or `{ type: "task", title }`.
- `PATCH /api/collaboration/rooms/{roomId}`: `{ taskId, status: "OPEN" | "DONE" }`.
- `POST /api/collaboration/rooms/{roomId}/invite`: owner only; rotates invite and returns `{ inviteCode }`.

Unauthenticated requests return 401. Invalid room input returns 400. Unknown or inaccessible rooms return 404 to avoid exposing room existence. A full room returns 409 on join.

## Local setup and checks

No additional secrets or services are needed beyond the existing GitHub OAuth and SQLite setup. Apply the SQLite migration using the normal local Prisma migration workflow after confirming the selected local database and migration history. Do not reset the SQLite database to work around an existing migration-history mismatch.

Unit tests for validation and invite hashing are in `src/lib/__tests__/collaboration-rooms.test.ts`. API database integration and a multi-account browser journey should also be exercised in a clean local SQLite environment before production use.

## Limitations

- Rooms are private by membership, but invite URLs are bearer secrets. There is one active invite per room; owner rotation invalidates all prior invites.
- Room updates use eight-second polling, not WebSockets or presence indicators.
- The task board supports open/done status only, with no assignee, due date, comments, or deletion controls.
- Messages retain the latest 100 in the UI, while older messages remain stored and are not paginated yet.
- The optional repository URL is a collaboration reference; it does not automatically attach analysis results or grant private GitHub access to other members.
- SQLite limits cross-instance deployment. Use the project's documented persistent-storage constraints.
