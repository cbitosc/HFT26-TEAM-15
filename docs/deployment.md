# Deployment

RepoMind currently uses Next.js App Router, Prisma, and SQLite. SQLite stores data in a local file, so the application needs a persistent writable disk shared by every running app instance. The current Vercel deployment does not provide that storage guarantee and must not be treated as a supported deployment for this configuration.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL="file:./dev.db"`.
3. Add real GitHub OAuth and Gemini credentials for those features. Public static pages can run without them; repository analysis, login and AI chat need the corresponding credentials.
4. Run `npm ci` and `npm run dev`. The dev command creates the SQLite file and applies active migrations.

## Self-hosted deployment requirements

- A persistent, writable volume mounted at the path containing the SQLite database.
- Backups of the database file and a tested restore procedure.
- A single migration runner at deployment time before new application code starts.
- Server-side `AUTH_SECRET`, GitHub OAuth credentials, `GITHUB_TOKEN`, and `GEMINI_API_KEY` for the corresponding features.
- Vercel KV variables only for features that use the existing cache/quota integration; Blob, Resend and cron credentials are feature-specific.

Do not deploy multiple app instances that write independent local copies of the SQLite file. For horizontally scaled deployments, SQLite needs a shared-storage design with appropriate locking, or the database architecture must be reconsidered.

## Migrations and data

Active SQLite migrations are in `prisma/migrations-sqlite/`. Apply them with:

```powershell
npm run prisma:deploy
```

The PostgreSQL migration history remains archived under `prisma/migrations/`; it is not used by the current Prisma configuration. Existing PostgreSQL data is not automatically converted. Back up and export/import data through an explicitly designed migration before any production cutover.

Production deployment, restore, and live service checks have not been performed for the SQLite configuration.
