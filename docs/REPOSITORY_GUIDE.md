# Repository Guide

This guide explains the purpose of the important files and folders in LeakProof AI so a new engineer, founder, reviewer, or AI coding tool can ingest the repository quickly.

## Product Identity

LeakProof AI is a revenue leakage recovery product. It helps B2B companies compare signed commercial terms against invoices and usage data, then produce evidence-backed findings for human review.

The product is intentionally workflow-first:

- Not a generic chatbot.
- Not a full contract lifecycle management system.
- Not automatic billing or payment collection.
- Not legal advice.

## Root Files

### `README.md`

Main project overview, quick start, architecture summary, verification snapshot, and reading path.

### `AGENTS.md`

Codex operating contract. It explains product non-negotiables, engineering standards, testing expectations, security rules, and how AI agents should work inside this repository.

### `START_HERE_NON_TECHNICAL.md`

Founder-facing operating instructions. It explains how a non-technical founder should drive the build and manually test the app.

### `agent.md`

Short pointer telling agents to use `AGENTS.md`.

### `.env.example`

Template for required local and production environment variables.

### `.gitignore`

Protects the repository from committing dependencies, generated build output, local env files, coverage, logs, Supabase temp files, and TypeScript build metadata.

### `package.json`

Defines scripts and dependencies.

Important scripts:

- `pnpm dev`: run development server.
- `pnpm test`: run unit tests.
- `pnpm typecheck`: run TypeScript.
- `pnpm lint`: run ESLint.
- `pnpm build`: production build.
- `pnpm env:check`: verify production env vars are configured.
- `pnpm production:gate`: env check plus tests, typecheck, lint, and build.
- `pnpm smoke`: check deployed or local app endpoints.

### `Dockerfile` and `docker-compose.yml`

Container helpers for local or deployment experiments. Vercel remains the primary target.

## `CHATGPT_CONTEXT/`

This folder is specifically designed for ChatGPT or another AI reader scanning the GitHub repository.

Use this folder first when asking an AI to understand, review, extend, or debug the codebase.

Files:

- `README.md`: fastest entry point.
- `PROJECT_BRIEF.md`: product, target user, and non-goals.
- `ARCHITECTURE_MAP.md`: system architecture and data flow.
- `CODE_MAP.md`: where important code lives.
- `CURRENT_STATUS.md`: what is ready, what is blocked, and how to verify.
- `AI_HANDOFF_PROMPT.md`: copy/paste prompt for a future ChatGPT/Codex session.

## `docs/`

Product and engineering documentation.

### `docs/PRD.md`

Product requirements: target users, inputs, outputs, user flow, non-goals, success metrics, and production completion requirements.

### `docs/TECHNICAL_ARCHITECTURE.md`

Architecture overview: Next.js, Supabase, Gemini, pgvector, AI extraction, deterministic reconciliation, evidence packs, and deployment target.

### `docs/BUILD_PLAN_FOR_CODEX.md`

Phase-by-phase build plan.

### `docs/CODEX_TASKS.md`

Copy/paste tasks for Codex.

### `docs/API_CONTRACTS.md`

Human-readable API contracts for organizations, workspaces, uploads, extraction, contract terms, reconciliation, findings, evidence candidates, evidence packs, and role management.

### `docs/openapi.yaml`

OpenAPI-style route description.

### `docs/DATA_MODEL.md`

Database and status model summary. The canonical source remains the Supabase migration.

### `docs/SECURITY_AND_COMPLIANCE.md`

Security requirements and compliance posture.

### `docs/SECURITY_REVIEW.md`

Current security pass/fail notes plus manual live checks.

### `docs/DEPLOYMENT.md`

Vercel and Supabase deployment guide.

### `docs/ENV_CHECKLIST.md`

Required environment variable checklist and production gate instructions.

### `docs/SCANNED_PDF_IMAGE_INGESTION_STRATEGY.md`

Scanned PDF/image handling strategy.

### `docs/FOUNDER_HANDOFF.md`

Plain-English handoff for a non-technical founder.

### `docs/QA_RUNBOOK.md`

Manual and automated QA checklist for release gates, owner/admin/reviewer/viewer role testing, mock-audit validation, screenshots, and data-safety checks.

### `docs/LAUNCH_PLAYBOOK.md`

Launch sequencing and customer-readiness checks.

### `docs/CUSTOMER_AUDIT_CHECKLIST.md`

Checklist for running a customer revenue leakage audit.

### `docs/EVALUATION_PLAN.md`

Evaluation approach for extraction, reconciliation, and evidence quality.

### `docs/BUSINESS_MODEL_AND_GTM.md`

Business model and go-to-market context.

### `docs/SOURCES.md`

Source references.

## `src/app/`

Next.js App Router pages and API routes.

### Public Pages

- `src/app/page.tsx`: public home page.
- `src/app/pricing/page.tsx`: manual audit pricing page.
- `src/app/contact/page.tsx`: contact page.
- `src/app/onboarding/page.tsx`: onboarding guidance.
- `src/app/login/page.tsx`: Supabase login page.

### Authenticated App Pages

- `src/app/app/page.tsx`: main app entry.
- `src/app/app/workspaces/[[...workspacePath]]/page.tsx`: workspace route.
- `src/app/app/settings/page.tsx`: app settings route.
- `src/app/app/audit-log/page.tsx`: audit-log route surface.

These routes currently render the shared revenue audit workspace component.

### API Routes

Core routes:

- `src/app/api/health/route.ts`: public health check.
- `src/app/api/organizations/route.ts`: list/create organizations.
- `src/app/api/organizations/[organizationId]/members/route.ts`: list organization members.
- `src/app/api/organizations/[organizationId]/members/[memberId]/route.ts`: update existing member roles.
- `src/app/api/workspaces/route.ts`: list/create workspaces.
- `src/app/api/documents/route.ts`: list documents.
- `src/app/api/documents/upload/route.ts`: upload and ingest documents.
- `src/app/api/documents/[documentId]/customer/route.ts`: assign or reassign a document to a customer account.
- `src/app/api/customers/route.ts`: list or create/reuse customer accounts for an organization.
- `src/app/api/workspaces/[workspaceId]/documents/[documentId]/embed/route.ts`: embed document chunks.
- `src/app/api/workspaces/[workspaceId]/semantic-search/route.ts`: semantic evidence search.
- `src/app/api/extraction/run/route.ts`: run contract extraction.
- `src/app/api/contract-terms/route.ts`: list extracted terms.
- `src/app/api/contract-terms/[id]/route.ts`: review/edit extracted terms.
- `src/app/api/reconciliation/run/route.ts`: run deterministic reconciliation.
- `src/app/api/findings/route.ts`: list findings.
- `src/app/api/findings/[id]/route.ts`: finding detail with evidence.
- `src/app/api/findings/[id]/status/route.ts`: finding status review.
- `src/app/api/findings/[id]/evidence-pack/route.ts`: finding evidence export payload.
- `src/app/api/evidence-candidates/route.ts`: list/create evidence candidates.
- `src/app/api/evidence-candidates/[id]/route.ts`: approve/reject evidence candidates.
- `src/app/api/evidence-items/[id]/route.ts`: remove attached evidence.
- `src/app/api/workspaces/[workspaceId]/report/route.ts`: generate customer-ready report.
- `src/app/api/evidence-packs/[id]/export/route.ts`: mark report exported.
- `src/app/api/invoice-records/route.ts`: list invoice records.
- `src/app/api/usage-records/route.ts`: list usage records.

## `src/components/`

### `src/components/audit/RevenueAuditWorkspace.tsx`

Main product UI. It contains:

- Organization and workspace setup.
- Existing-member role management.
- Upload workflow.
- Semantic evidence search.
- Human contract-term review.
- Invoice and usage record tables.
- Finding list and detail panel.
- Evidence candidate approve/reject/remove workflow.
- Customer-ready report generation and export.

## `src/lib/`

Business logic and tests.

### `src/lib/api/`

Request schemas, status transition validation, and API response helpers.

### `src/lib/audit/`

Audit event allowlist and metadata redaction.

### `src/lib/db/`

Supabase clients, auth helpers, role helpers, customer/account linking helpers, database mappers, and audit-event writer.

### `src/lib/ai/`

Gemini config, client helpers, and JSON parsing.

### `src/lib/agents/`

Contract extraction and audit-agent workflow logic.

### `src/lib/ingest/`

Document parsing, CSV parsing, and chunking.

### `src/lib/embeddings/`

Embedding vector validation.

### `src/lib/retrieval/`

Semantic search behavior.

### `src/lib/leakage/`

Deterministic reconciliation rules and types. Money calculations use integer minor units and current rules reconcile by billing period where period data is available. The current rule set includes minimum commitments, usage overages, seat underbilling, expired discounts, missed uplifts, renewal risk, amendment conflict risk, and payment terms mismatch.

### `src/lib/evidence/`

Evidence pack generation, evidence candidate helpers, citation helpers, and executive report generation.

### `src/lib/audit/runVersions.ts`

Helpers for idempotent extraction/reconciliation reruns, active/superseded output filtering, logical keys, and finding period metadata.

### `src/lib/uploads/`

File validation and tenant-scoped storage path generation.

### `src/lib/evaluation/`

Synthetic evaluation dataset helpers.

## `supabase/`

### `supabase/migrations/001_initial_schema.sql`

Canonical database schema.

Includes:

- Organizations and memberships.
- Audit workspaces.
- Customers.
- Source documents.
- Document chunks.
- AI jobs and embedding jobs.
- Document embeddings.
- Semantic search logs.
- Contract terms.
- Invoice records.
- Usage records.
- Extraction runs.
- Reconciliation runs.
- Leakage findings.
- Evidence items.
- Evidence candidates.
- Evidence packs.
- Audit events.
- RLS helper functions.
- RLS policies.
- Private storage bucket setup.
- `match_document_chunks` pgvector RPC.
- Indexes.

## `prompts/`

Prompt templates for:

- Contract term extraction.
- Evidence pack generation.
- Leakage reconciliation.
- Sales email drafting.

## `sample-data/`

Fake customer data for testing and demos. Use this data before any real customer pilot.

- `customer_alpha_contract.txt`
- `customer_alpha_invoices.csv`
- `customer_alpha_usage.csv`
- `expected_findings.json`
- `synthetic-audit-cases.json`
- `mock-pilot/`: multi-customer mock audit fixtures. The expected customer-facing leakage total is `USD 26,690`.

No real customer data should be committed.

## `scripts/`

- `env-check.mjs`: validates required production env vars.
- `smoke-test.mjs`: checks `/app` and `/api/health` against a provided app URL.

## `.agents/skills/`

Local Codex skill playbooks:

- `contract-term-extraction`
- `revenue-reconciliation`
- `evidence-pack-generation`
- `production-hardening`
- `nontechnical-founder-handoff`

These explain product-specific implementation rules for AI coding agents.

## Safe Extension Rules

When extending the repo:

- Keep secrets server-side.
- Do not add automatic billing or payment collection unless explicitly requested.
- Do not make the UI chatbot-first.
- Do not create findings without citations.
- Keep deterministic money math in `src/lib/leakage`.
- Keep API routes membership and workspace scoped.
- Add audit events for important mutations.
- Add focused tests for new behavior.
- Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` before claiming completion.
