# Environment Checklist

Use this checklist for local development, Vercel production, and preview deployments.

## Required

- `GEMINI_API_KEY`: server-only Gemini key.
- `GEMINI_GENERATION_MODEL`: default `gemini-2.5-pro`.
- `GEMINI_FAST_MODEL`: default `gemini-2.5-flash`.
- `GEMINI_EMBEDDING_MODEL`: default `gemini-embedding-2-preview`, or the current Gemini Embedding 2 model ID available in the account.
- `GEMINI_EMBEDDING_DIMENSION`: must be `1536` with the current database schema.
- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service role key.
- `NEXT_PUBLIC_APP_URL`: deployed app URL used for smoke tests and auth redirects.

## Optional

- `SENTRY_DSN`: production error monitoring.
- `AI_PROVIDER_FALLBACK_ENABLED=false`: reserved for a future fallback provider.

## Security Rules

- Do not commit `.env.local`, `.env.production.local`, or Supabase temp files.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in browser code.
- Do not paste raw contracts, invoice rows, embeddings, customer PII, prompts, tokens, or API keys into logs.
- Confirm Supabase Auth redirect URLs include the final Vercel production URL.
- Confirm all storage object paths start with `org/{org_id}/workspace/{workspace_id}/`.
- Confirm pgvector is enabled and embedding rows are organization-scoped.

## Automated Validation

Run:

```bash
pnpm env:check
```

Expected passing result:

- every required variable is present and not a placeholder,
- `NEXT_PUBLIC_APP_URL` is a valid `http` or `https` URL,
- `NEXT_PUBLIC_SUPABASE_URL` is an HTTPS Supabase project URL ending in `.supabase.co`,
- `SUPABASE_SERVICE_ROLE_KEY` is different from `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
- `GEMINI_EMBEDDING_DIMENSION` is `1536`, matching `document_embeddings.embedding vector(1536)`.

If this command fails, it prints variable names and validation errors only. It must not print key values, contract text, invoice contents, prompts, embeddings, model outputs, or customer PII.

Run the combined readiness helper when preparing a deployment:

```bash
pnpm production:readiness
```

That command runs the automated env validation and prints the manual Supabase, Gemini, Vercel, deployed smoke, and browser persona checks. Manual checks still need to be performed by a human.

## Production Checklist

| Status | Command | Owner | Expected result |
| --- | --- | --- | --- |
| Automated | `pnpm env:check` | Engineer | Env variables are present and pass shape checks. |
| Automated | `pnpm production:readiness` | Engineer | Env validation passes and manual checklist is printed. |
| Automated | `pnpm production:gate` | Engineer | Env, tests, typecheck, lint, and build pass with real env values. |
| Manual | `supabase link --project-ref <project-ref>` | Founder/engineer | Repo is linked to the dedicated Supabase project. |
| Manual | `supabase db push` | Founder/engineer | Migrations are applied to the linked Supabase project. |
| Manual | Supabase Auth URL Configuration | Founder/engineer | Site URL and redirect URLs include production and local URLs. |
| Manual | Google AI Studio API key setup | Founder | Gemini key is available only in server-side envs. |
| Manual | `vercel env add <name> production` | Founder/engineer | Vercel production env contains all required variables. |
| Manual | `NEXT_PUBLIC_APP_URL=https://leakproof-ai.vercel.app pnpm smoke` | Founder/engineer | Deployed smoke checks pass. |
| Manual | Owner/admin/reviewer/viewer browser test | Founder/QA | Role-gated live workflows behave correctly. |

## Current Local Status

If required production env vars are not present in the shell or pulled env files, the app can still build and serve setup screens locally, but authenticated Gemini/Supabase workflows need the credentials above.

Run this before any live workflow or deployment:

```bash
pnpm env:check
```

Run this before customer handoff after credentials are present:

```bash
pnpm production:gate
```
