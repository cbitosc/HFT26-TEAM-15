# Architecture

RepoMind is a Next.js App Router application with server-side services and Prisma persistence in SQLite.

```text
Browser (React 19)
  -> Next.js App Router pages, Route Handlers, Server Actions
       -> application services (src/lib/services)
            -> GitHub / Gemini integrations (server credentials only)
            -> Prisma Client (src/lib/db.ts) -> SQLite file (prisma/dev.db locally)
            -> Vercel KV for existing cache/quota functions
```

## Database

The active schema is `prisma/schema.prisma`, configured with the SQLite provider. Local `DATABASE_URL="file:./dev.db"` resolves to `prisma/dev.db`. The `dev` and `prisma:deploy` scripts create the empty file when needed and apply the SQLite migrations from `prisma/migrations-sqlite/`.

Historical PostgreSQL migrations remain in `prisma/migrations/`; they are not used by the active Prisma config. There is no automatic PostgreSQL-to-SQLite data transfer. Prisma enum fields preserve generated TypeScript types, but SQLite does not enforce enum membership at the database layer.

SQLite is a local file database. Keep that file on persistent writable storage and include it in backups. The current Vercel deployment is not suitable for this database configuration because its filesystem is ephemeral across instances; deployment there requires a separately approved persistent SQLite solution or another architecture decision.

## Server and external services

Route Handlers live under `src/app/api/**/route.ts`; server actions are in `src/app/actions.ts`. Deterministic repository analysis belongs in request-independent modules in `src/lib/repo-intelligence/` and `src/lib/services/`. GitHub, OAuth and Gemini credentials remain server-side. Repository content is untrusted input and is never executed.

## Verification

Use `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx prisma generate`, and `npm run build`. Checks requiring GitHub, Gemini, KV or deployment credentials must report those prerequisites and must not claim live verification when unavailable. Local development uses `.env.local` and `npm run dev`.
