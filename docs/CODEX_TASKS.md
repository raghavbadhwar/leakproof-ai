# Codex Tasks — Copy/Paste These One at a Time

## Task 01 — Make the starter repo installable

```text
Read AGENTS.md, README.md, docs/PRD.md, and docs/BUILD_PLAN_FOR_CODEX.md first.

Task: Make this repository installable and testable as a Next.js + TypeScript project. Keep the existing product direction. Verify package.json scripts, TypeScript config, Vitest config, and starter tests. Do not build unrelated features. Run pnpm install if needed, then pnpm test, pnpm typecheck, pnpm lint, and pnpm build if possible. Fix errors. Summarize changed files and test results.
```

## Task 02 — Implement Supabase auth and multi-tenant database foundation

```text
Use AGENTS.md and the production-hardening skill. Implement the Supabase client setup, environment variables, organization/membership model, and initial database access helpers using supabase/migrations/001_initial_schema.sql as the source of truth. Add RLS-aware query helpers and audit event helper. Add basic auth-protected routes. Include tests or documented manual checks for tenant isolation. Do not skip security notes.
```

## Task 03 — Build upload workflow

```text
Build the audit workspace upload flow. Users should be able to create a workspace and upload a contract file, invoice CSV, and usage CSV. Validate file type and size. Store metadata in source_documents. Use tenant-scoped storage paths. Show upload status and helpful errors. Add tests for validation logic.
```

## Task 04 — Build contract extraction agent

```text
Use the contract-term-extraction skill and prompts/extract_contract_terms.md. Implement an AI extraction service that takes contract text and returns structured contract terms with citations, confidence, and needs_review flags. Use a strict schema. Never invent missing terms. Add tests using sample-data/customer_alpha_contract.txt.
```

## Task 05 — Build invoice/usage ingestion and reconciliation

```text
Use the revenue-reconciliation skill. Implement CSV ingestion for invoices and usage using the sample-data CSV format. Then implement deterministic leakage rules for minimum commitment, seat underbilling, usage overage, expired discount, and annual uplift. Add unit tests for each rule. The AI must not calculate final money amounts; deterministic code must.
```

## Task 06 — Build findings dashboard

```text
Build a findings dashboard with list and detail pages. Each finding must show type, customer, estimated amount, calculation, citations, confidence, status, and recommended action. Add actions: approve, dismiss, needs review. Log audit events for status changes.
```

## Task 07 — Build evidence pack generation

```text
Use the evidence-pack-generation skill. Build an HTML evidence pack page for each finding. It must include summary, source citations, calculation table, recommended next action, and a draft customer email/invoice note. Make it print/PDF friendly. Add a copy/export button.
```

## Task 08 — Make the demo sellable

```text
Build a simple landing page and demo workspace seeded by sample-data. The landing page should speak to CFOs/founders and promise revenue leakage recovery, not generic AI. Add clear CTA: Book audit / Start demo. Keep copy concise and commercially sharp.
```

## Task 09 — Production hardening pass

```text
Use the production-hardening skill. Review auth, RLS, file validation, API route authorization, logs, error handling, environment variables, rate limiting, and audit events. Create SECURITY_REVIEW.md with pass/fail notes and fix critical issues.
```

## Task 10 — Deployment checklist

```text
Create deployment docs for Vercel + Supabase. Include all environment variables, database migration steps, storage bucket setup, RLS verification, smoke test flow, and rollback notes. Run pnpm build. Summarize what a non-technical founder must do next.
```

