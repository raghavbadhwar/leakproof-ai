# Founder Handoff

LeakProof AI is a revenue audit workspace, not a chat product. The main workflow is secure login, organization/workspace setup, customer-linked uploads, ingestion/chunking, Gemini embeddings, semantic evidence search, Gemini extraction, human term review, period-aware deterministic reconciliation, findings review, approved evidence packs, and customer-ready executive reports.

## Release Posture

Current status: **repo-side ready, pre-production candidate**.

Do not call production complete until live Supabase, Gemini, Vercel, deployed smoke, mock-audit, and owner/admin/reviewer/viewer role QA checks pass.

## What Is Ready In The Repo

- Next.js app routes, protected workspace shell, and public pages for home, pricing, contact, and onboarding.
- Supabase schema with tenant tables, RLS, private storage bucket, pgvector, document chunks, document embeddings, extraction runs, reconciliation runs, evidence candidates, evidence packs, and audit events.
- Server-only Supabase service-role access with authenticated user, organization membership, workspace ownership, and role checks.
- Role-aware mutation checks for owner/admin/reviewer access, with viewer/member roles kept read-only in the app/API design.
- Existing-member role management, invites, last-owner protection, and privilege-escalation prevention.
- Customer/account linking from contract upload fields, invoice CSVs, usage CSVs, customer CSVs, extracted customer names, and document assignment APIs.
- Gemini-first AI boundary with server-only generation, scanned PDF/image extraction, and embeddings.
- TXT, DOCX, text-based PDF, invoice CSV, usage CSV, and server-side scanned PDF/image ingestion paths.
- Human term review with original vs edited values.
- Period-aware deterministic revenue leakage rules using integer minor units.
- Payment terms mismatch risk detection.
- Idempotent extraction and reconciliation reruns with active/superseded output.
- Evidence candidate attach/remove/approve/reject flow.
- Customer-ready reports that include only approved/customer-facing findings and reviewer-approved evidence.
- Smoke-test, env-check, production-readiness, and production-gate scripts.

## What Still Needs Live Verification

- Dedicated Supabase project migration state, RLS behavior, private storage bucket, pgvector search, and rate-limit RPC.
- Supabase Auth redirect URLs and four real test users.
- Gemini generation, embedding, and scanned-file extraction with real credentials and representative files.
- Vercel production env vars and deployed production URL.
- Deployed smoke test.
- Mock audit total of `USD 26,690`.
- Manual owner/admin/reviewer/viewer browser QA.

## Founder Production Checklist

- [ ] Create a dedicated Supabase project for LeakProof AI.
- [ ] Link the repo to that project and apply all migrations with `supabase db push`.
- [ ] Confirm migrations created RLS policies, `source-documents`, pgvector tables/RPCs, and API rate-limit tables/RPCs.
- [ ] Configure Supabase Auth Site URL and redirect URLs for production and local development.
- [ ] Configure Gemini by creating or rotating a key and setting the required model env vars.
- [ ] Configure Vercel by linking the project and adding every required production env var.
- [ ] Run `pnpm production:gate` with real production env values.
- [ ] Deploy with `vercel deploy --prod`.
- [ ] Run `APP_URL=<production-url> pnpm smoke`.
- [ ] Run a mock audit using only `sample-data/mock-pilot`.
- [ ] Verify the mock audit report/analytics total is exactly `USD 26,690`.
- [ ] Run manual role QA for owner, admin, reviewer, and viewer using `docs/QA_RUNBOOK.md`.
- [ ] Record any failed check before inviting a real customer.

## Data Safety Checklist

- [ ] Do not upload real customer data until live security checks, role QA, deployed smoke, and mock-audit verification pass.
- [ ] Do not commit raw customer files, contracts, invoices, usage exports, generated customer reports, screenshots containing customer data, or local Supabase storage files.
- [ ] Do not commit `.env.local`, `.env.production.local`, Supabase service-role keys, Gemini keys, Vercel tokens, or browser session files.
- [ ] Do not move `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` into client code or `NEXT_PUBLIC_` variables.
- [ ] Do not send customer-ready reports unless every included money finding has approved contract evidence, approved invoice or usage evidence, and formula inputs.
- [ ] Do not send customer-ready reports with suggested, rejected, draft, or system-created evidence that a reviewer has not approved.
- [ ] Use the mock pilot dataset for rehearsal before using any customer data.

## Known Product Limits

- Scanned PDFs and image evidence have a server-side Gemini multimodal path in code, but production use still needs live verification with a real Gemini key and production-like scanned contracts.
- Risk-only findings can be reportable with approved contract evidence; recoverable money findings require approved contract evidence plus approved invoice or usage evidence.
- The current embedding table is fixed to `vector(1536)`; changing dimensions requires a deliberate migration.
- Login success/failure is not yet server-audited because sign-in is handled through Supabase browser auth.
- First production audits should be founder/QA supervised. Do not treat the workflow as unattended automation.
