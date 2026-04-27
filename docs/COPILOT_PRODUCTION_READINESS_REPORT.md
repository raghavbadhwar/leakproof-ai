# Copilot Production Readiness Report

## 1. Executive Summary

LeakProof Copilot is repo-side ready for local demo with mock data and ready for a controlled pilot after live Supabase, Gemini, Vercel, role-persona QA, and deployed smoke setup are completed.

Copilot follows the product principle:

- LLM explains and suggests.
- Code calculates.
- Human approves.

The implementation keeps Copilot as a right-side assistant and command layer over the audit workspace. It does not replace the structured audit workspace and does not independently calculate financial values.

## 2. What Was Built

- Right-side Copilot panel with suggested prompts, answer cards, citations, action cards, and responsive drawer behavior.
- Server-side read-only Copilot context layer and tool registry.
- Gemini-assisted read-only explanations with strict schema validation and deterministic fallback.
- Pending action cards with role, risk, blockers, confirm, and cancel states.
- Controlled execution for supported confirmed actions through existing guarded workflow routes/helpers.
- Advisory finding intelligence for evidence quality, false-positive risk, reviewer checklists, CFO summaries, and recovery-note drafts.
- Sanitized assistant persistence using safe summaries, entity references, input/output refs, result summaries, and redacted errors only.

## 3. Routes Added

- `POST /api/workspaces/[workspaceId]/copilot`
- `POST /api/workspaces/[workspaceId]/copilot/actions/[actionId]/confirm`
- `POST /api/workspaces/[workspaceId]/copilot/actions/[actionId]/cancel`

All Copilot routes require bearer-token auth, verify organization membership, verify workspace scope, and use the Supabase service client only server-side.

## 4. Tables Added

Migration: `supabase/migrations/009_copilot_read_only_assistant.sql`

- `assistant_threads`
- `assistant_messages`
- `assistant_actions`
- `assistant_tool_calls`

Assistant tables are scoped by `organization_id` and `workspace_id`, have RLS enabled, and allow scoped reads only for browser clients. Writes are performed by server routes after sanitization. The schema intentionally avoids raw prompt, raw content, contract text, invoice contents, embeddings, model output, and email-body columns.

## 5. Tools Added

Read-only tools:

- `getWorkspaceSummary`
- `getAnalyticsSummary`
- `getFindings`
- `getFindingDetail`
- `checkReportReadiness`
- `detectMissingData`
- `prepareCfoSummaryData`
- `explainFindingFormulaDeterministic`

Advisory finding intelligence:

- `evidenceQualityReview`
- `falsePositiveRiskCheck`
- `reviewerChecklist`
- `prepareCfoSummary`
- `prepareRecoveryNote`

## 6. Actions Added

Pending action types:

- `prepare_run_extraction`
- `prepare_run_reconciliation`
- `prepare_search_evidence`
- `prepare_attach_evidence_candidate`
- `prepare_generate_report_draft`
- `prepare_update_finding_status`
- `prepare_approve_evidence`
- `prepare_assign_reviewer`
- `prepare_recovery_note`

Supported confirmed execution:

- Run extraction through the existing extraction route.
- Run reconciliation through the existing reconciliation route.
- Search evidence read-only.
- Attach evidence candidates after workspace/finding/chunk checks.
- Approve evidence after workspace/finding/evidence checks.
- Update finding status after existing transition and evidence gates.
- Assign reviewers subject to existing role policy.
- Generate report drafts through existing report rules.

Forbidden or prepare-only:

- Report export from Copilot.
- Send email.
- Create invoice.
- Delete document.
- Change role.
- Gemini-triggered mutation.
- Any autonomous approval or customer-ready transition.

## 7. Security Controls

- No Gemini key in client code.
- No Supabase service-role key in client code.
- Gemini calls are server-side only.
- Assistant messages store safe summaries, not raw prompts.
- Tool-call logs store refs/summaries, not raw contracts, invoice rows, embeddings, or model output.
- Audit metadata is redacted recursively.
- Copilot routes require auth before service-client work.
- Workspace access goes through existing org/workspace membership helpers.
- Viewer/member roles cannot create, confirm, or execute mutation actions.
- Action confirmation re-checks role, pending status, expiry, workspace/org scope, and blockers.
- Controlled action execution calls existing guarded APIs/helpers.
- Copilot cannot bypass evidence approval rules.
- Copilot cannot bypass report rules.
- Customer-facing leakage remains approved/customer_ready/recovered only.
- Draft and needs_review findings remain internal pipeline exposure.

## 8. Tests Added

Copilot hardening coverage now includes:

- Schema validation for read-only mode, intelligence schemas, recovery-note draft-only behavior, and CFO separation.
- Redaction tests for raw prompts, source content, embeddings, model output, and entity references.
- Read-only tool tests for analytics separation, tenant/workspace scoping, finding detail refs, report readiness, missing data, and routing.
- Permission/action tests for viewer rejection, reviewer/admin/owner behavior, confirmation re-checks, execution gates, failure redaction, and no unsafe recovery-note action creation.
- Gemini fallback tests for invalid output, ungrounded numeric claims, prompt redaction, and suggested action safety.
- Assistant persistence tests for no raw-sensitive columns and no direct browser write RLS policies.
- Evidence/report tests preserving approved-evidence and customer-facing report rules.

## 9. Commands Run

Required:

- `pnpm test` passed: 45 test files passed, 1 skipped; 216 tests passed, 1 skipped, 5 todo.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm env:check` passed with current environment; it reported required variables present and embedding dimension `1536` without printing secret values.

Additional:

- `pnpm test src/lib/copilot` passed: 7 files, 51 tests.
- `pnpm test src/lib/evidence` passed: 4 files, 22 tests.
- `pnpm test:e2e` passed: 5 Playwright tests.
- `APP_URL=http://localhost:3000 pnpm smoke` passed: app route `200`, health route `200`, analytics auth guard `401`.
- Post-build `pnpm typecheck` passed.

## 10. Known Limitations

- Live Gemini quality is not proven by unit tests; mocks verify schema/fallback behavior.
- Live Supabase RLS/persona behavior still needs a production-like project and real users.
- Copilot report export remains intentionally disabled.
- Recovery notes are drafts only and require human review before external use.
- Copilot does not provide legal advice or legal conclusions.
- Long-running extraction/reconciliation/report generation still runs through request-driven routes; production scale should use queue-backed jobs.
- The UI was verified by build/e2e/smoke, but not by a manual screenshot pass in this phase.

## 11. Pilot Readiness Verdict

- Safe for local demo with mock data: yes.
- Safe for a controlled pilot after live setup: yes, after the remaining live setup requirements below pass.
- Production-ready for broad customer use: not yet.

## 12. Remaining Live Setup Requirements

- Apply migrations to a dedicated Supabase project.
- Configure Supabase Auth redirects and production RLS policies.
- Configure Vercel server env vars for Supabase service role and Gemini.
- Run `pnpm env:check` against production-like values.
- Deploy to Vercel and run deployed smoke.
- Run owner/admin/reviewer/member/viewer persona QA.
- Run mock audit with `sample-data/mock-pilot` and confirm expected customer-facing total `USD 26,690`.
- Verify live Gemini extraction, embeddings, scanned PDF/image behavior, and Copilot Gemini explanations with representative non-customer fixtures.
- Confirm no raw contracts, invoice rows, prompts, embeddings, model outputs, secrets, or customer PII appear in logs, assistant tables, audit metadata, screenshots, or exported artifacts.
