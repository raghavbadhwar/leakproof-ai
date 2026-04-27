# LeakProof AI

LeakProof AI is a production-minded revenue leakage recovery workspace for B2B companies. It reads contracts, invoice exports, and usage or seat data, then identifies recoverable or preventable revenue leakage with citations, deterministic calculations, human review, audit logs, and customer-ready evidence reports.

This is not a chatbot-first product. The main experience is an audit workflow for finance, RevOps, and founders.

## Product Promise

Upload contracts, invoices, and usage data. LeakProof AI finds under-billed overages, missed minimum commitments, unbilled seats, expired discounts still being applied, missed annual uplifts, and renewal or notice-window risks.

Every finding must have:

1. Contract evidence.
2. Invoice or usage evidence for recoverable money findings.
3. Deterministic money calculation for money findings.
4. Human approval before customer-facing use.
5. Audit trail.

Risk-only findings, such as renewal notice or payment terms risks, may use approved contract-only evidence and are labeled separately from recoverable leakage.

## Current Build Status

The repository contains a production-shaped Next.js, Supabase, Gemini, and pgvector build.

Current posture:

- Repo-side gates passed.
- Verdict: pilot-ready after live setup.
- Production status: not production-ready until live verification passes.

Treat it as **repo-side ready** and a **pre-production candidate** until the live Supabase, Gemini, Vercel, mock-audit, smoke, and role QA checks pass.

Ready locally:

- Public pages for positioning, pricing, contact, onboarding, and login.
- Auth-protected audit workspace.
- Organization, workspace, member-role, upload, extraction, reconciliation, evidence, finding, report, and audit-log foundations.
- Server-side Supabase service-role access with authenticated user checks.
- Organization and workspace access checks on private routes.
- Role-gated workflow mutations for `owner`, `admin`, and `reviewer`.
- Viewer/member read-only posture.
- Upload validation and tenant-scoped storage paths.
- TXT, DOCX, text-based PDF, invoice CSV, and usage CSV ingestion.
- Customer/account linking across contract uploads, invoice CSVs, usage CSVs, extracted customer names, and document assignment APIs.
- Gemini extraction and embedding boundaries kept server-side.
- Semantic evidence search over workspace-scoped document chunks.
- Human term review UI.
- Evidence candidate attach, approve, reject, and remove workflow.
- Period-aware deterministic reconciliation rules, including minimum commitments, usage overages, seat underbilling, expired discounts, missed uplifts, renewal risk, amendment conflict risk, and payment terms mismatch.
- Idempotent extraction and reconciliation reruns using staged rows, active/superseded promotion, logical keys, and run versions.
- Finding detail review UX with uncertainty notes, calculation inputs, evidence, and draft customer note.
- Customer-ready report generation, copy, JSON export, print/PDF export, and export audit events.
- Scanned PDF/image ingestion strategy and server-side Gemini multimodal path, still requiring live credential verification.
- Unit tests, typecheck, lint, production build, and local smoke test.

Still requires live external setup:

- Dedicated Supabase project.
- Supabase migrations applied.
- Supabase Auth redirect URLs configured.
- Gemini API key and model env vars.
- Vercel project and production env vars.
- `pnpm production:gate` with real production values.
- Deployed smoke test.
- Mock audit verification that the fixture totals `USD 26,690`.
- Real browser verification with owner/admin/reviewer/member/viewer users.

## Tech Stack

- Next.js App Router
- React
- TypeScript strict mode
- Supabase Auth, Postgres, Storage, Row-Level Security
- pgvector
- Gemini generation and embeddings
- Zod
- Vitest
- ESLint
- Vercel deployment target

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run local development:

```bash
pnpm dev
```

Run local verification:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Run the production environment check:

```bash
pnpm env:check
```

Run the production readiness helper before live setup:

```bash
pnpm production:readiness
```

Run the full production gate after real env vars are configured:

```bash
pnpm production:gate
```

Run a local built-app smoke test:

```bash
PORT=3011 pnpm start
APP_URL=http://localhost:3011 pnpm smoke
```

## Required Environment Variables

Use `.env.example` as the template.

Required:

- `GEMINI_API_KEY`
- `GEMINI_GENERATION_MODEL`
- `GEMINI_FAST_MODEL`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_DIMENSION`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Optional:

- `SENTRY_DSN`
- `AI_PROVIDER_FALLBACK_ENABLED`

The env check validates URL shape, Supabase project URL shape, anon/service-role key separation, and that `GEMINI_EMBEDDING_DIMENSION` matches the current `vector(1536)` schema.

Never commit `.env.local`, `.env.production.local`, Supabase service-role keys, Gemini keys, Vercel tokens, uploaded customer files, raw contracts, invoice rows, or customer PII.

## Repository Map

Top-level files:

- `AGENTS.md`: operating instructions for Codex and future AI engineering agents.
- `START_HERE_NON_TECHNICAL.md`: founder-facing instructions for operating the project.
- `agent.md`: lightweight pointer to `AGENTS.md`.
- `README.md`: this project overview.
- `.env.example`: required environment variable template.
- `.gitignore`: excludes dependencies, build output, local envs, caches, and generated artifacts.
- `package.json`: scripts, dependencies, and verification commands.
- `pnpm-lock.yaml`: dependency lockfile.
- `next.config.ts`: Next.js config.
- `tsconfig.json`: TypeScript config.
- `eslint.config.mjs`: ESLint config.
- `vitest.config.ts`: Vitest config.
- `Dockerfile` and `docker-compose.yml`: container/runtime helpers.

Main folders:

- `src/app`: Next.js app routes, API routes, public pages, and authenticated workspace routes.
- `src/components`: UI components, especially the revenue audit workspace.
- `src/lib`: business logic, auth helpers, AI helpers, ingestion, leakage rules, evidence generation, uploads, audit helpers, and tests.
- `supabase/migrations`: canonical database schema, RLS policies, storage bucket config, indexes, and pgvector RPC.
- `docs`: product, architecture, deployment, security, data model, API, launch, and handoff documentation.
- `prompts`: prompt templates used by extraction, reconciliation, evidence, and sales flows.
- `sample-data`: fake customer data for local evaluation and demos.
- `scripts`: local verification and smoke-test scripts.
- `CHATGPT_CONTEXT`: short, structured context designed for ChatGPT or another AI reader scanning the repo.
- `.agents/skills`: local product-specific Codex playbooks.

See `docs/REPOSITORY_GUIDE.md` for a deeper file-by-file guide.

## Core Workflow

1. User signs in through Supabase Auth.
2. User creates or selects an organization.
3. User creates or selects an audit workspace.
4. User uploads contract, invoice CSV, and usage CSV files, with a customer/account assignment when available.
5. The app validates file type and size.
6. Files are stored under tenant-scoped paths.
7. Contracts are parsed into text chunks.
8. CSV rows are normalized into invoice and usage records.
9. Gemini extracts structured commercial terms with citations.
10. A human reviewer approves, edits, rejects, or marks terms as needs review.
11. Period-aware deterministic TypeScript reconciliation rules create findings.
12. Extraction and reconciliation reruns stage new rows, promote the latest successful run, and supersede stale active output.
13. Semantic search suggests evidence candidates.
14. A reviewer approves/rejects candidates into attached evidence. Evidence created automatically by reconciliation starts as `suggested`, not `approved`.
15. Findings are approved, dismissed, marked needs review, customer-ready, recovered, or not recoverable.
16. Customer-ready reports include only human-approved findings and reviewer-approved evidence. Recoverable money findings require approved contract evidence, approved invoice or usage evidence, and deterministic formula inputs; risk-only findings may use contract-only evidence and are labeled risk-only.
17. Important actions write audit events.

## Security Model

LeakProof AI handles sensitive contracts and invoices, so the build follows these constraints:

- Keep secrets server-side.
- Require bearer-token auth on private API routes.
- Check organization membership on private organization data.
- Check workspace ownership before workspace-scoped reads and mutations.
- Gate workflow mutations by role.
- Store files in private Supabase Storage paths under `org/{org_id}/workspace/{workspace_id}/...`.
- Use RLS policies on tenant tables.
- Redact raw contracts, invoice rows, embeddings, prompts, tokens, keys, and model responses from audit metadata.
- Never send customer emails or invoice actions automatically.
- Never present output as legal advice.

## Important Docs

- `CHATGPT_CONTEXT/README.md`: fastest AI-readable entry point.
- `docs/FEATURE_LIST.md`: full-app feature list with implementation status.
- `docs/PRD.md`: product requirements.
- `docs/TECHNICAL_ARCHITECTURE.md`: system architecture.
- `docs/DATA_MODEL.md`: table/status/money model summary.
- `docs/API_CONTRACTS.md`: human-readable API contract.
- `docs/SECURITY_REVIEW.md`: security pass and live verification checklist.
- `docs/DEPLOYMENT.md`: Vercel and Supabase deployment steps.
- `docs/ENV_CHECKLIST.md`: required env vars and production gate.
- `docs/LIVE_PILOT_READINESS_RUNBOOK.md`: exact live pilot checklist for Supabase, Vercel, personas, mock audit, Gemini, and audit logs.
- `docs/SCANNED_PDF_IMAGE_INGESTION_STRATEGY.md`: scanned PDF/image strategy.
- `docs/FOUNDER_HANDOFF.md`: non-technical founder handoff.
- `docs/REPOSITORY_GUIDE.md`: detailed repository guide.

## Verification Snapshot

Release posture:

- Repo-side status: gates passed.
- Pilot status: pilot-ready after live setup.
- Production status: not production-ready until live verification passes.
- Required local release gate: `pnpm production:gate` after real env vars are available.
- Required deployed smoke: `APP_URL=<production-url> pnpm smoke`.
- Required mock audit: verify the mock pilot total is `USD 26,690`.
- Required live QA: owner/admin/reviewer/member/viewer role checks against real Supabase Auth.
- Environment status depends on the local shell or pulled Vercel env files; `pnpm env:check` must pass with real values before production gating.

Do not call production complete until live verification passes: Supabase migrations/RLS/storage, Vercel deploy, deployed smoke, mock audit, Gemini smoke, audit-log inspection, and owner/admin/reviewer/member/viewer role QA.

## How To Read This Repo

For humans:

1. Read this `README.md`.
2. Read `CHATGPT_CONTEXT/README.md`.
3. Read `docs/REPOSITORY_GUIDE.md`.
4. Read `docs/PRD.md`.
5. Read `docs/TECHNICAL_ARCHITECTURE.md`.
6. Inspect `src/components/audit/RevenueAuditWorkspace.tsx`.
7. Inspect `src/app/api`.
8. Inspect `src/lib/leakage`, `src/lib/evidence`, `src/lib/ingest`, and `src/lib/db`.
9. Inspect `supabase/migrations/001_initial_schema.sql`.

For AI tools:

Start with `CHATGPT_CONTEXT/README.md`, then follow the links in that folder.
