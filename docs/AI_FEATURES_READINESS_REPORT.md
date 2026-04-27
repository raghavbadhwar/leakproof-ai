# AI Features Readiness Report

Date: 2026-04-27

Verdict: Pilot-ready after live setup

This report covers the AI, Copilot, ingest, evidence, analytics, leakage, audit UI, API route, migration, and docs surface requested for final QA. The verdict is conservative: the repo-side gates are green, but production readiness still depends on applying migrations to the target Supabase project and verifying the live deployment with real roles, real Gemini responses, and production data boundaries.

## Executive Status

Status: Pass for local repository readiness.

Pilot readiness: Pilot-ready after live setup.

Production readiness: Not production-ready yet because live Supabase migration state, deployed RLS behavior, live Gemini behavior, and browser QA against the deployed environment were not verified in this local run.

Core AI boundary: Pass.

- LLM explains and suggests.
- Code calculates leakage, report totals, readiness scores, analytics, and exportability.
- Human approval is required for evidence approval, finding approval, customer-ready status, report export workflow, recovery note use, emails, and invoices.

## Features Reviewed

- Shared AI task registry, result envelope, safety checks, prompt rules, and audit event helpers.
- Copilot command routing with read-only explanation mode and human-confirmed pending action cards.
- Data mapping assistant for CSV headers and redacted sample shapes.
- Deterministic audit readiness, missing-data detection, review queue, and next-best-action workflow.
- Evidence quality and false-positive AI review for findings.
- Contract hierarchy resolver for advisory document relationship and conflict review.
- Recovery note draft generator with customer-facing gating.
- CFO summary generator with customer-facing and internal exposure separated.
- Root-cause classifier and workspace prevention recommendations.
- Guided audit UX, review queue, empty states, and report-readiness surfaces.
- Customer-facing report generation and evidence export readiness rules.

## Routes Added Or Covered

AI and Copilot routes:

- `POST /api/findings/[id]/ai-review`
- `POST /api/findings/[id]/recovery-note`
- `POST /api/findings/[id]/root-cause`
- `POST /api/workspaces/[workspaceId]/cfo-summary`
- `POST /api/workspaces/[workspaceId]/contract-hierarchy/resolve`
- `POST /api/workspaces/[workspaceId]/data-mapping/suggest`
- `POST /api/workspaces/[workspaceId]/data-mapping/confirm`
- `GET /api/workspaces/[workspaceId]/readiness`
- `GET /api/workspaces/[workspaceId]/root-causes`
- `POST /api/workspaces/[workspaceId]/copilot`
- `POST /api/workspaces/[workspaceId]/copilot/actions/[actionId]/confirm`
- `POST /api/workspaces/[workspaceId]/copilot/actions/[actionId]/cancel`

AI-adjacent routes covered in QA:

- `POST /api/workspaces/[workspaceId]/report`
- `POST /api/workspaces/[workspaceId]/documents/[documentId]/embed`
- `POST /api/workspaces/[workspaceId]/semantic-search`
- `POST /api/documents/upload`
- `POST /api/extraction/run`
- `POST /api/reconciliation/run`

## Tables Added Or Covered

New AI feature tables:

- `finding_ai_critiques` in `supabase/migrations/008_finding_ai_critiques.sql`
- `assistant_threads` in `supabase/migrations/009_copilot_read_only_assistant.sql`
- `assistant_messages` in `supabase/migrations/009_copilot_read_only_assistant.sql`
- `assistant_actions` in `supabase/migrations/009_copilot_read_only_assistant.sql`
- `assistant_tool_calls` in `supabase/migrations/009_copilot_read_only_assistant.sql`
- `contract_document_relationships` in `supabase/migrations/010_contract_document_relationships.sql`

Existing AI/data infrastructure covered:

- `document_chunks`
- `ai_jobs`
- `embedding_jobs`
- `document_embeddings`
- `semantic_search_logs`
- `extraction_runs`
- `reconciliation_runs`
- `leakage_findings`
- `evidence_items`
- `evidence_candidates`
- `evidence_packs`
- `audit_events`

Migration fix made during QA:

- `assistant_actions.action_type` now allows `prepare_contract_hierarchy_resolution`, matching the Copilot action registry and code path.

## Tests Added Or Covered

AI and safety tests:

- `src/lib/ai/*.test.ts`
- `src/lib/copilot/*.test.ts`
- `src/lib/evidence/aiReview.test.ts`
- `src/lib/evidence/exportReadiness.test.ts`
- `src/lib/evidence/report.test.ts`
- `src/lib/analytics/*.test.ts`
- `src/lib/ingest/csvMapping.test.ts`
- `src/lib/leakage/reconcile.hierarchy.test.ts`

API route tests:

- `src/app/api/findings/[id]/ai-critique/route.test.ts`
- `src/app/api/findings/[id]/ai-review/route.test.ts`
- `src/app/api/findings/[id]/recovery-note/route.test.ts`
- `src/app/api/findings/[id]/root-cause/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/copilot/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/copilot/actions/[actionId]/confirm/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/data-mapping/confirm/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/readiness/route.test.ts`
- `src/app/api/security-routes.test.ts`

Browser smoke coverage:

- `tests/e2e/audit-shell.spec.ts`
- `tests/e2e/public-smoke.spec.ts`

## Safety Verification

LLM explains and suggests: Pass.

- AI modules return advisory summaries, classifications, scores, drafts, checklists, and route/tool suggestions.
- Deterministic modules own leakage amounts, report totals, analytics totals, readiness scores, and exportability.

Code calculates: Pass.

- Leakage amounts remain in reconciliation code and stored finding calculations.
- Reports use deterministic `generateExecutiveAuditReport`.
- Analytics and readiness use deterministic status filters and source rows.
- CFO summaries are overwritten with deterministic report and analytics values.

Human approves: Pass.

- Copilot mutating actions are created as pending action cards.
- Confirm routes re-check role, action status, expiry, blockers, and guarded route behavior.
- Evidence approval, finding status changes, customer-ready movement, report draft generation, recovery note persistence, and hierarchy resolution require reviewer/admin/owner confirmation.

Forbidden AI behavior: Pass.

- AI cannot change leakage amount.
- AI cannot approve findings automatically.
- AI cannot approve evidence automatically.
- AI cannot export reports automatically.
- AI cannot send emails.
- AI cannot create invoices.
- AI cannot fabricate numbers that become authoritative totals.

Important nuance: Copilot can execute some guarded mutations only after a human confirms a pending action card. That is intentional and remains inside the human-approval model.

## Leakage And Reporting Boundary

Customer-facing leakage: Pass.

- Customer-facing statuses are only `approved`, `customer_ready`, and `recovered`.
- Report generation filters to those statuses only.
- CFO summary report-ready totals come from the customer-facing report generator.

Internal exposure: Pass.

- `draft` and `needs_review` findings are labeled as internal pipeline exposure.
- Internal pipeline amounts are shown separately from customer-facing leakage.
- Review queue copy tells the user what needs action next.

Report safety: Pass.

- Draft leakage is excluded from customer-facing reports.
- Needs-review leakage is excluded from customer-facing reports.
- Dismissed and not-recoverable findings are excluded from customer-facing report totals.
- Approved evidence is required for report exportability.
- Evidence queries filter to `approval_state = approved` with reviewer metadata.

Contradiction fixed during QA:

- CFO summary no longer displays dismissed or not-recoverable amounts. It now exposes only dismissed/not-recoverable counts and explicitly says those amounts are excluded from recovery totals.

## Data Safety Verification

Assistant logs: Pass.

- Copilot stores safe summaries, entity references, route/tool refs, and bounded result summaries.
- Copilot assistant tables intentionally do not store raw prompts, source text, invoice contents, embeddings, or full model outputs.

Raw source handling: Pass with one expected boundary.

- Raw documents, chunks, and CSV text may be used server-side by upload, extraction, mapping, evidence, and embedding workflows.
- They are not stored in assistant logs.
- Report evidence stores approved excerpts/citations, not assistant chat logs.

Prompts and outputs: Pass.

- AI routes store prompt versions and validated/safe advisory results where needed.
- Full prompts and full raw model outputs are not persisted in assistant logs.

Embeddings: Pass with expected retrieval storage.

- Embeddings are stored in `document_embeddings` for retrieval.
- Embedding vectors are not stored in assistant logs or Copilot message/tool tables.

Secrets in client: Pass.

- Secret-bearing env access is server-side.
- Search found no `GEMINI_API_KEY`, Supabase service role key, or non-public server env usage in client components.

Contradiction fixed during QA:

- Data mapping prompts no longer include uploaded file names. Mapping prompts use headers and redacted sample shapes instead.

## UX Verification

Status: Pass for local mocked browser smoke.

- Upload page exposes a simple source-document flow and optional customer-list language.
- Overview page shows customer-facing leakage separately from internal pipeline exposure.
- Review queue exists on the findings workflow.
- Guided cards answer what is leaking, what needs review, what is report-ready, and what to do next.
- Reports page labels approved-only customer-facing data.
- Empty chart states do not show fake numbers.
- Copilot UI labels advisory drafts and no-auto-send behavior.

UX fixes made during QA:

- Browser e2e fixture now mocks root-cause analytics so the mocked production workflow does not show a fake unmocked-route error banner.
- Browser assertion now checks the "What is leaking" guided card on the overview page where it actually renders.

## Commands Run

| Command | Status | Result |
| --- | --- | --- |
| `pnpm exec vitest run src/lib/ai src/lib/copilot src/lib/evidence src/lib/analytics src/lib/ingest src/lib/leakage src/app/api/findings src/app/api/workspaces src/app/api/security-routes.test.ts` | Pass | 48 test files passed, 216 tests passed |
| `pnpm test` | Pass | 70 passed, 1 skipped; 303 tests passed, 1 skipped, 5 todo |
| `pnpm typecheck` | Pass | TypeScript completed with no errors |
| `pnpm lint` | Pass | ESLint completed with no errors |
| `pnpm build` | Pass | Next.js production build completed |
| `pnpm env:check` | Pass | Required variables present: 9; optional variables present: 0/1; embedding dimension: 1536 |
| `pnpm test:e2e` | Pass | Webpack build plus Playwright browser smoke passed; 5 tests passed |

Browser gate note:

- The first `pnpm test:e2e` run caught a real route-module export blocker and a stale mocked UX assertion. Both were fixed, and the final rerun passed.

## Fixed During Final QA

- Removed invalid `export` from the AI review route's internal prompt-version constant so the stricter Next.js webpack route build passes.
- Removed dismissed/not-recoverable amount display from CFO summaries.
- Aligned the Copilot `assistant_actions.action_type` migration constraint with the contract hierarchy action type used by code.
- Removed uploaded file name from AI data-mapping prompts.
- Updated the browser e2e fixture to cover root-cause analytics and assert the guided overview card in the correct route.

## Remaining Risks

- Live Gemini responses were not tested against production data in this run; local tests validate schemas, guardrails, fallbacks, and integration boundaries.
- Supabase migrations were not applied to the target production project in this run.
- Production RLS behavior was not re-verified with real deployed users and roles.
- Recovery note persistence is optional because the route only stores drafts if a `recovery_note_drafts` table exists; the current migration set does not add that table.
- The current local env check passes, but optional production env coverage is incomplete: optional variables present `0/1`.
- No real customer data, real invoices, real contracts, or real report export workflow were exercised in production.

## Production Blockers

- Apply and verify migrations `008`, `009`, and `010` in the target Supabase project.
- Run deployed smoke tests with owner, admin, reviewer, member, and viewer roles.
- Run a live Gemini smoke on sanitized pilot data and confirm schema validation, fallback behavior, and audit logging.
- Verify report export on real approved findings with approved evidence.
- Verify no external email or invoice connector is wired to AI actions before pilot use.
- Confirm observability and audit-log access for Copilot action creation, confirmation, execution, and failure paths.

## Pilot Readiness Verdict

Final verdict: Pilot-ready after live setup.

Reasoning:

- The repo-side AI safety model is coherent.
- Required local gates pass.
- Browser smoke passes.
- Customer-facing leakage and report boundaries are enforced in code and tests.
- The remaining blockers are live setup and production verification, not broad repo defects.

This is not a Production-ready verdict.
