# Deployment Guide

LeakProof AI is a production web app built for Vercel, Supabase, pgvector, and Gemini.

## Required services

- Vercel project: `leakproof-ai`
- Supabase project: dedicated project for LeakProof AI data
- Gemini API key for extraction and embeddings
- Optional Sentry project for error monitoring

## Environment variables

Set these in `.env.local` for local development and in Vercel for production:

```bash
GEMINI_API_KEY=
GEMINI_GENERATION_MODEL=gemini-2.5-pro
GEMINI_FAST_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_EMBEDDING_DIMENSION=1536
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
SENTRY_DSN=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in browser code. They are only used by server-only modules.

See `docs/ENV_CHECKLIST.md` for the full env and security checklist.

## Security controls

- Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` in Vercel server environment variables only.
- Confirm response headers include CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.
- Sensitive workflow routes have in-process rate limits for upload, extraction, embedding, semantic search, and reconciliation. For multi-instance production traffic, back these limits with a shared store such as Vercel KV, Upstash, or Supabase before opening broad customer access.
- Uploads must pass extension, MIME, size, and magic-byte checks for PDFs, DOCX, PNG, and JPEG files.
- Server audit metadata is redacted before persistence. Do not add raw contract text, invoice rows, embeddings, prompts, model responses, excerpts, notes, secrets, or tokens to audit metadata or operational errors.
- Login success/failure events are not server-audited yet because sign-in is handled directly by Supabase Auth in the browser. Add Supabase Auth hooks or a server-side auth callback before treating auth-event audit coverage as complete.

## Supabase setup

1. Create a new Supabase project for LeakProof AI.
2. Link the project with `supabase link --project-ref <project-ref>`.
3. Apply migrations with `supabase db push`.
4. Confirm the private `source-documents` storage bucket exists.
5. Confirm `vector` extension, `document_chunks`, `document_embeddings`, and `match_document_chunks` exist.
6. Confirm RLS is enabled on all public tenant tables.
7. Configure Supabase Auth email sign-in and set the site URL to the deployed Vercel URL.
8. Service-role API routes intentionally bypass RLS after server-side bearer-token, org, workspace, and role checks. Keep this pattern limited to API routes and server-only modules.

## Required live verification

Do not mark external-service features complete from local tests alone. Complete these checks against the linked production-like services:

1. Create four real users: owner, admin, reviewer, and viewer.
2. Verify owner/admin can change existing member roles.
3. Verify reviewer can upload, extract, reconcile, review terms/findings, and review evidence, but cannot manage roles.
4. Verify viewer can read workspace data but cannot upload, extract, reconcile, change statuses, approve evidence, export reports, or manage roles.
5. Verify the last owner cannot be demoted.
6. Upload a text contract and confirm extraction returns validated text and citations. Upload a scanned PDF and confirm the OCR-required blocker appears instead of guessed terms.
7. Embed document chunks with Gemini Embedding 2 and confirm pgvector semantic search returns tenant-scoped results.
8. Generate a report and confirm only approved/customer-ready findings and approved evidence appear.
9. Export the report and confirm `report.exported` is audit logged.
10. Verify upload, extraction, embedding, semantic search, and reconciliation throttling returns HTTP 429 after repeated rapid calls.
11. Open the deployed Vercel app in a browser and confirm no critical console errors.
12. Inspect deployed response headers and confirm CSP/frame/content-type/referrer/permissions headers are present.

## Vercel setup

1. Link the project with `vercel link`.
2. Add all required environment variables with `vercel env add` or the Vercel dashboard.
3. Pull envs locally with `vercel env pull .env.local --yes`.
4. Run `pnpm production:gate`.
5. Deploy with `vercel --prod`.
6. Run `NEXT_PUBLIC_APP_URL=<production-url> pnpm smoke`.

## Rollback

Use `vercel rollback` to restore the previous production deployment. If a database migration must be rolled back, create a forward migration that restores the previous schema behavior.
