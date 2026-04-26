# LeakProof AI

LeakProof AI is a production-minded revenue leakage recovery workspace for B2B companies. It reads contracts, invoice exports, and usage or seat data, then identifies recoverable or preventable revenue leakage with citations, deterministic calculations, human review, audit logs, and customer-ready evidence reports.

This is not a chatbot-first product. The main experience is an audit workflow for finance, RevOps, and founders.

## Product Promise

Upload contracts, invoices, and usage data. LeakProof AI finds under-billed overages, missed minimum commitments, unbilled seats, expired discounts still being applied, missed annual uplifts, and renewal or notice-window risks.

Every finding must have:

1. Contract evidence.
2. Invoice or usage evidence.
3. Deterministic money calculation.
4. Human approval before customer-facing use.
5. Audit trail.

## Current Build Status

The repository contains a production-shaped Next.js, Supabase, Gemini, and pgvector build.

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
- Gemini extraction and embedding boundaries kept server-side.
- Semantic evidence search over workspace-scoped document chunks.
- Human term review UI.
- Evidence candidate attach, approve, reject, and remove workflow.
- Deterministic reconciliation rules.
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
- Deployed smoke test.
- Real browser verification with owner/admin/reviewer/viewer users.

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
4. User uploads contract, invoice CSV, and usage CSV files.
5. The app validates file type and size.
6. Files are stored under tenant-scoped paths.
7. Contracts are parsed into text chunks.
8. CSV rows are normalized into invoice and usage records.
9. Gemini extracts structured commercial terms with citations.
10. A human reviewer approves, edits, rejects, or marks terms as needs review.
11. Deterministic TypeScript reconciliation rules create findings.
12. Semantic search suggests evidence candidates.
13. A reviewer approves/rejects candidates into attached evidence.
14. Findings are approved, dismissed, marked needs review, customer-ready, recovered, or not recoverable.
15. Customer-ready reports include only human-approved findings and approved evidence.
16. Important actions write audit events.

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
- `docs/SCANNED_PDF_IMAGE_INGESTION_STRATEGY.md`: scanned PDF/image strategy.
- `docs/FOUNDER_HANDOFF.md`: non-technical founder handoff.
- `docs/REPOSITORY_GUIDE.md`: detailed repository guide.

## Verification Snapshot

Latest local verification from this workspace:

- `pnpm test`: passed, 20 test files and 52 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `APP_URL=http://localhost:3011 pnpm smoke`: passed for `/app` and `/api/health`.
- `pnpm env:check`: failed locally because real Supabase, Gemini, and app URL env vars are not configured in this shell.

That means repo-side build quality is green. Live workflow and deployment completion requires real external credentials and a linked Supabase/Vercel setup.

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
