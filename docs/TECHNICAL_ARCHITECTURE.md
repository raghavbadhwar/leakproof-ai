# Technical Architecture

## Architecture principle

Use AI for unstructured document understanding. Use ordinary code for money calculations, permissions, status transitions, and audit logging.

## System overview

```text
User
  ↓
Next.js Web App
  ↓
API Routes / Server Actions
  ↓
Supabase Auth + Postgres + Storage
  ↓
Background Jobs
  ↓
AI Extraction Agent
  ↓
Structured Contract Terms
  ↓
Deterministic Reconciliation Engine
  ↓
Evidence-Backed Findings
  ↓
Dashboard + Evidence Pack Export
```

## Recommended production stack

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- Server components where possible
- Client components for upload/progress/review screens

### Backend

- Next.js API routes or server actions
- Supabase Postgres
- Supabase Storage
- Supabase Auth
- Row-Level Security policies
- Supabase-backed run tables for extraction, embeddings, reconciliation, and evidence generation

### AI layer

- Gemini generation for extraction and explanations
- Gemini embeddings with pgvector for tenant-scoped evidence retrieval
- JSON-schema extraction
- deterministic TypeScript validation and reconciliation
- separate prompts in `prompts/`
- eval set in `sample-data/`

### Billing

- Manual audit pricing, contact, onboarding, and invoicing. No Stripe checkout is included in this build.
- Manual invoice for first 3–5 audits is acceptable

### Observability

- Structured logs
- Audit event table
- Sentry or equivalent for errors
- Admin-only job logs

## Data flow

### 1. Upload

User uploads contract and CSV files. The app stores files in tenant-scoped storage and records metadata in `source_documents`.

### 2. Parse

The app extracts text from documents and stores parse metadata. Raw text should be access-controlled and never logged.

### 3. Extract terms

The AI extraction agent converts text into structured `contract_terms` with citations and confidence.

### 4. Review

Human reviews extracted terms and marks them approved, edited, or needs review.

### 5. Reconcile

The deterministic engine compares approved terms against invoice and usage records.

### 6. Findings

The app creates leakage findings only when required evidence is present.

### 7. Evidence pack

The app compiles a shareable internal evidence pack containing:

- summary
- calculation
- cited source terms
- cited invoice/usage rows
- recommended action
- draft customer message

## Key services to implement

### `src/lib/agents/contractExtractor.ts`

Responsible for AI extraction from contract text.

### `src/lib/leakage/reconcile.ts`

Responsible for deterministic leakage calculations.

### `src/lib/evidence/`

Responsible for evidence citation formatting and pack generation.

### `src/lib/db/`

Database client and typed queries.

### `src/app/api/`

API routes for upload, extraction, reconciliation, findings, and exports.

## Minimal integrations for MVP

Use uploads first. Do not block the product on QuickBooks, Xero, HubSpot, Salesforce, Chargebee, or automatic billing integrations.

## Later integrations

Add in this order:

1. QuickBooks/Xero
2. HubSpot/Salesforce
3. Chargebee/Recurly
4. DocuSign/Ironclad/Google Drive
5. Slack/Email approval workflow
6. Optional payment automation after manual audit billing is proven

## Design for global scale

- Store currency per invoice and per finding.
- Use ISO dates.
- Avoid country-specific tax logic in MVP.
- Keep legal disclaimers country-neutral.
- Make extraction prompts locale-aware later.
- Build a rules registry so country/industry-specific rules can be added.
