# API Contracts

This is the human-readable API contract. See `docs/openapi.yaml` for an OpenAPI-style version.

## Auth

All routes except public landing pages require an authenticated user and organization membership.
Workflow mutations also require `owner`, `admin`, or `reviewer` roles unless the route is creating a brand-new organization.

## Core resources

- Organization
- Organization Member
- Audit Workspace
- Source Document
- Contract Term
- Invoice Record
- Usage Record
- Leakage Finding
- Evidence Item
- Evidence Candidate
- Audit Event

## Routes

### `POST /api/workspaces`

Create an audit workspace.

Request:

```json
{
  "organization_id": "organization_id",
  "name": "Q2 Revenue Leakage Audit"
}
```

Response:

```json
{
  "id": "workspace_id",
  "name": "Q2 Revenue Leakage Audit",
  "status": "draft"
}
```

### `POST /api/documents/upload`

Upload a contract, invoice CSV, usage CSV, or customer list.

Required metadata:

```json
{
  "organization_id": "organization_id",
  "workspace_id": "workspace_id",
  "document_type": "contract|invoice_csv|usage_csv|customer_csv",
  "customer_id": "optional_customer_id"
}
```

### `POST /api/extraction/run`

Start contract term extraction for a document.

Request:

```json
{
  "organization_id": "organization_id",
  "workspace_id": "workspace_id",
  "source_document_id": "document_id"
}
```

Response:

```json
{
  "status": "completed",
  "terms": []
}
```

### `GET /api/contract-terms?workspace_id=...`

Returns extracted terms for human review.

### `PATCH /api/contract-terms/:id`

Edit or approve an extracted term.

### `POST /api/reconciliation/run`

Run deterministic reconciliation.

Request:

```json
{
  "organization_id": "organization_id",
  "workspace_id": "workspace_id"
}
```

Response:

```json
{
  "status": "completed",
  "findings": []
}
```

### `GET /api/findings?workspace_id=...`

Returns findings.

### `GET /api/findings/:id`

Returns finding detail and evidence.

### `PATCH /api/findings/:id/status`

Approve, dismiss, or mark needs review.

Request:

```json
{
  "status": "approved|dismissed|needs_review",
  "note": "optional human note"
}
```

### `GET /api/findings/:id/evidence-pack`

Returns HTML evidence pack.

### `GET /api/organizations/:organization_id/members`

Returns organization members and roles for role management.

### `PATCH /api/organizations/:organization_id/members/:member_id`

Owner/admin route for changing a member role. The last owner cannot be demoted.

Request:

```json
{
  "organization_id": "organization_id",
  "role": "owner|admin|reviewer|member|viewer"
}
```

### `GET /api/evidence-candidates?organization_id=...&workspace_id=...`

Returns semantic evidence candidates with source chunk previews.

### `POST /api/evidence-candidates`

Attaches a semantic search result to a finding as a candidate.

Request:

```json
{
  "organization_id": "organization_id",
  "workspace_id": "workspace_id",
  "finding_id": "finding_id",
  "document_chunk_id": "document_chunk_id",
  "retrieval_score": 0.91,
  "relevance_explanation": "Why the reviewer attached it"
}
```

### `PATCH /api/evidence-candidates/:id`

Approves a candidate into an evidence item or rejects it.

Request:

```json
{
  "organization_id": "organization_id",
  "action": "approve|reject"
}
```

### `DELETE /api/evidence-items/:id`

Removes an attached evidence item from a finding.

### `POST /api/evidence-packs/:id/export`

Marks a generated customer-ready report as exported and writes an audit event.
