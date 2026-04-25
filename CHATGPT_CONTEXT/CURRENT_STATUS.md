# Current Status

## Repo-Side Status

The local repository is production-shaped and passes local quality gates.

Latest local verification:

- `pnpm test`: passed, 20 test files and 52 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `APP_URL=http://localhost:3011 pnpm smoke`: passed for `/app` and `/api/health`.

## External Blockers

`pnpm env:check` currently fails unless real environment variables are configured.

Missing in the local shell during the latest check:

- `GEMINI_API_KEY`
- `GEMINI_GENERATION_MODEL`
- `GEMINI_FAST_MODEL`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_DIMENSION`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Live production completion requires:

1. Dedicated Supabase project.
2. Supabase migration applied.
3. Supabase Auth configured.
4. Gemini key and model env vars configured server-side.
5. Vercel project linked.
6. Vercel env vars configured.
7. Live owner/admin/reviewer/viewer workflow verification.
8. Deployed smoke test.

## Completed Production Gaps

- Environment gate script.
- Existing-member role management UI/API.
- Human term review UI/API.
- Evidence candidate attach, approve, reject, and remove workflow.
- Rich finding detail UX.
- Customer-ready report generation and export.
- Additional audit events.
- Scanned PDF/image ingestion strategy and server-side Gemini multimodal path.
- Final local test/build/smoke verification.

## Scope Boundaries

Do not add unless explicitly requested:

- Chatbot-first UI.
- Stripe.
- Billing automation.
- Automatic invoice sending.
- Automatic customer emails.
- Legal advice features.
- Broad redesign.
- Parallel app root.

## Best Next Live Steps

1. Create/link a Supabase project.
2. Run migrations.
3. Configure env vars locally and in Vercel.
4. Run `pnpm production:gate`.
5. Deploy to Vercel.
6. Run `NEXT_PUBLIC_APP_URL=<production-url> pnpm smoke`.
7. Perform the manual role and workflow checks in `docs/SECURITY_REVIEW.md`.
