# Data Model

The canonical SQL migration is `supabase/migrations/001_initial_schema.sql`.

## Main tables

### `organizations`

Tenant boundary.

### `organization_members`

Maps users to organizations and roles.

### `audit_workspaces`

A workspace for one audit project.

### `customers`

Customer entities inside an organization.

### `source_documents`

Uploaded contracts, invoice CSVs, usage CSVs, and customer CSVs.

### `document_chunks`

Citation-ready chunks created from TXT, text-based PDF/DOCX, and CSV source documents.

### `embedding_jobs`

Tracks Gemini embedding generation status, model, dimension, and chunk counts.

### `document_embeddings`

Tenant-scoped pgvector embeddings linked to document chunks.

### `semantic_search_logs`

Stores safe metadata and query hashes for semantic evidence search.

### `extraction_runs`

Tracks Gemini extraction provider, model, prompt version, and term counts.

### `contract_terms`

AI-extracted commercial terms with citations and confidence.

### `invoice_records`

Normalized invoice rows.

### `usage_records`

Normalized usage or seat rows.

### `reconciliation_runs`

Tracks deterministic reconciliation executions and finding counts.

### `leakage_findings`

Deterministic findings from reconciliation.

### `evidence_items`

Structured evidence attached to findings.
Evidence rows are scoped by both organization and workspace so finding detail, exports, and removal actions cannot cross workspace boundaries.
Default `approval_state` is `suggested`. Customer-facing exports require `approval_state = approved` with reviewer metadata. Suggested, rejected, draft, and system-created evidence are excluded.

### `evidence_candidates`

Gemini-retrieved evidence suggestions requiring human review.
Candidates can be attached from semantic search, approved into evidence items, or rejected with an audit trail.

### `evidence_packs`

Generated executive report and evidence-pack records.

### `audit_events`

Security and workflow events.

## Status design

### Workspace status

- `draft`
- `processing`
- `ready`
- `error`
- `archived`

### Term review status

- `extracted`
- `approved`
- `edited`
- `needs_review`
- `rejected`

### Finding status

- `draft`
- `needs_review`
- `approved`
- `dismissed`
- `customer_ready`
- `recovered`
- `not_recoverable`

## Money design

Use integer minor units where possible, for example cents. Store currency codes separately.

Example:

```json
{
  "amount_minor": 125000,
  "currency": "USD"
}
```

Do not use floating point numbers for final money calculations.
