# Build Plan for Codex

Build in phases. Each phase should end with tests and a demoable result.

## Phase 0 — Validate repo

Goal: make the starter repo installable and testable.

Deliverables:

- working `package.json`
- TypeScript strict mode
- lint/test/build scripts
- passing starter unit tests
- clean README setup instructions

## Phase 1 — Auth, organizations, and database

Goal: production-style multi-tenant foundation.

Deliverables:

- Supabase client setup
- auth pages or auth integration
- organization creation
- profile/org membership model
- RLS policies
- audit event helper

## Phase 2 — Upload workflow

Goal: user can upload contract and CSV files into an audit workspace.

Deliverables:

- audit workspace page
- file upload component
- file validation
- storage path convention: `org/{org_id}/workspace/{workspace_id}/...`
- source document records
- upload audit event

## Phase 3 — Contract parsing and extraction

Goal: extract commercial terms from uploaded contracts.

Deliverables:

- document text extraction pipeline
- AI extraction service with JSON schema
- term citations
- confidence scoring
- review/edit screen for extracted terms
- tests using sample contract text

## Phase 4 — Invoice and usage ingestion

Goal: parse customer invoice and usage CSVs into normalized records.

Deliverables:

- CSV mapping screen or fixed starter schema
- ingestion validation
- row-level citation IDs
- normalized invoice and usage tables
- tests for CSV parser

## Phase 5 — Reconciliation engine

Goal: create deterministic findings.

Deliverables:

- rules for minimum commitment, seat underbilling, usage overage, expired discount, missed annual uplift
- money-safe decimal calculations
- finding creation logic
- unit tests for each rule
- confidence/status model

## Phase 6 — Findings dashboard

Goal: finance user can understand and act on findings.

Deliverables:

- findings list with amount, confidence, type, customer, status
- finding details page
- evidence citations display
- approve/dismiss/needs-review actions
- audit event on status change

## Phase 7 — Evidence pack export

Goal: produce a customer-shareable or internal-reviewable pack.

Deliverables:

- HTML evidence pack
- print-to-PDF friendly layout
- calculation section
- source citation section
- draft customer email/invoice note
- export/copy button

## Phase 8 — Billing and onboarding

Goal: make it sellable.

Deliverables:

- landing page
- pricing page
- contact and onboarding flow for manual audit billing
- onboarding checklist
- demo workspace seeded from sample data

## Phase 9 — Security hardening

Goal: reduce obvious production risk.

Deliverables:

- RLS policy tests or manual verification docs
- file size/type limits
- rate limits on AI jobs
- background job retry rules
- redaction-safe logging
- error monitoring setup
- security checklist completed

## Phase 10 — Deployment

Goal: deploy a demo customers can try.

Deliverables:

- Vercel deployment docs
- Supabase project setup docs
- environment variable checklist
- smoke test script
- founder demo script
