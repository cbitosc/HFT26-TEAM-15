# Architecture decisions

## DEC-01 — Retain Next.js and Prisma

- **Status:** Accepted.
- **Date:** 2026-10-31
- **Decision owner:** User

Retain the existing Next.js App Router and Prisma application. Do not migrate to Base44 or introduce another backend. This remains in effect after the later database change.

The checkout already contains working route handlers, server actions, GitHub/Octokit retrieval, Gemini integrations, NextAuth, Prisma models, chat, reports, dashboards and security scanning. Replacing the application framework would create unnecessary rewrite risk.

## DEC-02 — Use SQLite instead of PostgreSQL

- **Status:** Accepted and applied to the working tree.
- **Date:** 2026-10-31
- **Decision owner:** User
- **Supersedes:** DEC-01's PostgreSQL choice only; the Next.js + Prisma architecture remains.

### Decision and rationale

Use a local SQLite file through Prisma. The user explicitly requested SQLite instead of PostgreSQL after local startup was blocked by the absence of PostgreSQL credentials. This enables local startup without provisioning a database server.

### Consequences

1. `prisma/schema.prisma` uses the SQLite provider and `DATABASE_URL="file:./dev.db"` by default. The database is stored at `prisma/dev.db` and ignored by Git.
2. Existing Prisma enum fields remain in the schema and retain their generated TypeScript types. SQLite does not enforce enum membership in the database itself; callers should continue using Prisma-generated enum values and validate API input.
3. Active SQLite migrations live in `prisma/migrations-sqlite/`. The original PostgreSQL migrations remain under `prisma/migrations/` as historical files and are not used by the SQLite Prisma config.
4. No PostgreSQL data was copied. The new SQLite database starts empty; seed content or user records must be recreated separately.
5. SQLite requires a persistent, writable filesystem and is suitable for local development or a self-hosted deployment with durable storage. The current Vercel deployment model is not compatible with a local SQLite file as durable shared storage; do not deploy this configuration to Vercel without a separately approved persistent SQLite hosting design.
6. Vercel KV remains an external cache/quota service; it is not the relational source of truth.
7. Next.js Route Handlers/server actions, server-side services, Octokit, Gemini, Prisma, existing API contracts and server-side credential boundaries remain unchanged.

### Verification

Prisma schema validation, client generation, SQLite migration application and runtime checks are recorded in `PROGRESS.md`. Production deployment and PostgreSQL data migration were not performed.
