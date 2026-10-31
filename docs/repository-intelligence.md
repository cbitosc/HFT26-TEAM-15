# Repository Intelligence

Repository Intelligence adds deterministic source analysis to the Next.js App Router application. It uses Octokit, NextAuth, Prisma with SQLite, Vercel KV, Gemini, and the existing Tailwind UI. It never executes repository files.

## Data flow

The user selects a repository and branch. A server Route Handler resolves a commit, retrieves a bounded GitHub tree and blob set, and passes source contents to deterministic analysis modules. The resulting evidence, file inventory, dependencies and graph are stored as a versioned Prisma snapshot. The workspace requests exact source blobs only after validating the requested path against the stored snapshot.

`src/lib/repo-intelligence/` contains deterministic parsers, graph construction, dependency inventory, context selection and contract validation. `src/lib/services/repo-intelligence-service.ts` handles bounded retrieval and persistence. `src/app/api/repo-intelligence/` provides analysis and safe source preview endpoints. The UI lives under `src/app/repo/[owner]/[repo]/intelligence/` and `src/components/repo-intelligence/`.

## SQLite setup

Set `DATABASE_URL="file:./dev.db"` in `.env.local`. This resolves to `prisma/dev.db`. Run `npm run dev`; startup creates the empty file and applies active SQLite migrations automatically. `npm run prisma:deploy` applies migrations without starting Next.js. Prisma schema/client commands are:

```powershell
npx prisma validate
npx prisma generate
```

The SQLite schema and active migration history are `prisma/schema.prisma` and `prisma/migrations-sqlite/`. Historical PostgreSQL migrations under `prisma/migrations/` are not active. The SQLite file is ignored by Git. No existing PostgreSQL data is copied automatically.

Public GitHub analysis needs a GitHub token for reliable API limits; private analysis requires a signed-in user whose server-side OAuth account has access to the repository. AI chat requires a Gemini API key. Those credentials remain server-side.

GitHub rate-limit and secondary-rate-limit responses fail immediately instead of waiting until the quota reset, and request timeouts are combined with any caller cancellation signal. The UI receives an actionable rate-limit/access message. For public repositories, configure a server-side `GITHUB_TOKEN` when the machine's shared unauthenticated quota is exhausted.

## Limits and known limitations

- At most 800 source/config/manifest/documentation files, 512 KiB per file, 16 MiB total source, 20,000 recovered tree entries, 1,000 tree directories and 45 seconds of analysis work. Each GitHub request has a 12-second timeout.
- Graph projection is bounded to 1,500 nodes and 5,000 import edges; the visual node panel shows up to 72 at a time. Truncation is disclosed.
- At most 50 exact dependency versions are checked per snapshot. OSV uses a five-second timeout. Ranges, unknown versions and excess dependencies retain `not-checked` state.
- Parsing is strongest for JS/TS. Other languages use intentionally narrow heuristics; missing support is not proof of absence.
- The job runner runs within the Next.js `after()` lifetime (`maxDuration = 60`), not an external durable queue.
- SQLite needs persistent writable storage and backups. The current Vercel deployment is not supported with local-file SQLite.

## Tests

Focused local coverage includes analysis extraction, dependency manifests and advisory outages, graph resolution/bounds, validation, chat path prioritization, line-numbered context and prompt grounding. Run `npm test` for the full Vitest suite. Unit tests do not imply live GitHub, Gemini, OSV or deployment verification.
# ZIP archive input

The homepage's **Upload a ZIP instead** link opens `/upload`. The upload route accepts one `.zip` archive and runs the deterministic source intelligence analyzer over supported source, manifest, configuration, and documentation files. The results page shows technologies, import relationships, dependency inventory and supported OSV checks, plus source content in the current page.

Both ZIP analysis and GitHub intelligence include a directed source architecture diagram in the source explorer. File nodes contain class/function/method nodes; call and constructor arrows connect locally resolved symbols and uniquely resolved imported symbols. The **Data flow (static call paths)** view starts at detected entry points and follows those directed call/containment edges. It visualizes which calls are statically connected from an entry point; it does not trace individual variable values, taint, or runtime execution. JavaScript/TypeScript call references come from the Babel AST; other supported languages use conservative declaration/call patterns. The graph shows only relationships the static analyzer can resolve, omits ambiguous same-name targets, and does not infer dynamic dispatch or reflection. Clicking an entry point or graph node opens its file and available source line. Entry points are supported Next.js App Router and Pages Router routes, Python `__main__` guards and conventional `main.py`/WSGI/ASGI/manage modules, Go/Rust/main-method declarations, and conventional JavaScript/TypeScript startup module names or executable guards. These are deterministic source signals, not proof that deployment actually invokes that code. The graph is bounded to 2,500 nodes and 5,000 edges and discloses truncation. Analyzer version 1.5.0 adds entry-point evidence and invalidates older snapshots.

Uploads are processed in memory and are not persisted by RepoMind. Repository code is never executed. Limits are 50 MB compressed, 20,000 archive entries, 800 supported files, 512 KB per file, and 16 MB of total supported content. Unsafe paths, symbolic links, special files, invalid archives, and archives beyond the aggregate/count limits are rejected. Oversized supported files and binary source files are skipped and disclosed as partial coverage. ZIP input currently does not connect to GitHub-specific chat, saved scans, or the existing security scan workflow.
