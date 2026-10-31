# RepoMind — Product Specification and Five-Phase Roadmap

**Status:** Working product specification
**Product:** RepoMind
**Platform:** Next.js 16 App Router, React 19, TypeScript, Prisma, SQLite, Vercel KV
**Primary interface:** Web application
**Primary input:** Public or authorized GitHub repositories

---

## 1. Product vision

RepoMind is an AI-assisted repository intelligence workspace. It helps developers understand an unfamiliar codebase by combining deterministic repository inspection with grounded AI explanations.

RepoMind must not merely summarize a README. It should inspect repository structure and implementation evidence, explain how modules connect, identify technologies and dependencies, surface potential risks, and answer developer questions using relevant source files.

### Core product promise

A developer should be able to provide a GitHub repository and quickly understand:

1. What the project does and how it is organized.
2. Which technologies and dependencies it actually uses.
3. Which features are supported by implementation evidence.
4. Where execution begins and how important modules connect.
5. Where to start reading or modifying the code.
6. What potential security, dependency, and quality issues deserve investigation.
7. How to ask follow-up questions and receive answers grounded in repository source.

### Non-goals

- Executing arbitrary code from repositories.
- Claiming a complete understanding when only a subset of files was inspected.
- Treating README claims, comments, or filenames alone as proof that a feature is implemented.
- Replacing GitHub, IDEs, CI systems, or professional security review.
- Replacing the existing Next.js + Prisma + SQLite architecture with another framework, backend, or database without explicit approval.

---

## 2. Current repository baseline

The actual checked out product is a Next.js application. Reinspect the affected code before each phase; this baseline is a navigation aid, not proof that a requirement is complete.

### Frontend and application routes

- Next.js 16.1.1 App Router, React 19 and TypeScript. Pages, layouts, server actions and route handlers live under `src/app/`.
- Existing user-facing areas include landing/trending, repository pages at `src/app/repo/[owner]/[repo]/`, chat at `src/app/chat/`, dashboard, scan reports and security flows.
- Reusable UI is under `src/components/`, including `ChatInterface`, `RepoLayout`, `FilePreview`, `Mermaid` and dashboard components.
- API Route Handlers live under `src/app/api/**/route.ts`. Current examples include repo/profile chat, chat runs/quota, dashboard data, GitHub auth, security/report-related internal routes, badges and stats. Existing server actions are in `src/app/actions.ts`.

### Server-side services and external integrations

- GitHub access uses Octokit and shared retrieval/caching helpers in `src/lib/github.ts`, including repository metadata, recursive trees, blob/file content, commits and profile/repository data.
- Query orchestration/retrieval uses `src/lib/services/query-pipeline.ts`, `src/lib/services/repo-index-service.ts`, `src/lib/file-filters.ts`, `src/lib/tokens.ts` and `src/lib/gemini.ts`.
- Gemini setup is in `src/lib/ai-client.ts`; prompt construction is in `src/lib/prompt-builder.ts`. `src/lib/gemini.ts` also initializes the newer `@google/genai` client directly. Security AI assistance is in `src/lib/gemini-security.ts`. Keep credentials server-side and reuse these integrations rather than adding another provider client for a feature.
- The deterministic security pipeline lives in `src/lib/security-scanner.ts` and `src/lib/services/security-service.ts`, with verification, advisory, scan storage/report and fix-verification services. The separate Repository Intelligence analyzer inventories npm, Python, Go, Rust, Maven, Gradle, Ruby and Packagist manifests and uses bounded OSV lookups for exact versions; it does not replace existing security scan contracts.
- Existing path-token repository indexing is in `src/lib/services/repo-index-service.ts`; it does not extract source symbols/imports or constitute the deterministic intelligence index in this specification.

### Persistence and configuration

- Prisma Client is exposed through `src/lib/db.ts`. Schema is `prisma/schema.prisma`; active SQLite migrations are in `prisma/migrations-sqlite/`. Historical PostgreSQL migrations remain under `prisma/migrations/` and are not active.
- SQLite is the durable store for local/self-hosted use. `DATABASE_URL` defaults to `file:./dev.db`, resolved at `prisma/dev.db`. The database file requires persistent writable storage and backups. No PostgreSQL data is copied automatically.
- Existing models include `User`, NextAuth `Account`/`Session`/`VerificationToken`, `RepoScan`, `ScanFindingVerification`, `FixVerificationRun`, `RepoScanShareLink`, `ReportFalsePositive`, `RecentSearch`, `ChatConversation`, `ChatRun`, `TransactionalEmailDelivery`, `BlogPost`, and the new `RepositoryIntelligence` snapshot and `RepositoryAnalysisJob` lifecycle models. No general-purpose repository model is required.
- Vercel KV is used for GitHub/content caches, index data and quotas. It is a cache/service, not a second durable relational database.
- Important server environment variables are documented in `.env.example`, including GitHub, Gemini, NextAuth, SQLite, Vercel KV, Blob and Resend credentials. Never expose secret variables in client code or responses.

### Authentication, graphs and existing security

- GitHub and Google OAuth are conditionally configured through NextAuth in `src/lib/auth.config.ts` and `src/lib/auth.ts`; Prisma is the adapter and sessions use JWT strategy. A user's GitHub credential is read server-side from the Prisma `Account` record; Google sign-in alone does not authorize private GitHub access. `src/lib/session-guard.ts`, `src/lib/actor-id.ts` and route/action-specific checks support auth state and anonymous actors. OAuth access tokens are not serialized to browser sessions.
- Existing diagrams are Mermaid rendered by `src/components/Mermaid.tsx` and helpers in `src/lib/diagram-utils.ts`; chat prompts can ask Gemini to generate architecture/flow diagrams. The Repository Intelligence workspace adds a separate typed, bounded import graph derived from source evidence.
- Existing security work includes deterministic code/secret/config rules, npm dependency checks, optional Gemini validation, OSV lookup, verification gates, persistence, scan history, share links and reports. Preserve its API/UX contracts while extending it.

### Current limitations and verification gaps

- Language extraction is strongest for JS/TS. Other language parsers use narrow, conservative patterns; lack of an extracted relationship is not proof that none exists.
- The import graph caps nodes/edges and visualized nodes for responsiveness. Alias resolution currently supports relative paths and the conventional `@/*` to `src/*` mapping.
- Dependency inventory is capped at 2,000 reported packages and 50 exact OSV checks. Manifest ranges, unknown versions, and excess packages remain explicitly unchecked.
- Analysis work runs within the Next.js Route Handler `after()` lifetime. Interrupted jobs are detected and can be retried; no external durable queue is configured.
- A Vercel deployment is not supported with local-file SQLite because its filesystem is not durable/shared across instances. No production verification was performed. Existing repository-wide TypeScript and lint findings are recorded in `PROGRESS.md`.

---

## 3. Product principles

### 3.1 Evidence before inference

Facts such as imports, routes, declared dependencies, symbols, file paths, and entry points should be extracted deterministically whenever possible. AI may explain or interpret those facts, but must not invent them.

### 3.2 Traceability

Important claims should link to evidence: file path, line range, symbol, route, manifest entry, or upstream advisory. Confidence should reflect evidence quality, not model certainty alone.

### 3.3 Honest completeness

Every repository scan must report its coverage. If limits cause files to be skipped, the UI must clearly show that the analysis is partial and explain why.

### 3.4 Incremental computation

Unchanged files should be reusable when safe. Cache identity must account for repository, branch, commit, analyzer version, and relevant configuration.

### 3.5 Secure by default

Repository content is untrusted input. Never execute it. Keep tokens and privileged operations on the backend. Enforce access checks and bounded resource usage.

### 3.6 Useful developer experience

The UI should make large codebases navigable, explain why a result was produced, and provide direct paths from findings to source files.

---

# 4. Five-phase implementation roadmap

The phases are ordered by dependency. Each phase must be implemented, tested, documented, and verified before the next phase begins. Normally a phase gate is reviewed and approved before continuing; when the user explicitly authorizes sequential execution across multiple phases, continue through those authorized phases without an intermediate approval prompt. Track tasks and gate evidence in `IMPLEMENTATION_PLAN.md` and `PROGRESS.md`.

## Phase 1 — Deterministic Repository Intelligence Foundation

**Goal:** Build a reliable, explainable representation of what is actually present in a repository.

### Scope

1. Retrieve repository metadata and recursive Git tree information through existing GitHub utilities.
2. Discover supported source, configuration, manifest, and documentation files.
3. Apply safe file filtering and configurable resource limits.
4. Classify files using path, extension, contents, imports, route declarations, and framework signals.
5. Detect active technologies from implementation/configuration evidence.
6. Detect entry points, routes, symbols, imports, architectural layers, and module relationships.
7. Detect features only when implementation evidence supports them.
8. Record file-level metadata such as line count, blob SHA, language, routes, symbols, related modules/features, and analysis state.
9. Persist results using Prisma models and SQLite migrations. Reuse compatible existing models where practical; add a versioned intelligence snapshot model or related schema only when justified by the data contract. Update repository status/commit/timestamp metadata where appropriate without overloading security scan records.
10. Add incremental reuse based on Git blob SHA while safely handling changed, deleted, renamed, and newly added files.
11. Clearly report complete versus partial analysis and every skipped-file reason.

### User-visible deliverables

- Repository Intelligence workspace tab.
- Repository metrics and analysis coverage.
- Technology inventory.
- Evidence-backed feature inventory with confidence and source references.
- Searchable/filterable file explorer.
- Entry-point explanations.
- Warnings and analysis summary.
- Source file viewer/navigation.

### Acceptance criteria

- Results are reproducible for the same repository commit and analyzer version.
- No feature is marked implemented solely because it appears in README or comments.
- Every detected feature has evidence references or is explicitly marked unverified.
- Incremental reuse never leaks data across branches/repositories or stale commits.
- Deleted files disappear from the current result.
- File limits and skipped files are visible to the user.
- Server-side analysis service, Next.js Route Handler, client API wrapper, UI, and Prisma/SQLite schema are wired together.
- Unit tests cover classifiers, evidence extraction, SHA reuse, and partial analysis.

### Verification

Run tests, lint/type checks, and production build. Test at least one small repository and one repository with multiple languages. Live GitHub and configured SQLite/Vercel environment testing must be reported separately from local static checks.

---

## Phase 2 — Architecture Mapping and Interactive Code Graph

**Goal:** Turn Phase 1's extracted module relationships into a useful, navigable architecture map.

### Scope

1. Consume the deterministic module/import/route/entry-point metadata from Phase 1.
2. Integrate with the existing Mermaid/diagram rendering and workspace code where it fits rather than building a duplicate visualization system. Keep AI-generated diagrams distinct from the deterministic graph.
3. Represent internal modules, entry points, routes, and relevant external dependencies as typed nodes.
4. Represent only evidence-backed relationships as edges, with relationship type and source evidence.
5. Distinguish internal imports from external packages and unresolved imports.
6. Support filtering by layer, directory, language, route, or node type where useful.
7. Provide node details on selection, including path, symbols, imports, dependents, and evidence.
8. Allow navigation from a graph node to the relevant source file and line when available.
9. Provide sensible handling for monorepos, cycles, unresolved imports, and large graphs.
10. Add graph loading, empty, partial, and error states.
11. Detect entry points from supported route/runtime evidence with source locations, and offer a bounded call-flow view reachable from those points. Label this as static call flow; do not present it as variable-level lineage or observed runtime data flow.

### Acceptance criteria

- Graph nodes and edges are derived from repository evidence, not fabricated by an LLM.
- Selecting a node exposes useful source metadata and opens the correct file.
- Filters do not silently remove essential context without indicating the active filter.
- Cycles and unresolved imports do not crash rendering.
- Large graphs remain usable through filtering, grouping, or bounded rendering.
- Graph results clearly indicate when the underlying repository analysis is partial.
- Detected entry points expose their evidence location; call-flow edges are statically resolved and are not described as variable-level data lineage.

### Verification

Test graph construction independently from rendering. Test cycles, duplicate imports, unresolved imports, monorepo boundaries, and navigation. Verify the graph against at least one known repository structure.

---

## Phase 3 — Dependency and Security Intelligence

**Goal:** Explain the repository's dependency surface and surface actionable, evidence-backed security risks.

### Scope

1. Consolidate dependency reporting into the Repository Intelligence experience while preserving existing security scanner, report and chat/API behavior wherever practical.
2. Parse relevant manifests when present, including:
   - `package.json`
   - `requirements.txt`
   - `pyproject.toml`
   - `Cargo.toml`
   - `go.mod`
   - `pom.xml`
   - `build.gradle`
3. Distinguish direct dependencies, development dependencies, internal modules, and external packages.
4. Record declared version constraints and package-manager/ecosystem information.
5. Identify unused dependencies only when static evidence is sufficiently reliable; otherwise label the result as a candidate.
6. Reuse `src/lib/security-scanner.ts`, `src/lib/services/security-service.ts`, verification/report services and OSV integration where present; preserve current npm behavior while adding ecosystem support.
7. Correlate known vulnerabilities with dependency name/version/ecosystem and show advisory identifiers, severity, affected version ranges, and source links when available.
8. Keep static security rules, external vulnerability advisories, and LLM suggestions as separate finding sources.
9. Provide evidence, confidence, severity, and remediation guidance for findings.
10. Avoid presenting an unverified LLM suspicion as a confirmed vulnerability.

### Acceptance criteria

- Manifest parsing is resilient to malformed or unsupported formats.
- Direct and development dependencies are not conflated.
- Vulnerability matches are based on package identity and version evidence.
- Unknown versions are clearly marked; no version is invented.
- Findings link to the manifest or source evidence and advisory where applicable.
- Existing security and dependency workflows remain backward compatible.

### Verification

Use fixtures for each supported ecosystem, malformed manifests, missing versions, transitive/direct distinctions, and known advisory matches. Test upstream API failure and rate limiting.

---

## Phase 4 — Grounded AI Repository Assistant and Code Review

**Goal:** Provide repository-aware explanations and reviews grounded in retrieved source code and deterministic intelligence.

### Scope

1. Reuse and improve existing Next.js repo chat Route Handler/server actions, `src/lib/services/query-pipeline.ts`, GitHub retrieval, Gemini tooling, Mermaid rendering, and security review functionality.
2. Use Phase 1 repository metadata to improve file selection and context construction.
3. Retrieve relevant files/symbols based on the user's question rather than indiscriminately sending the repository.
4. Include source paths and line ranges in answers where possible.
5. Clearly distinguish directly observed facts from interpretation and uncertainty.
6. Handle token/context limits through bounded retrieval and prioritization.
7. Preserve chat history using existing Prisma `ChatConversation` and `ChatRun` behavior and verify actual persistence semantics.
8. Support follow-up questions with repository/branch context while preventing context leakage between repositories or users.
9. Improve code review output with severity, rationale, affected code, evidence, and actionable remediation.
10. Provide safe failure behavior when source retrieval or LLM invocation fails.
11. Evaluate prompt-injection risks in repository files, README content, comments, and issue-like text. Treat retrieved repository content as data, never as instructions that override system/developer policy.

### Acceptance criteria

- Answers cite or identify source files for repository-specific claims.
- The assistant admits when evidence is missing or incomplete.
- User questions and repository files cannot override system-level instructions.
- Chat context is scoped to the correct user, repository, and branch.
- Review findings are actionable and avoid unsupported certainty.
- Token limits and failed retrieval are handled gracefully.

### Verification

Test factual questions with known answers, questions whose answers are absent, conflicting README/source evidence, prompt-injection strings inside repository files, long repositories, and multi-turn conversations.

---

## Phase 5 — Production Readiness, Reliability, and Developer Experience

**Goal:** Make the complete RepoMind workflow robust, observable, maintainable, and ready for real users.

### Scope

1. Add a durable repository-analysis job lifecycle where required: queued, running, completed, partial, failed, cancelled. Reuse the existing Prisma `ChatRun` only for chat runs; do not conflate chat and analysis jobs.
2. Provide truthful progress reporting through a verified Next.js/Vercel-compatible mechanism backed by persisted state (such as Route Handler polling); never fabricate percentages.
3. Add timeout, retry, idempotency, and recovery behavior for long-running analysis.
4. Review authentication, authorization, repository ownership/access, and privileged database calls across all Route Handlers, server actions, and server-side services.
5. Add safe caching and invalidation across repository, branch, commit, analyzer version, and configuration.
6. Add observability: structured logs, correlation identifiers, timing, error categories, and safe operational metrics.
7. Apply limits for repository size, file count, file size, graph size, LLM context, request rate, and execution duration.
8. Improve UI loading, empty, partial, retry, error, and permission-denied states.
9. Add end-to-end tests for the primary user journey.
10. Review accessibility, responsive behavior, performance, and usability.
11. Document local Next.js development, SQLite/Prisma setup and migrations, environment configuration, deployment, troubleshooting, and known limitations.
12. Conduct a production-readiness review and explicitly list unresolved risks.

### Acceptance criteria

- A user can analyze a repository and navigate all available intelligence panels without a broken flow.
- Long-running or interrupted jobs have truthful and recoverable states.
- Authorization is enforced server-side on every protected operation.
- Secrets never appear in frontend bundles or logs.
- Resource limits prevent unbounded repository processing.
- Critical errors are observable and actionable.
- Build, lint, type checks, unit tests, and available integration/E2E tests pass.
- Production readiness is claimed only after real deployed verification with configured SQLite, GitHub and Gemini access.

### Verification

Run the complete test suite and production build. Perform a live test against a controlled GitHub repository using a properly configured deployment with SQLite and required secrets. Record the environment, commit, tests, and results. If deployment access is unavailable, label production verification as blocked rather than passed.

---

## 5. Cross-phase functional requirements

These requirements apply to all five phases.

### Repository access and identity

- Normalize GitHub repository identifiers consistently.
- Support public repositories and private repositories only when the user has authorized access.
- Respect branch selection and commit identity.
- Handle inaccessible repositories, deleted repositories, renamed repositories, and missing default branches.

### Analysis coverage

Every analysis result must communicate:

- Repository and branch analyzed.
- Commit SHA analyzed.
- Analyzer/schema version where applicable.
- Start/completion timestamps.
- Total discovered files.
- Files inspected and skipped.
- Skip reasons and configured limits.
- Complete, partial, failed, or stale status.

### Evidence model

Where applicable, evidence should include:

- Repository-relative path.
- Line range or symbol.
- Evidence category (import, route, symbol, manifest, configuration, source pattern, advisory, etc.).
- Confidence or strength.
- Whether the result is directly observed or inferred.

### User experience

- Keep navigation and terminology consistent across workspace panels.
- Show loading, empty, partial, error, and retry states.
- Make source paths clickable where a viewer is available.
- Avoid presenting raw JSON to end users unless it is a developer/debug view.
- Make limitations visible without overwhelming the main workflow.

### Security and privacy

- Treat all repository content as untrusted.
- Never execute repository scripts or binaries.
- Never expose GitHub tokens, Gemini API keys, database URLs, OAuth provider secrets, or other service credentials to the client.
- Enforce authorization in backend functions, not only in the UI.
- Do not log full secrets or unnecessary private source content.
- Scope database reads and writes to the authenticated user and authorized repository.

---

## 6. Technical architecture constraints

The intended architecture is:

```text
Next.js 16 App Router + React 19 frontend
        |
        | Next.js Route Handlers / server actions / existing client API wrappers
        v
Server-side TypeScript services under src/lib and src/lib/services
        |
        +--> GitHub Octokit retrieval utilities
        +--> Deterministic repository intelligence and security analysis
        +--> Retrieval and query pipeline
        +--> Gemini integration when explanation/reasoning is needed
        +--> OSV advisory API
        |
        v
Prisma Client --> SQLite (existing models + migrations)
        |
        +--> Vercel KV for cache/quota/index data, not durable relational records
```

Extend this architecture through modular server-side services, App Router endpoints/server actions and Prisma SQLite migrations. Do not create a parallel backend framework or database. Preserve existing API contracts wherever practical. Keep external credentials on the server. Keep the SQLite file on persistent writable storage and back it up. Never run migrations against production without explicit authorization and environment confirmation.

---

## 7. Global definition of done

A task or feature is complete only when all applicable conditions are satisfied:

- [ ] Requirements and acceptance criteria are implemented.
- [ ] Existing behavior is preserved or intentionally migrated.
- [ ] Input validation and error handling are present.
- [ ] Authorization and secret handling are reviewed where relevant.
- [ ] Automated tests are added or updated.
- [ ] Relevant tests have actually run and results are recorded.
- [ ] Lint/type checks/build have been run where available.
- [ ] UI states and accessibility are considered where relevant.
- [ ] Documentation explains the feature, architecture, API/data flow, configuration, testing, and limitations.
- [ ] Remaining risks and unverified areas are explicitly listed.

Use these verification labels accurately:

- **Implemented:** code changes exist.
- **Unit-tested:** relevant unit tests passed.
- **Integration-tested:** interacting components/services were tested together.
- **Build-verified:** production build completed successfully.
- **Production-verified:** tested in a deployed, configured environment.

A feature can have more than one label. Never imply that one label automatically grants another.

---

## 8. Planning and execution protocol

Before implementing a phase, create or update:

- `IMPLEMENTATION_PLAN.md` — task-level breakdown, task IDs, dependencies, and acceptance criteria.
- `PROGRESS.md` — current phase, current task, completed/pending/blocked work, test results, and known issues.

Execute only phases authorized by the user. A user may approve one phase or explicitly authorize autonomous sequential execution through multiple phases. At each phase boundary, record acceptance and verification evidence. Continue immediately when the current authorization covers the next phase; otherwise provide a concise report and wait for approval.

The five phases are:

1. Deterministic Repository Intelligence Foundation.
2. Architecture Mapping and Interactive Code Graph.
3. Dependency and Security Intelligence.
4. Grounded AI Repository Assistant and Code Review.
5. Production Readiness, Reliability, and Developer Experience.
