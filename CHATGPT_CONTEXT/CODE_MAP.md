# Code Map

## Where To Start

Start with:

- `src/components/audit/RevenueAuditWorkspace.tsx`
- `src/app/api`
- `src/lib/leakage/reconcile.ts`
- `src/lib/evidence/report.ts`
- `src/lib/ingest/documentText.ts`
- `src/lib/db/auth.ts`
- `src/lib/db/roles.ts`
- `supabase/migrations/001_initial_schema.sql`

## UI

`src/components/audit/RevenueAuditWorkspace.tsx`

Primary workflow component. It handles:

- Session state.
- Organization/workspace selection.
- Member role management.
- File upload.
- Embedding action.
- Semantic search.
- Term review.
- Reconciliation action.
- Finding status changes.
- Evidence candidate actions.
- Report generation and export.

## API Routes

Organization:

- `src/app/api/organizations/route.ts`
- `src/app/api/organizations/[organizationId]/members/route.ts`
- `src/app/api/organizations/[organizationId]/members/[memberId]/route.ts`

Workspace:

- `src/app/api/workspaces/route.ts`
- `src/app/api/workspaces/[workspaceId]/documents/[documentId]/embed/route.ts`
- `src/app/api/workspaces/[workspaceId]/semantic-search/route.ts`
- `src/app/api/workspaces/[workspaceId]/report/route.ts`

Documents:

- `src/app/api/documents/route.ts`
- `src/app/api/documents/upload/route.ts`

Extraction and terms:

- `src/app/api/extraction/run/route.ts`
- `src/app/api/contract-terms/route.ts`
- `src/app/api/contract-terms/[id]/route.ts`

Reconciliation and findings:

- `src/app/api/reconciliation/run/route.ts`
- `src/app/api/findings/route.ts`
- `src/app/api/findings/[id]/route.ts`
- `src/app/api/findings/[id]/status/route.ts`
- `src/app/api/findings/[id]/evidence-pack/route.ts`

Evidence:

- `src/app/api/evidence-candidates/route.ts`
- `src/app/api/evidence-candidates/[id]/route.ts`
- `src/app/api/evidence-items/[id]/route.ts`
- `src/app/api/evidence-packs/[id]/export/route.ts`

Records:

- `src/app/api/invoice-records/route.ts`
- `src/app/api/usage-records/route.ts`

Health:

- `src/app/api/health/route.ts`

## Libraries

API schemas:

- `src/lib/api/schemas.ts`
- `src/lib/api/status.ts`
- `src/lib/api/responses.ts`

Auth and database:

- `src/lib/db/supabaseServer.ts`
- `src/lib/db/supabaseBrowser.ts`
- `src/lib/db/auth.ts`
- `src/lib/db/roles.ts`
- `src/lib/db/audit.ts`
- `src/lib/db/mappers.ts`

AI:

- `src/lib/ai/config.ts`
- `src/lib/ai/gemini.ts`
- `src/lib/ai/geminiClient.ts`
- `src/lib/agents/contractExtractor.ts`
- `src/lib/agents/contractSchema.ts`

Ingestion:

- `src/lib/ingest/documentText.ts`
- `src/lib/ingest/csv.ts`
- `src/lib/ingest/chunking.ts`

Embeddings and retrieval:

- `src/lib/embeddings/vector.ts`
- `src/lib/retrieval/semanticSearch.ts`

Leakage rules:

- `src/lib/leakage/reconcile.ts`
- `src/lib/leakage/types.ts`

Evidence:

- `src/lib/evidence/candidates.ts`
- `src/lib/evidence/citations.ts`
- `src/lib/evidence/evidencePack.ts`
- `src/lib/evidence/report.ts`

Uploads:

- `src/lib/uploads/validation.ts`

Audit:

- `src/lib/audit/auditEvents.ts`

## Tests

Most logic tests are colocated with implementation files using `*.test.ts`.

Important test areas:

- `src/lib/leakage/*.test.ts`
- `src/lib/evidence/*.test.ts`
- `src/lib/ingest/*.test.ts`
- `src/lib/api/*.test.ts`
- `src/lib/audit/*.test.ts`
- `src/lib/uploads/*.test.ts`
- `src/lib/ai/*.test.ts`
- `src/lib/agents/*.test.ts`
