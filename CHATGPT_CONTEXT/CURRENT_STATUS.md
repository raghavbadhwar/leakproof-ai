# Current Status

## Repo-Side Status

The local repository is production-shaped, repo-side ready, and a pre-production candidate. Do not call production complete until live Supabase, Gemini, Vercel, deployed smoke, mock-audit, and role QA checks pass.

LeakProof Copilot is now implemented through the final local hardening gate as a right-side assistant and command layer over the existing audit workspace. It can answer read-only workspace/finding/report questions from scoped tools, provide Gemini-assisted explanations with schema validation and deterministic fallback, prepare action cards, execute supported confirmed workflows through existing guarded routes/helpers, and provide advisory finding intelligence. It remains bounded by the product rule: LLM explains and suggests, code calculates, human approves.

Current release checks to run before handoff:

- `pnpm production:gate` with real production env values.
- `APP_URL=<production-url> pnpm smoke` after deployment.
- Mock audit against `sample-data/mock-pilot`, with expected total `USD 26,690`.
- Owner/admin/reviewer/viewer browser QA against real Supabase Auth.
- Copilot browser QA for read-only answers, action cards, confirmation/cancellation/execution, and finding intelligence prompts.

## External Blockers

`pnpm env:check` depends on the current shell or pulled Vercel env files. It must pass with real values before production gating, but passing env validation is not the same as live workflow verification.

Live production completion requires:

1. Dedicated Supabase project.
2. Supabase migration applied.
3. Supabase Auth configured.
4. Gemini key and model env vars configured server-side.
5. Vercel project linked.
6. Vercel env vars configured.
7. Live owner/admin/reviewer/viewer workflow verification.
8. Deployed smoke test.
9. Mock audit verification that the customer-facing total is `USD 26,690`.

## Completed Production Gaps

- Environment gate script.
- Existing-member role management UI/API.
- Human term review UI/API.
- Evidence candidate attach, approve, reject, and remove workflow.
- Rich finding detail UX.
- Customer-ready report generation and export.
- Additional audit events.
- Period-aware reconciliation.
- Customer/account linking across contracts, invoices, usage, extracted customer names, and document assignment APIs.
- Idempotent extraction/reconciliation reruns with active/superseded output.
- Payment terms mismatch risk detection.
- Evidence approval/export gating for customer-ready reports.
- Scanned PDF/image ingestion strategy and server-side Gemini multimodal path, pending live verification.
- Automated local gate, smoke, and E2E scripts.
- LeakProof Copilot read-only tools, Gemini-assisted explanations, action cards, controlled confirmed workflow execution, advisory finding intelligence, redacted assistant persistence, and final hardening tests/docs.

## Scope Boundaries

Do not add unless explicitly requested:

- Chatbot-first UI.
- Stripe.
- Billing automation.
- Automatic invoice sending.
- Automatic customer emails.
- Chatbot-only replacement of the audit workspace.
- Copilot autonomous approvals or exports.
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
7. Run the mock audit and confirm `USD 26,690`.
8. Perform the manual role, workflow, and Copilot checks in `docs/QA_RUNBOOK.md` and `docs/SECURITY_REVIEW.md`.
