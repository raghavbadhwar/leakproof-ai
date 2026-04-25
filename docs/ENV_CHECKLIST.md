# Environment Checklist

Use this checklist for local development, Vercel production, and preview deployments.

## Required

- `GEMINI_API_KEY`: server-only Gemini key.
- `GEMINI_GENERATION_MODEL`: default `gemini-2.5-pro`.
- `GEMINI_FAST_MODEL`: default `gemini-2.5-flash`.
- `GEMINI_EMBEDDING_MODEL`: default `gemini-embedding-2-preview`, or the current Gemini Embedding 2 model ID available in the account.
- `GEMINI_EMBEDDING_DIMENSION`: one of `768`, `1536`, or `3072`; the current migration uses `1536`.
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

## Current Local Status

As of the latest local verification, required production env vars are not present in the shell. The app can build and serve setup screens locally, but authenticated Gemini/Supabase workflows need the credentials above.

Run this before any live workflow or deployment:

```bash
pnpm env:check
```

Run this before customer handoff after credentials are present:

```bash
pnpm production:gate
```
