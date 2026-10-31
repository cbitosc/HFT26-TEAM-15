# Deployment

RepoMind currently uses Next.js App Router, Prisma, and SQLite. SQLite stores data in a local file, so the application needs a persistent writable disk shared by every running app instance. The current Vercel deployment does not provide that storage guarantee and must not be treated as a supported deployment for this configuration.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL="file:./dev.db"`.
3. Add Google OAuth credentials for general sign-in, plus Gemini credentials for AI features. GitHub OAuth is optional and is used only to connect an account for private repository access. Public static pages can run without OAuth credentials.
4. Run `npm ci` and `npm run dev`. The dev command creates the SQLite file and applies active migrations.

For Google OAuth, add `http://localhost:3000/api/auth/callback/google` to the Google OAuth client's authorized redirect URIs. General sign-in uses Google only. If private repository access is needed, configure a GitHub OAuth app with callback URL `http://localhost:3000/api/auth/callback/github` and set `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`; the app offers GitHub only in the explicit private-repository connection flow. For deployment, register the public origin with the respective callback path. The homepage displays a safe explanation for Auth.js sign-in errors; detailed causes remain in server logs and must not be shown to browsers. Google sign-in creates an application identity but does not grant GitHub account access.

## Self-hosted deployment requirements

- A persistent, writable volume mounted at the path containing the SQLite database.
- Backups of the database file and a tested restore procedure.
- A single migration runner at deployment time before new application code starts.
- Server-side `AUTH_SECRET` and Google OAuth credentials for sign-in; optional GitHub OAuth credentials for private repository connection, `GITHUB_TOKEN` for GitHub API access, and `GEMINI_API_KEY` for AI features.
- Vercel KV variables only for features that use the existing cache/quota integration; Blob, Resend and cron credentials are feature-specific.

Do not deploy multiple app instances that write independent local copies of the SQLite file. For horizontally scaled deployments, SQLite needs a shared-storage design with appropriate locking, or the database architecture must be reconsidered.

## Migrations and data

Active SQLite migrations are in `prisma/migrations-sqlite/`. Apply them with:

```powershell
npm run prisma:deploy
```

The PostgreSQL migration history remains archived under `prisma/migrations/`; it is not used by the current Prisma configuration. Existing PostgreSQL data is not automatically converted. Back up and export/import data through an explicitly designed migration before any production cutover.

Production deployment, restore, and live service checks have not been performed for the SQLite configuration.
