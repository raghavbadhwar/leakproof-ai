# Deployment Guide

LeakProof AI is a production-shaped web app targeting Vercel, Supabase, pgvector, and Gemini. Treat it as repo-side ready and a pre-production candidate until the automated gate and live manual checks below pass.

## Required Services

- Vercel project: `leakproof-ai`
- Supabase project: dedicated project for LeakProof AI data
- Gemini API key for extraction and embeddings
- Optional Sentry project for error monitoring

## Production Gate Rule

Do not call LeakProof production-ready until both gates are complete:

1. Automated repo gate passes.
2. Manual live-service checks pass against the real Supabase, Gemini, and Vercel projects.

Run the readiness helper first:

```bash
pnpm production:readiness
```

That command validates the local or pulled environment and prints the manual checklist. It does not verify browser personas, Supabase dashboard settings, deployed auth redirects, Gemini account access, or Vercel deployment state by itself.

The automated deployment gate is:

```bash
pnpm production:gate
```

It runs env validation, unit/integration-placeholder tests, typecheck, lint, and build with real production env values. Mocked Playwright browser E2E is run separately with `pnpm test:e2e` because it builds the app with non-secret local browser test env. Live Supabase and Gemini integration tests remain outside normal CI and require `RUN_INTEGRATION=1`.

## Founder Release Checklist

Use this checklist before putting real customer files into the app.

- [ ] Create a dedicated Supabase project for LeakProof AI. Do not reuse a project with unrelated data.
- [ ] Link the Supabase project and apply every migration in `supabase/migrations`.
- [ ] Confirm the `source-documents` bucket, RLS policies, pgvector objects, and rate-limit RPC exist.
- [ ] Configure Supabase Auth Site URL and redirect URLs for the production Vercel URL and local development URL.
- [ ] Create or rotate the Gemini API key and keep it only in local/server/Vercel server env vars.
- [ ] Link the Vercel project and configure every required production env var.
- [ ] Run `pnpm production:gate` with real production env values.
- [ ] Deploy with `vercel deploy --prod`.
- [ ] Run `APP_URL=<production-url> pnpm smoke`.
- [ ] Run the mock audit using only `sample-data/mock-pilot` fixtures.
- [ ] Verify the mock audit report/analytics total is `USD 26,690`.
- [ ] Run owner, admin, reviewer, and viewer QA from `docs/QA_RUNBOOK.md`.
- [ ] Only after all checks pass, approve a controlled pilot with non-sensitive or approved customer data.

## Environment Variables

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
LEAKPROOF_RATE_LIMIT_BACKEND=memory
NEXT_PUBLIC_APP_URL=
SENTRY_DSN=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in browser code. They are only used by server-only modules.

`pnpm env:check` validates more than presence:

- `NEXT_PUBLIC_APP_URL` must be a valid `http` or `https` URL.
- `NEXT_PUBLIC_SUPABASE_URL` must look like an HTTPS Supabase project URL ending in `.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY` must not equal `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `GEMINI_EMBEDDING_DIMENSION` must match the current pgvector schema dimension, which is `1536`.

See `docs/ENV_CHECKLIST.md` for the full env and security checklist.

## Security Controls

- Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` in Vercel server environment variables only.
- Confirm response headers include CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.
- Sensitive workflow routes have rate limits for upload, extraction, embedding, semantic search, reconciliation, and report generation.
- Local/dev/test can use `LEAKPROOF_RATE_LIMIT_BACKEND=memory`. Multi-instance production must use a shared backend; this repo includes a Supabase-backed adapter and `supabase/migrations/006_api_rate_limits.sql`. Set `LEAKPROOF_RATE_LIMIT_BACKEND=supabase` after applying migrations. If production runs without an explicit shared backend, or is set to `memory`, protected API routes fail closed.
- Uploads must pass extension, MIME, size, and magic-byte checks for PDFs, DOCX, PNG, and JPEG files.
- Server audit metadata is redacted before persistence. Do not add raw contract text, invoice rows, embeddings, prompts, model responses, excerpts, notes, secrets, or tokens to audit metadata or operational errors.
- Login success/failure events are not server-audited yet because sign-in is handled directly by Supabase Auth in the browser. Add Supabase Auth hooks or a server-side auth callback before treating auth-event audit coverage as complete.

## Supabase Setup

1. Create a new dedicated Supabase project from the Supabase dashboard. Do not reuse a project that already contains customer data or unrelated tables.
2. Copy the project reference from the dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`.
3. Authenticate the CLI:

```bash
supabase login
```

4. Link this repo to that project:

```bash
supabase link --project-ref <project-ref>
```

5. Apply the checked-in migrations:

```bash
supabase db push
```

6. Confirm the migration state:

```bash
supabase migration list
```

7. In the Supabase dashboard, confirm the private `source-documents` storage bucket exists.
8. In the SQL editor or table editor, confirm `vector`, `document_chunks`, `document_embeddings`, and `match_document_chunks` exist.
9. Confirm `api_rate_limit_buckets` and `consume_api_rate_limit` exist before setting `LEAKPROOF_RATE_LIMIT_BACKEND=supabase`.
10. Confirm RLS is enabled on all public tenant tables.
11. Service-role API routes intentionally bypass RLS only after server-side bearer-token, org, workspace, and role checks. Keep this pattern limited to API routes and server-only modules.

Reference: Supabase documents project linking and `supabase db push` in its CLI migration workflow, and documents Auth redirect URLs in the dashboard URL Configuration page.

## Supabase Auth Redirect Setup

In Supabase dashboard, open Auth, then URL Configuration.

Set Site URL to the production app URL:

```text
https://leakproof-ai.vercel.app
```

Add redirect URLs:

```text
https://leakproof-ai.vercel.app/**
http://localhost:3000/**
```

For Vercel preview deployments, add a preview allow-list only if the team is actively testing previews:

```text
https://*-<team-or-account-slug>.vercel.app/**
```

Use exact production URLs for production. Keep wildcard preview URLs out of customer-facing launch checks unless preview testing is intentional.

## Gemini Setup

1. In Google AI Studio, create or rotate a Gemini API key for the project.
2. Store it as `GEMINI_API_KEY`.
3. Use the model values in `.env.example` unless the account has been deliberately moved to newer model IDs:

```bash
GEMINI_GENERATION_MODEL=gemini-2.5-pro
GEMINI_FAST_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_EMBEDDING_DIMENSION=1536
```

4. Keep the key server-side only. Do not add it with a `NEXT_PUBLIC_` prefix.
5. If changing the embedding dimension, write and apply a schema migration first. The current database schema stores `vector(1536)` embeddings, so `pnpm env:check` rejects other dimensions.

Reference: Google documents Gemini API keys in Google AI Studio and recommends using environment variables for SDK access. The Gemini embeddings API supports explicit output dimensionality; this repo fixes it to `1536` until the database schema changes.

## Vercel Setup

1. Link the project:

```bash
vercel link
```

2. Add every required variable to the production environment:

```bash
vercel env add GEMINI_API_KEY production
vercel env add GEMINI_GENERATION_MODEL production
vercel env add GEMINI_FAST_MODEL production
vercel env add GEMINI_EMBEDDING_MODEL production
vercel env add GEMINI_EMBEDDING_DIMENSION production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add LEAKPROOF_RATE_LIMIT_BACKEND production
vercel env add NEXT_PUBLIC_APP_URL production
```

3. Pull production project settings locally before the final local gate:

```bash
vercel pull --environment=production
```

4. Run the local gate with real values available:

```bash
pnpm production:gate
```

5. Deploy production:

```bash
vercel deploy --prod
```

Reference: Vercel documents `vercel pull --environment=production`, `vercel env pull`, and `vercel deploy --prod` in the Vercel CLI docs.

## Required Live Verification

Do not mark external-service features complete from local tests alone. Complete these checks against the linked production-like services:

1. Create four real users: owner, admin, reviewer, and viewer.
2. Verify owner/admin can change existing member roles.
3. Verify reviewer can upload, extract, reconcile, review terms/findings, and review evidence, but cannot manage roles.
4. Verify viewer can read workspace data but cannot upload, extract, reconcile, change statuses, approve evidence, export reports, or manage roles.
5. Verify the last owner cannot be demoted.
6. Upload a text contract and confirm extraction returns validated text and citations. Upload a scanned PDF or image contract and confirm the server-side Gemini multimodal path either extracts citation-ready text or blocks the file with a clear parse/low-confidence error instead of guessed terms.
7. Embed document chunks with Gemini Embedding 2 and confirm pgvector semantic search returns tenant-scoped results.
8. Generate a report and confirm only approved/customer-ready findings and approved evidence appear.
9. Export the report and confirm `report.exported` is audit logged.
10. Verify upload, extraction, embedding, semantic search, and reconciliation throttling returns HTTP 429 after repeated rapid calls.
11. Open the deployed Vercel app in a browser and confirm no critical console errors.
12. Inspect deployed response headers and confirm CSP/frame/content-type/referrer/permissions headers are present.

## CI Verification

GitHub Actions runs the normal repo gate on push and pull request:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The CI workflow intentionally does not run live Supabase or Gemini integration tests. Those checks require explicit credentials and should run only in a controlled integration environment.

## Deployed Smoke Test

After production deploy, run:

```bash
NEXT_PUBLIC_APP_URL=https://leakproof-ai.vercel.app pnpm smoke
```

Expected result:

- `/app` returns HTTP 200.
- `/api/health` returns HTTP 200.
- the analytics route returns HTTP 401 without a smoke auth token.

If a real smoke user token is available, set `SMOKE_AUTH_TOKEN`, `SMOKE_WORKSPACE_ID`, and `SMOKE_ORGANIZATION_ID` and rerun the smoke test for the authenticated analytics path.

## Deployment Checklist

| Status | Command or action | Owner | Expected result |
| --- | --- | --- | --- |
| Automated | `pnpm env:check` | Engineer | Required env vars exist and pass URL, key separation, and embedding dimension checks. |
| Automated | `pnpm test` | Engineer | Unit tests pass. |
| Automated | `pnpm typecheck` | Engineer | TypeScript passes without emit. |
| Automated | `pnpm lint` | Engineer | ESLint passes. |
| Automated | `pnpm build` | Engineer | Next.js production build succeeds. |
| Automated | `pnpm test:e2e` | Engineer | Playwright verifies public pages, health, auth-required state, and mocked authenticated audit shell pages. |
| Manual | `supabase link --project-ref <project-ref>` | Founder/engineer | Repo is linked to the dedicated Supabase project. |
| Manual | `supabase db push` | Founder/engineer | Migrations are applied to the linked project. |
| Manual | Supabase Auth URL Configuration | Founder/engineer | Site URL and redirect URLs include production and local development URLs. |
| Manual | Google AI Studio key setup | Founder | Gemini key exists and is stored only in server envs. |
| Manual | `vercel env add <name> production` | Founder/engineer | Vercel production env has every required variable. |
| Manual | `vercel deploy --prod` | Founder/engineer | Production deployment completes. |
| Manual | `NEXT_PUBLIC_APP_URL=https://leakproof-ai.vercel.app pnpm smoke` | Founder/engineer | Deployed smoke checks pass. |
| Manual | Mock audit with `sample-data/mock-pilot` | Founder/QA | Report or analytics total matches `USD 26,690` without real customer data. |
| Manual | Owner/admin/reviewer/viewer browser test | Founder/QA | Role-gated workflows behave correctly against real Supabase Auth. |

## Rollback

Use `vercel rollback` to restore the previous production deployment. If a database migration must be rolled back, create a forward migration that restores the previous schema behavior.
