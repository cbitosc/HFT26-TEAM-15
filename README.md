# RepoMind

<p align="center"><strong>Stop reading code. Start talking to it.</strong></p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" /></a>
  <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Gemini-3.8_Flash-blue" alt="Gemini" /></a>
</p>

<p align="center">
  <a href="https://repomind.in"><strong>Try RepoMind Live</strong></a>
  ·
  <a href="https://repomind.in/repo/facebook/react"><strong>See React Analyzed</strong></a>
  ·
  <a href="https://github.com/403errors/repomind/issues"><strong>Contribute</strong></a>
</p>

[![RepoMind Demo](https://img.youtube.com/vi/3f66xlgpjw0/maxresdefault.jpg)](https://www.youtube.com/watch?v=3f66xlgpjw0)

RepoMind is an open-source, AI-powered platform for understanding public GitHub repositories and developer profiles with **Agentic CAG**. It combines deep code reasoning, architecture visualization, and security scanning into a fast, browser-first experience.

## Why RepoMind

- **Zero setup for public repos**: paste a repo or profile and start immediately.
- **Context-aware analysis**: selects full, relevant files instead of fragmented vector chunks.
- **Visual understanding**: generates architecture maps and flow diagrams for faster onboarding.
- **Security scanning built in**: quick/deep scans with verification-focused reporting.
- **Live step feedback**: chat shows real-time processing stages (selecting files, reading files, preparing answer).
- **Contributor-friendly codebase**: clear TypeScript services, tests, and modular features.

## Product Highlights

### Landing Experience

- **Trending Repositories**: Discover popular and highly-active public repositories directly from the landing page.
- **Real-Time Global Search**: Instant, optimized repository search with auto-complete suggestions for seamless navigation.

![RepoMind Landing Page](public/assets/landing_page.png)

### Repo Profile Intelligence

![Repo Profile Example](public/assets/repo_profile.png)

### Core Capabilities

![RepoMind Capabilities](public/assets/repomind_capabilities.png)

## Agentic CAG Architecture

RepoMind uses **Agentic Context-Augmented Generation (CAG)**. Instead of relying only on embeddings, it prunes and loads coherent source context to answer architecture and implementation questions reliably.

![CAG vs RAG](public/assets/cag_vs_rag.gif)

![Architecture Example](public/assets/architecture_example.png)

## Architecture Flowcharts

These diagrams provide a quick mental model of how RepoMind processes queries, optimizes performance, and validates security findings.

### 1) Query + Context Pipeline

```mermaid
flowchart TD
    A[User enters repo or profile query] --> B[Context-Aware Engine]
    B --> C[Repository/Profile metadata fetch + file tree]
    B --> D[File selection via GEMINI_FILE_SELECTOR_MODEL]
    D --> E[25 files for Lite or 50 files for Thinking]
    E --> F[Fetch selected files with SHA-aware cache reuse]
    F --> G[Build context with repo folder structure + selected files]
    G --> H[Answer generation via Lite or Thinking model]
    H --> I[Streaming response with text-only live steps]
```

### 2) Caching + Retrieval Strategy

```mermaid
flowchart TD
    A[Request selected files] --> B{SHA-keyed file cache hit?}
    B -->|Yes| C{Compressed entry?}
    C -->|Yes| D[Decompress]
    C -->|No| E[Return cached payload]
    D --> E
    B -->|No| F[Fetch only missing/new files from GitHub API]
    F --> G{Payload <= 2MB?}
    G -->|Yes| H[Gzip + store in KV]
    G -->|No| I[Skip cache write]
    H --> J[Return full context]
    I --> J
    J --> K[Cache query -> selected files - 24h]
    J --> L[Cache query answer - 24h]
```

### 3) Security Scan + Verification Flow

```mermaid
flowchart TD
    A[Start scan] --> B{Quick or Deep}
    B --> C[Collect scoped files + dependencies]
    C --> D[Deterministic security engine]
    C --> E[OSV API live vulnerability check]
    D --> F{AI assist enabled?}
    E --> F
    F -->|Yes| G[AI validation pass]
    F -->|No| H[Verification gate]
    G --> H
    H --> I{Verified true?}
    I -->|Yes| J[Show finding in report]
    I -->|No| K[Hide as rejected/inconclusive]
```

## Security Scanning

RepoMind includes a verification-first scanning flow for application and dependency risks.

- Quick scan for fast triage
- Deep scan for broader coverage
- **Real-time dependency checks**: Integrated with [OSV.dev API](https://osv.dev) for latest CVE data
- Verified-first reporting pipeline
- Actionable fixes inside repo chat flow

![Security Report](public/assets/security_report.png)

## Repository Intelligence

Repository profiles include a deterministic source intelligence workspace. It records the branch and commit analyzed, reports file coverage, extracts source imports/routes/symbols, inventories dependencies, and links findings to the inspected GitHub blob. A bounded interactive import graph and source explorer help navigate unfamiliar repositories. Exact dependency versions are checked against OSV; ranges and unavailable lookups remain clearly labeled.

Analyses never execute repository code. Public repository analysis works with the app's configured GitHub access; private repository analysis requires an authenticated account with server-side GitHub authorization. OAuth credentials are not exposed in browser session data.

See [Repository Intelligence setup, API, limits and known limitations](docs/repository-intelligence.md). Local development uses SQLite; see [deployment notes](docs/deployment.md) for persistence requirements and the Vercel limitation.

You can also select **Upload a ZIP instead** from the homepage to inspect a source archive without linking it to a GitHub repository. ZIP analysis covers source structure, imports, technologies, dependency inventory, supported OSV checks, and an in-browser source explorer. The source explorer includes a directed file/class/function graph with statically resolved call links. It does not enable GitHub chat, profile features, or repository security scans for the uploaded archive.

### Collaboration rooms

Signed-in developers can create invite-only rooms for a shared goal, optionally attach a GitHub repository, discuss progress, and maintain a shared task board. Room owners can create or rotate a single-use invite secret; invite links require GitHub sign-in. Each room supports up to eight members. Room discussion refreshes every eight seconds; this is polling, not live WebSocket chat. See [collaboration room implementation and API](docs/collaboration-rooms.md).

## Dashboard Experience

![Dashboard Overview](public/assets/dashboard_overview.png)

![Recent Scans](public/assets/dashboard_recent_scans.png)

![My Repositories](public/assets/dashboard_my_repos.png)

![Starred Repositories](public/assets/dashboard_starred_repos.png)

## Getting Started

### Use Hosted App

1. Open [repomind.in](https://repomind.in)
2. Enter `owner/repo` or a GitHub username
3. Ask architecture, code, or security questions

### Run Locally

#### Prerequisites

- Node.js 20.9+
- npm
- GitHub token and Gemini API key for repository analysis and AI chat (optional for starting the site)

#### Setup

```bash
git clone https://github.com/403errors/repomind.git
cd repomind
npm ci
cp .env.example .env.local
npm run prisma:generate
npm run dev
```

Set `DATABASE_URL="file:./dev.db"` in `.env.local`. `npm run dev` creates the local SQLite file and applies its migrations automatically. Sign-in supports GitHub (`AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`) and Google (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`); configure at least one provider and `AUTH_SECRET`. GitHub repository analysis needs `GITHUB_TOKEN`; grounded AI chat needs `GEMINI_API_KEY`. Google sign-in does not grant access to private GitHub repositories. Keep credentials server-side. See [repository intelligence setup](docs/repository-intelligence.md) and [deployment notes](docs/deployment.md).

Open [http://localhost:3000](http://localhost:3000). The existing application has additional integrations (KV, Blob, Resend) for their respective features; see `.env.example` for their settings.

### Model Environment Variables

Repo chat now uses separate models for file selection and answer generation:

- `GEMINI_FILE_SELECTOR_MODEL` (default: `gemini-3.5-flash-lite`)
- `GEMINI_LITE_MODEL` (default: `gemini-3.5-flash-lite`)
- `GEMINI_THINKING_MODEL` (default: `gemini-3.8-flash`)

### Realtime Chat Feedback

Both repo chat and profile chat stream backend activity as live text status updates (no progress bar), including:

- Selecting files
- Reading repository context
- Preparing answer
- Tool activity (for example: fetching commits, fetching repos by age, Google search usage)

### Repo Chat Commit Tooling

- `fetch_recent_commits` is available in **both Lite and Thinking** modes.
- When commit context is needed, repo chat fetches up to **latest 10 commits** for the current repository.
- Assistant messages can include:
  - `Commits checked: just now` or `cached N min ago`
  - `Tools used: ...`

### Profile Chat Tooling

- Profile chat supports anonymous and logged-in usage.
- Profile context preloads **latest 20 commits across repos**, cached for **15 minutes**.
- If a repo is explicitly asked for, tooling can fetch **latest 10 commits for that repo**.
- `fetch_repos_by_age` supports:
  - `oldest` (10 repos)
  - `newest` (10 repos)
  - `journey` (up to 20 repos, evenly spaced over repo age timeline)
- Cross-repo context is available via a chat-input toggle for logged-in users.

### Auth Tiers, Limits, and Budgets

- Anonymous users:
  - Can use Lite mode in repo/profile chat
  - Cannot use Thinking mode
  - Cannot enable cross-repo profile context
  - Tool budget: **10/day per scope** (`repo`, `profile`)
  - File-cache write budget: **10MB/day**
  - File cache TTL: **30 minutes**
  - Max cacheable file size: **128KB**, except files used in two consecutive anonymous queries (can be cached up to 2MB)
- Logged-in users:
  - Can use Lite + Thinking
  - Can enable cross-repo profile context
  - Tool budget: **30/day per scope** (`repo`, `profile`)
  - File-cache write budget: **20MB/day**
  - File cache TTL: **1 hour**

When anonymous usage limits are exceeded, UI prompts login with context-specific benefits.  
When authenticated usage limits are exceeded, chat returns a contact message for extended limits.

### Cache Isolation Rules

- Public repo file cache is shared by repository namespace.
- Private repo file cache is actor-scoped (non-shared).
- Query-to-selected-files cache TTL: **24h**
- Query answer cache TTL: **24h**

### Developer Commands

```bash
npm run dev            # local dev server
npm run lint           # lint checks
npm run test           # test suite
npm run test:security  # security-focused tests
npm run build          # production build
```

## Contributing

We want RepoMind to be one of the best OSS projects for AI-assisted code intelligence. Contributions of all sizes are welcome.

### Why contribute

- Work on practical agentic AI for real repositories
- Improve developer tooling used by public users
- Ship visible features quickly with direct product impact

### High-Impact Areas

- **Query pipeline and reasoning quality**: improve file selection, prompting, and response quality
- **Security scanner and verification**: improve detection accuracy and reduction of false positives
- **Dashboard and DevTools UX**: improve discoverability, workflows, and performance
- **Docs, tests, and reliability**: strengthen onboarding and confidence for contributors

### Contribution Workflow

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-change`
3. Make focused changes with tests
4. Run `npm run lint` and `npm run test`
5. Open a pull request with context, screenshots, and validation notes

### Pull Request Expectations

- Keep scope clear and reviewable
- Add or update tests when behavior changes
- Update docs when introducing user-visible changes
- Include before/after screenshots for UI work

## Changelog

Recent major updates are tracked in [CHANGELOG.md](CHANGELOG.md), including improvements through **v1.3.6 (2026-02-23)**.

## Tech Stack

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Gemini](https://ai.google.dev/)
- [OSV (Open Source Vulnerabilities)](https://osv.dev/)
- [Prisma](https://www.prisma.io/)
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
- [Vitest](https://vitest.dev/)

## License

Licensed under the MIT License. See [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/403errors">403errors</a> ·
  <a href="https://github.com/403errors/repomind/issues">Report Issue</a>
</p>
