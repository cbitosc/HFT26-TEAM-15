# RepoMind implementation progress

**Last updated:** 2026-10-31
**Current database:** SQLite through Prisma (`DATABASE_URL=file:./dev.db`, stored in `prisma/dev.db`).
**Overall status:** Local app starts and serves pages. The five-phase feature work remains as described below; external service and production verification are incomplete.

## Latest user request: isolated developer collaboration rooms

**Branch:** `collabortaion` (created from the current `main` worktree; existing uncommitted work was preserved).

Implemented signed-in, invite-only rooms with a shared goal, optional GitHub repository reference, member list, discussion, and open/done task board. Rooms are capped at eight members. Invite codes use cryptographic randomness; only SHA-256 hashes are stored, and owners can rotate the invite. Room APIs check membership before returning or changing room data. Invite links preserve the code across GitHub sign-in. The client refreshes room state every eight seconds.

Files: `src/app/collaboration/**`, `src/app/api/collaboration/rooms/**`, `src/components/collaboration/**`, `src/lib/collaboration-rooms.ts`, Prisma models and `prisma/migrations-sqlite/20261031120000_collaboration_rooms/migration.sql`; documented in `docs/collaboration-rooms.md` and README. Unit tests cover input limits, GitHub URL validation, task states, and invite code hashing.

**Verification:** `npx vitest run src/lib/__tests__/collaboration-rooms.test.ts` passed (3 tests); targeted ESLint passed; `git diff --check` passed; `npx prisma validate` and `npx prisma generate` passed. `npx tsc --noEmit` still exits nonzero on existing repository test typing issues (Next metadata tests plus `diagram-utils`, `gemini-file-selection`, and `storage` test types); no collaboration source file appears in the reported errors. The production build was stopped because an existing `npm run dev` / Next dev server was running against this checkout's shared `.next` directory, so build verification is pending.

**Migration blocker:** `npx prisma migrate dev --name collaboration_rooms` refused to proceed because the already-applied `20261031000100_initial_sqlite` migration file was modified after it was applied. It requested a database reset, which was not performed to preserve the local database. A forward-only migration was added, but local database application and persistence integration checks remain blocked until the pre-existing migration checksum mismatch is resolved safely. No production database was touched.

## Latest user request: ZIP file input

Added a homepage **Upload a ZIP instead** option and `/upload` analysis page. The route processes the archive in memory and reuses the deterministic source analyzer, import graph, technology and dependency inventory, and supported OSV checks. The page provides coverage status and a source explorer. ZIP code is never executed or persisted. Limits and archive path/symlink/special-file checks are documented in `docs/repository-intelligence.md`.

Scope: ZIP uploads support repository intelligence and source inspection. They do not currently enter the GitHub-specific chat, security-scan, saved scan, or dashboard workflows. A live UI upload has not yet been manually exercised; service tests cover valid source/dependency extraction, path traversal rejection, compressed-size limits, and partial coverage for binary files.

## Latest user request: source architecture diagram

Added a directed file/class/function/method graph to both GitHub and ZIP source explorers. Files contain symbol nodes; call and constructor edges are produced from AST/heuristic call references and link only to same-file or resolved imported symbols. Ambiguous and dynamic/runtime relationships are not guessed. Clicking a graph node selects its source file. The graph is bounded to 2,500 nodes and 5,000 edges. Analyzer version changed to 1.4.0 to refresh older cached snapshots.

## Latest user request: use SQLite

DEC-02 records the user's explicit switch from PostgreSQL to SQLite. The active Prisma schema uses the SQLite provider. Active migrations are in `prisma/migrations-sqlite/`; previous PostgreSQL migrations remain in `prisma/migrations/` as historical files. No PostgreSQL data was transferred; the local SQLite database starts empty.

`npm run dev` creates the SQLite database file if needed, applies migrations, and starts Next.js. `.env.local` is git-ignored and configured for local development. The database file itself is git-ignored. The current Vercel deployment is not supported by local-file SQLite because its filesystem is not durable/shared; use self-hosted persistent writable storage or approve a separate hosting design before deployment.

## Multi-agent audit and GitHub request fix

The user supplied a collaboration protocol, so the lead assigned non-overlapping read-only audits to frontend, backend, and QA agents, then assigned QA only the new GitHub-client regression test. Reports were reviewed and cross-checked against code. They confirmed that pasted GitHub URLs normalize correctly, but the local machine's anonymous GitHub request returned HTTP 403 due to exhausted quota. The backend audit found Octokit's rate-limit retry and incomplete timeout composition could leave jobs at `RUNNING/starting`; the chat loader also labeled all repository retrieval errors as “not found.”

The lead changed `createGitHubClient` to stop quota retry waits, disable automatic retries that could outlive the configured timeout, and combine that timeout with caller abort signals. `fetchGitHubData` now returns a specific rate-limit/access message instead of mislabeling the issue as a missing repository. A successful live GitHub analysis remains unverified until a valid server-side `GITHUB_TOKEN` is configured.

## Runtime verification

- `npm run prisma:deploy` — passed; SQLite migration applied, no pending migrations.
- `npx prisma validate` — passed.
- `npx prisma generate` — passed.
- `npm run dev` — started successfully at `http://localhost:3000`.
- HTTP smoke checks — `/` returned 200; `/privacy` returned 200; `/repo/octocat/Hello-World/intelligence` returned 200; `/api/repo-intelligence` returned 400 for the expected missing-input request.
- Local site rendering is verified. GitHub login, repository analysis, AI chat and KV-backed behavior are not verified without real service credentials.

## Five-phase implementation status

| Phase | Status | Remaining acceptance |
|---|---|---|
| 1 — Deterministic repository intelligence | Implemented locally; unit-tested | Live GitHub and real persisted-data workflow not tested. |
| 2 — Architecture and dependency graph | Implemented locally; unit-tested | Live repository/advisory behavior not tested. |
| 3 — Security analysis and findings | Existing scanner reused and related suite passes | Full live repository validation remains incomplete. |
| 4 — Grounded chat and code review | Implemented locally; relevant tests pass | Real Gemini, private repo and complete review journey not tested. |
| 5 — Reliability, security and operations | Partially implemented and locally verified | No browser E2E harness, production telemetry, persistent multi-instance hosting or deployment verification. |

Task IDs, dependencies, criteria, and task-level audit are in `IMPLEMENTATION_PLAN.md`. Task summaries remain: P1-09 partial, P1-16 partial; P2 implementation local/unverified live; P3 reused scanner but full acceptance partial; P4 local implementation/unverified live; P5-09 and P5-11–12 incomplete.

## Checks

- `npm test` — **96 files, 561 tests passed** after the GitHub rate-limit/timeout changes.
- `npx vitest run src/lib/__tests__/github-client.test.ts` — **2 tests passed** (no delayed retry on exhausted quota; request timeout composes with caller abort signal and rejects the outer request).
- `npx eslint` on the GitHub client, repository-fetch action, new test, SQLite setup and changed database-related files — passed with no reported issues.
- `npx tsc --noEmit` — still reports existing repository test typing errors (Next metadata assertions, `diagram-utils.test.ts`, `gemini-file-selection.test.ts`, `storage.test.ts`); no SQLite implementation errors remain.
- `git diff --check` — passed after normalizing changed text files.
- Latest type check after GitHub client changes: full `tsc` continues to report only the existing Next metadata and utility test typing errors; no errors in the changed GitHub code or new test.
- `npm run build` — **passed** after the SQLite switch; all 300 static pages were generated. During prerendering, the optional public analytics snapshot logged missing `KV_REST_API_URL` and `KV_REST_API_TOKEN`, then fell back to zero counts. KV-backed analytics are therefore not verified locally.
- `npm test` after ZIP input — **97 files, 565 tests passed**.
- `npx eslint` on the ZIP service, test, upload route/page/components, and shared repository search — passed with no reported issues.
- `npm run build` after ZIP input — **passed**; `/upload` and `/api/repo-intelligence/upload` appear in the production route list, and all 302 static pages were generated. Optional KV analytics again logged missing `KV_REST_API_URL` / `KV_REST_API_TOKEN` and fell back to zero counts.
- `npx tsc --noEmit` — still fails only on pre-existing metadata assertions and utility test typing issues; no errors in ZIP-related files were reported.
- The Next.js development server remains stopped; no listener remains on port 3000.
- Source architecture diagram: `npm test` — **98 files, 569 tests passed**; focused analyzer/symbol graph tests — **10 passed** after the final constructor-chain link adjustment; targeted ESLint passed; `npm run build` passed and includes the `/upload` routes. The build reports the existing missing optional KV settings and falls back to zero analytics counts.
- `npx tsc --noEmit` continues to show only existing Next metadata-test and utility-test type errors; the production build's TypeScript stage passed.

## Configuration and limitations

- `.env.local` has local SQLite and placeholder values only. Add valid `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`, `GITHUB_TOKEN`, and `GEMINI_API_KEY` for login, repository retrieval, and AI features respectively. KV, Blob, Resend and cron credentials are feature-specific.
- No PostgreSQL-to-SQLite data migration was performed. Treat existing PostgreSQL production data as separate until a planned/exported migration is implemented.
- SQLite requires a persistent writable file and backups. The current Vercel deployment is not supported with this local-file setup.
- Repository parsers, graph and dependency/advisory checks are bounded; analysis runs within Next.js `after()` rather than an external durable queue. See `docs/repository-intelligence.md`.
- `docs/decisions.md` records DEC-01 (retain Next.js + Prisma) and DEC-02 (SQLite database selection).
