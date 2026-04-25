# Architecture Map

## System Flow

```text
User
  -> Next.js App Router UI
  -> API Routes
  -> Supabase Auth + Postgres + Storage
  -> Document parsing/chunking
  -> Gemini extraction and embeddings
  -> pgvector semantic search
  -> Deterministic reconciliation
  -> Evidence-backed findings
  -> Human review
  -> Customer-ready reports
```

## Frontend

The main UI is `src/components/audit/RevenueAuditWorkspace.tsx`.

It renders:

- Organization/workspace setup.
- Role management.
- Uploads.
- Semantic evidence search.
- Human term review.
- Billing/usage records.
- Findings.
- Finding details.
- Evidence candidates.
- Report generation and export.

## Backend

API routes live in `src/app/api`.

Each private route should:

1. Authenticate the user.
2. Validate input with Zod.
3. Verify organization membership.
4. Verify workspace ownership for workspace-scoped operations.
5. Enforce role permissions for mutations.
6. Perform the operation.
7. Write audit events when important.
8. Return safe responses.

## Database

Canonical schema: `supabase/migrations/001_initial_schema.sql`.

Important tables:

- `organizations`
- `organization_members`
- `audit_workspaces`
- `customers`
- `source_documents`
- `document_chunks`
- `document_embeddings`
- `semantic_search_logs`
- `contract_terms`
- `invoice_records`
- `usage_records`
- `extraction_runs`
- `reconciliation_runs`
- `leakage_findings`
- `evidence_items`
- `evidence_candidates`
- `evidence_packs`
- `audit_events`

## AI Boundary

Gemini is used for:

- Contract text extraction.
- Scanned PDF/image multimodal extraction path.
- Embeddings.
- Semantic evidence search support.

AI does not calculate final money amounts.

## Deterministic Logic

Revenue leakage calculations live in `src/lib/leakage`.

Rules include:

- Minimum commitment shortfall.
- Usage overage unbilled.
- Seat underbilling.
- Expired discount still applied.
- Missed annual uplift.
- Renewal notice risk.
- Conflicting amendment risk.

## Evidence and Reports

Evidence code lives in `src/lib/evidence`.

Report route:

- `src/app/api/workspaces/[workspaceId]/report/route.ts`

Export route:

- `src/app/api/evidence-packs/[id]/export/route.ts`

Reports include only human-approved customer-facing findings and approved evidence.
