# Security Review

## Current pass

- RLS is enabled in `supabase/migrations/001_initial_schema.sql` for tenant tables.
- pgvector is enabled and document chunk, embedding, search log, AI job, extraction run, reconciliation run, evidence candidate, and evidence pack tables are RLS-protected.
- Source document storage paths are org-scoped: `org/{org_id}/workspace/{workspace_id}/...`.
- Upload validation blocks unsupported file types, mismatched extensions/MIME types, invalid PDF/DOCX/image magic bytes, and files over 25 MB. Scanned PDFs and image-only evidence use the server-side Gemini multimodal path and remain live-verification-gated before production use.
- `SUPABASE_SERVICE_ROLE_KEY` is only read inside `server-only` server modules.
- `GEMINI_API_KEY` is only read inside server-side Gemini helpers.
- Private API routes require a bearer token and verify organization membership server-side.
- Workspace-scoped routes also verify the workspace belongs to the submitted organization before reading, uploading, embedding, searching, extracting, reconciling, or reporting.
- Document embedding verifies the requested document belongs to the path workspace before creating jobs or updating document status.
- Mutating review workflow routes are role-gated to `owner`, `admin`, or `reviewer`; viewers and ordinary members remain read-only.
- Supabase write policies also use role-aware RLS helpers instead of broad member-write access.
- Semantic search uses a workspace-scoped RPC and stores only safe query hashes in logs.
- Sensitive workflow routes have route-level safeguards for upload, extraction, embedding, semantic search, reconciliation, and report generation. Local/dev/test use an in-memory limiter; production has a Supabase-backed shared limiter path through `LEAKPROOF_RATE_LIMIT_BACKEND=supabase` and `consume_api_rate_limit`.
- Security headers are configured in `next.config.ts`, including CSP with `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. The current CSP still allows inline/eval script styles needed by the app stack; tighten it in a later hardening pass before enterprise use.
- Audit helpers recursively redact raw contracts, invoice rows, embeddings, prompts, tokens, API keys, model responses, excerpts, citations, and free-text notes.
- Audit events cover organization/workspace creation, upload, ingestion, chunking start/completion, embedding, semantic search, extraction start/completion/failure, term approve/edit/reject/needs-review, reconciliation, finding creation/status changes, finding export, report generation/export, role changes, invite create/cancel/accept, evidence item removal, and evidence candidate attach/approve/reject.
- Findings require citations before finding evidence packs can be generated.
- System-created evidence starts as `suggested`; customer-facing reports use only reviewer-approved evidence with reviewer metadata.
- Finding status changes are validated server-side; customer-facing reports include only approved, customer-ready, or recovered findings that pass evidence export rules.

## Launch blockers to verify in the live project

- Supabase project must be dedicated to LeakProof AI.
- Supabase Auth email redirect URLs must include the production Vercel URL.
- `source-documents` bucket policies must be present after migration.
- Gemini generation and embedding keys/models must be set in Vercel production envs.
- pgvector search must be verified after migration.
- Production smoke test must pass after deployment.
- Server-side Gemini multimodal scanned PDF/image extraction is implemented, but it must be live-verified with representative scans before scanned files are used in production evidence.
- Server-side login success/failure audit events remain a gap while login is performed directly through Supabase browser auth. Add a server-side auth callback or Supabase Auth hooks before enterprise deployment.
- Configure `LEAKPROOF_RATE_LIMIT_BACKEND=supabase` and verify the shared limiter against the deployed Supabase project before running multiple app instances. In-memory limiting is not enough for multi-instance production.
- Sentry DSN is optional, but should be configured before paid customer usage.
- `pnpm env:check` must pass with real production values before live workflow testing. It now rejects invalid app URLs, non-Supabase project URLs, anon/service-role key reuse, and Gemini embedding dimensions that do not match the current `vector(1536)` schema.

## Manual checks

- Sign in as one user and create an organization.
- Sign in as another user and verify the first organization is not visible.
- Seed a viewer role and verify upload, extraction, reconciliation, approval, export, and report mutations are blocked.
- Upload a contract and confirm no raw contract text appears in server logs.
- Upload renamed or spoofed PDFs/images and confirm invalid magic bytes are rejected.
- Approve a finding and verify an audit event is created.
- Export a finding and verify an audit event is created.
- Attach, approve, reject, and remove evidence candidates and verify audit events are created without raw chunk contents.
- Run `pnpm production:readiness` before live workflow testing and `pnpm production:gate` before deployment.

## Data safety checklist

- Do not upload real customer contracts, invoices, usage files, or PII until production envs, live security checks, role QA, deployed smoke, and mock-audit verification pass.
- Do not commit raw files, customer exports, generated evidence packs containing customer data, `.env.local`, `.env.production.local`, Supabase keys, Gemini keys, Vercel tokens, or browser session artifacts.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` out of `NEXT_PUBLIC_` variables and out of client components.
- Do not include raw contract text, invoice rows, embeddings, prompts, model responses, evidence excerpts, or free-text reviewer notes in logs or audit metadata.
- Do not send or export reports containing unapproved evidence. Suggested, rejected, draft, and system-created evidence stays internal until a reviewer approves it.
- Use only `sample-data/mock-pilot` for the first release rehearsal and verify the expected `USD 26,690` total before any customer pilot.
