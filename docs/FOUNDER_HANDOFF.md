# Founder Handoff

LeakProof AI is a revenue audit workspace, not a chat product. The main workflow is public lead capture, secure login, organization/workspace setup, uploads, ingestion/chunking, Gemini embeddings, semantic evidence search, Gemini extraction, human term review, deterministic reconciliation, findings review, evidence packs, and executive reports.

## What Is Ready Locally

- Next.js app routes, protected workspace shell, and public pages for home, pricing, contact, and onboarding.
- Supabase schema with tenant tables, RLS, private storage bucket, pgvector, document chunks, document embeddings, AI jobs, embedding jobs, extraction runs, reconciliation runs, evidence candidates, and evidence packs.
- Server-only Supabase service-role access with authenticated user, organization membership, and workspace membership checks.
- Role-aware mutation checks for owner/admin/reviewer access, with viewer/member roles kept read-only.
- Role-management API surface for member list, existing-member role changes, last-owner protection, and privilege-escalation prevention.
- Gemini-first AI boundary with server-only generation and embedding helpers.
- Gemini Embedding 2 style vector pipeline with chunk hashing, fixed dimension checks, embedding jobs, and tenant-scoped semantic search route.
- OCR or Gemini multimodal ingestion is documented as the production path for scanned PDFs and image-only evidence; direct extraction still stops safely until that path is implemented.
- Gemini contract extraction with strict Zod validation and model provenance.
- Deterministic revenue leakage rules using integer minor units.
- Upload validation, CSV ingestion, chunk creation, citations, evidence candidate attach/remove/approve/reject, evidence pack generation, executive report generation, audit event redaction, and PRD-aligned finding status transitions.
- Revenue audit UI with upload queue, embedding action, semantic search, extracted terms, invoice/usage records, findings, review actions, and printable report panel.
- Smoke-test script and production setup documentation.

## Current External Blockers

- A dedicated Supabase project could not be created because the logged-in Supabase account has reached its active free-project limit.
- Required production credentials are not configured locally or in Vercel from this workspace.
- Live authenticated workflow testing, Supabase migration application, Gemini API calls, Vercel deployment, and deployed smoke tests must wait for Supabase and Gemini credentials.

## Launch Sequence

1. Pause, delete, or upgrade Supabase projects so a dedicated LeakProof AI project can be created, or provide an existing dedicated Supabase project.
2. Link Supabase and run `supabase db push`.
3. Confirm `vector` extension, RLS policies, `source-documents` bucket, document chunk tables, and vector search RPC exist.
4. Configure Supabase Auth site URL and redirect URLs for the final Vercel domain.
5. Set all required env vars from `docs/ENV_CHECKLIST.md` in Vercel.
6. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
7. Deploy with `vercel --prod`.
8. Run `NEXT_PUBLIC_APP_URL=<production-url> pnpm smoke`.
9. Complete the manual security checks in `docs/SECURITY_REVIEW.md`.

## Known Product Limits

- TXT contracts, text-based PDFs, DOCX files, invoice CSVs, and usage CSVs are ingestion/chunking-ready.
- Scanned PDFs and image evidence now have a Gemini multimodal ingestion path in code. This still needs live verification with a real Gemini key and production-like scanned contracts before production sign-off.
- The current embedding table is fixed to `vector(1536)`; changing dimensions requires a deliberate migration.
