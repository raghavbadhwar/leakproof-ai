# Security Review

## Current pass

- RLS is enabled in `supabase/migrations/001_initial_schema.sql` for tenant tables.
- pgvector is enabled and document chunk, embedding, search log, AI job, extraction run, reconciliation run, evidence candidate, and evidence pack tables are RLS-protected.
- Source document storage paths are org-scoped: `org/{org_id}/workspace/{workspace_id}/...`.
- Upload validation blocks unsupported file types, mismatched extensions/MIME types, invalid PDF/DOCX/image magic bytes, and files over 25 MB. Scanned PDFs and image-only evidence must use the documented OCR/multimodal strategy before extraction.
- `SUPABASE_SERVICE_ROLE_KEY` is only read inside `server-only` server modules.
- `GEMINI_API_KEY` is only read inside server-side Gemini helpers.
- Private API routes require a bearer token and verify organization membership server-side.
- Workspace-scoped routes also verify the workspace belongs to the submitted organization before reading, uploading, embedding, searching, extracting, reconciling, or reporting.
- Document embedding verifies the requested document belongs to the path workspace before creating jobs or updating document status.
- Mutating review workflow routes are role-gated to `owner`, `admin`, or `reviewer`; viewers and ordinary members remain read-only.
- Supabase write policies also use role-aware RLS helpers instead of broad member-write access.
- Semantic search uses a workspace-scoped RPC and stores only safe query hashes in logs.
- Sensitive workflow routes have route-level safeguards for upload, extraction, embedding, semantic search, and reconciliation. Current implementation is in-process and should move to a shared production store for multi-instance enforcement.
- Security headers are configured in `next.config.ts`, including CSP with `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Audit helpers recursively redact raw contracts, invoice rows, embeddings, prompts, tokens, API keys, model responses, excerpts, citations, and free-text notes.
- Audit events cover organization/workspace creation, upload, ingestion, chunking start/completion, embedding, semantic search, extraction start/completion/failure, term approve/edit/reject/needs-review, reconciliation, finding creation/status changes, finding export, report generation/export, role changes, evidence item removal, and evidence candidate attach/approve/reject.
- Findings require citations before evidence packs can be generated.
- Finding status changes are validated server-side; exports are allowed only after approval.

## Launch blockers to verify in the live project

- Supabase project must be dedicated to LeakProof AI.
- Supabase Auth email redirect URLs must include the production Vercel URL.
- `source-documents` bucket policies must be present after migration.
- Gemini generation and embedding keys/models must be set in Vercel production envs.
- pgvector search must be verified after migration.
- Production smoke test must pass after deployment.
- OCR or Gemini multimodal scanned PDF/image extraction must be implemented and verified before scanned files are used as evidence.
- Server-side login success/failure audit events remain a gap while login is performed directly through Supabase browser auth. Add a server-side auth callback or Supabase Auth hooks before enterprise deployment.
- Replace in-memory rate limiting with shared production rate limiting before running multiple app instances.
- Sentry DSN is optional, but should be configured before paid customer usage.

## Manual checks

- Sign in as one user and create an organization.
- Sign in as another user and verify the first organization is not visible.
- Seed a viewer role and verify upload, extraction, reconciliation, approval, export, and report mutations are blocked.
- Upload a contract and confirm no raw contract text appears in server logs.
- Upload renamed or spoofed PDFs/images and confirm invalid magic bytes are rejected.
- Approve a finding and verify an audit event is created.
- Export a finding and verify an audit event is created.
- Attach, approve, reject, and remove evidence candidates and verify audit events are created without raw chunk contents.
- Run `pnpm env:check` before live workflow testing and `pnpm production:gate` before deployment.
