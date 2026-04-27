# LeakProof Copilot

## Phase 8 Scope

Copilot is a right-side assistant over the audit workspace with a server-side context layer, Gemini-assisted read-only answers, action cards, controlled workflow execution for confirmed actions, advisory finding intelligence, and final hardening tests/docs. Gemini may explain read-only tool output and suggest actions, but it never executes mutations directly.

Product boundary:

- LLM explains and suggests.
- Code calculates.
- Human approves.

Finding intelligence is a trust layer, not an automation layer. Copilot can route users to data mapping, missing-data detection, audit readiness, next-best-action guidance, evidence quality review, false-positive review, contract hierarchy resolution, recovery note drafts, CFO summaries, root-cause classification, and prevention recommendations. It cannot change finding amounts, change finding status, approve evidence, mark customer-ready, export reports, send email, create invoices, delete documents, or change roles.

Confirmed actions execute only through existing API routes/helpers and re-check auth, role, workspace scope, blockers, evidence gates, report rules, and audit logging before any mutation.

## API

`POST /api/workspaces/[workspaceId]/copilot`

Request:

```json
{
  "organization_id": "uuid",
  "thread_id": "uuid optional",
  "message": "What is the total leakage?",
  "selected_finding_id": "uuid optional",
  "selected_report_id": "uuid optional",
  "mode": "read_only"
}
```

The route requires bearer-token auth, verifies organization membership, verifies that the workspace belongs to the organization, and uses the Supabase service client only on the server.

Action state routes:

- `POST /api/workspaces/[workspaceId]/copilot/actions/[actionId]/confirm`
- `POST /api/workspaces/[workspaceId]/copilot/actions/[actionId]/cancel`

Both routes require bearer-token auth, verify organization membership, verify workspace ownership, verify the action belongs to the same organization/workspace, re-check the required role, and only operate on pending actions.

In the final implementation, the confirm route:

1. Marks the pending action `confirmed`.
2. Writes `copilot.action_confirmed`.
3. Re-checks role, workspace scope, action scope, blockers, and expiry.
4. Executes supported workflow actions through existing guarded routes/helpers.
5. Marks the action `executed` or `failed`.
6. Stores only a safe result summary and entity references.
7. Writes `copilot.action_executed` or `copilot.action_failed`.

## Read-Only Flow

1. Parse and validate the request.
2. Resolve workspace, organization, user, and role through existing auth helpers.
3. Route the message to read-only tools with simple keyword matching.
4. Fetch safe structured context through existing database helpers.
5. Redact tool outputs and entity references before model use.
6. Call Gemini server-side with a strict finance-audit prompt.
7. Validate Gemini JSON with `copilotResponseSchema`.
8. Replace response `data` with canonical tool output from the server.
9. Reject ungrounded numeric claims and fall back to deterministic prose.
10. Store only safe summaries, entity references, tool-call summaries, and safe errors.

## Action Framework

Allowed pending and executable action types:

- `prepare_run_extraction`
- `prepare_run_reconciliation`
- `prepare_search_evidence`
- `prepare_attach_evidence_candidate`
- `prepare_generate_report_draft`
- `prepare_update_finding_status`
- `prepare_approve_evidence`
- `prepare_assign_reviewer`
- `prepare_recovery_note`
- `prepare_contract_hierarchy_resolution`

Statuses are `pending`, `confirmed`, `executed`, `cancelled`, `failed`, and `expired`. Risk levels are `low`, `medium`, `high`, and `critical`.

Action cards include title, description, risk level, required role, status, target entity reference, what will change, blockers, Confirm, Cancel, and a safe result summary after execution or failure. Viewer/member roles cannot create, confirm, or execute mutation actions. Reviewer can prepare, confirm, and execute review workflow actions. Owner/admin can prepare broader actions, including reviewer assignment. `prepare_assign_reviewer` requires owner/admin.

Confirming an action writes `copilot.action_confirmed`, marks the action `confirmed`, then executes supported workflows. Cancelling writes `copilot.action_cancelled` and marks it `cancelled`.

## Controlled Execution

Supported controlled execution:

- `prepare_run_extraction`: requires `source_document_id`, reviewer/admin/owner role, a contract source document in the same workspace, and then calls the existing extraction workflow.
- `prepare_run_reconciliation`: requires reviewer/admin/owner role and calls the existing reconciliation workflow without changing finance formulas.
- `prepare_search_evidence`: read-only search. It can execute without changing audit data.
- `prepare_attach_evidence_candidate`: requires reviewer/admin/owner role, verifies the finding and document chunk belong to the same workspace, then attaches the candidate through the existing evidence model.
- `prepare_approve_evidence`: high risk. It verifies evidence exists, belongs to the workspace, is attached to the finding, is not rejected, and the actor role is allowed before approval.
- `prepare_update_finding_status`: high risk for `approved`, `customer_ready`, and `recovered`. It uses existing status-transition validation and blocks money findings without approved evidence.
- `prepare_assign_reviewer`: owner/admin only. It verifies the assignee belongs to the organization with a reviewer/admin/owner role before assignment.
- `prepare_generate_report_draft`: requires reviewer/admin/owner role and uses existing report generation rules. Draft and `needs_review` findings remain excluded from customer-facing reports; approved evidence rules remain unchanged.
- `prepare_recovery_note`: requires reviewer/admin/owner role and calls the existing recovery-note route after confirmation. The route may persist a draft if the optional draft table exists, but it never sends email, creates invoices, or exports reports.
- `prepare_contract_hierarchy_resolution`: requires reviewer/admin/owner role and calls the existing contract hierarchy resolver after confirmation. It may refresh safe relationship rows and mark non-approved conflicts for review, but approved terms are not auto-approved, replaced, or used to calculate leakage without human review.

Forbidden or prepare-only execution:

- `exportReport`: remains critical risk and is not executed by Copilot in Phase 6.
- `sendEmail`: forbidden.
- `createInvoice`: forbidden.
- `deleteDocument`: forbidden.
- `changeRole`: forbidden.
- Gemini-triggered mutation execution: forbidden.

## Prompt Rules

The system prompt identifies Gemini as LeakProof Copilot, a finance audit assistant. It requires Gemini to use only provided tool context, avoid invented numbers, distinguish customer-facing leakage from internal unapproved exposure, avoid legal advice, avoid approvals, avoid calculation changes, avoid sending emails or creating invoices, and say what is missing when context is insufficient.

Customer-facing leakage is strictly `approved`, `customer_ready`, and `recovered`. `draft` and `needs_review` are internal pipeline exposure and must not be combined into customer-facing totals.

## Shared AI Foundation

Future Copilot AI features should register their task type in `src/lib/ai/tasks.ts`, validate output with `src/lib/ai/resultSchema.ts`, apply redaction and raw-source checks from `src/lib/ai/safety.ts`, reuse `src/lib/ai/promptRules.ts`, and record only safe AI audit metadata through `src/lib/audit/aiEvents.ts`.

These shared modules do not execute individual AI features by themselves. They define the reusable safety boundary for later tasks: advisory output only, deterministic money from code, human approval before any mutation or customer-facing action.

## Read-Only Tools

- `getWorkspaceSummary`
- `getAnalyticsSummary`
- `getFindings`
- `getFindingDetail`
- `checkReportReadiness`
- `detectMissingData`
- `dataMappingAssistant`
- `missingDataDetector`
- `auditReadinessScore`
- `nextBestAction`
- `prepareCfoSummaryData`
- `explainFindingFormulaDeterministic`
- `evidenceQualityReview`
- `evidenceQualityScorer`
- `falsePositiveRiskCheck`
- `falsePositiveCritic`
- `reviewerChecklist`
- `prepareCfoSummary`
- `cfoSummaryGenerator`
- `prepareRecoveryNote`
- `recoveryNoteGenerator`
- `contractHierarchyResolver`
- `rootCauseClassifier`
- `preventionRecommendations`

Gemini may explain these outputs, but it does not calculate leakage amounts. Amounts returned to the UI come from tool output.

Feature-specific Copilot commands:

- “Map this CSV” or “Map uploaded CSV” routes to the data mapping assistant. Copilot does not invent a mapping if CSV headers and safe sample shapes are missing.
- “What data is missing?” routes to missing-data detection.
- “Is the audit ready?” routes to deterministic audit readiness scoring.
- “What should I do next?” routes to deterministic next-best-action guidance.
- “Check evidence quality” routes to the evidence quality scorer for the selected finding.
- “Check false positives” routes to the false-positive critic for the selected finding.
- “Resolve contract hierarchy” prepares a confirmation-gated action for the existing contract hierarchy resolver.
- “Draft recovery note” prepares advisory draft content and a confirmation-gated action before persistence.
- “Prepare CFO summary” routes to the CFO summary generator with customer-facing and internal exposure kept separate.
- “Why did this leakage happen?” routes to root-cause classification for the selected finding.
- “Show prevention recommendations” routes to workspace root-cause analytics and prevention recommendations.

## Finding Intelligence

Phase 7 adds advisory tools for selected findings:

- `evidenceQualityReview`: checks whether approved contract, invoice, usage, and calculation evidence support the formula. Returns strong evidence, weak evidence, conflicting evidence, and missing-evidence gaps.
- `falsePositiveRiskCheck`: flags amendment conflicts, missing invoice period, possible credit notes, discount extensions, billing-cycle mismatch, annual true-up possibility, usage billed later, one-time versus recurring confusion, customer-specific exceptions, and missing required evidence.
- `reviewerChecklist`: lists what to verify before approval, what evidence is required, and what would block customer-ready status.
- `prepareCfoSummary`: prepares safe structured CFO summary data with customer-facing leakage separated from internal unapproved exposure.
- `prepareRecoveryNote`: drafts internal and customer-facing recovery-note text with contract basis, invoice/usage basis, calculation summary, and human-review disclaimer.

All finding intelligence outputs include advisory-only semantics. Recovery notes are drafts only, avoid legal threats and legal conclusions, and are never auto-sent.

Contextual finding prompts in the Copilot panel:

- Explain this finding.
- Explain formula.
- Review evidence quality.
- Check false positives.
- Why did this leakage happen?
- Draft reviewer checklist.
- Draft recovery note.

Workspace prompts in the Copilot panel:

- Map uploaded CSV.
- Find missing data.
- Check report readiness.
- What should I do next?
- Prepare CFO summary.
- Explain root causes.

## Security Model

- Every tool validates organization and workspace scope.
- Tool outputs are redacted before model use and before returning to the UI.
- The context loader never selects raw document chunk content, full contract text, invoice line items, storage paths, embeddings, prompts, or model outputs.
- Assistant message logs store only safe summaries and entity references.
- Tool-call logs store tool names, status, safe input summaries, safe output summaries, and safe error summaries.
- Raw user prompts, full Gemini prompts, full model responses, raw contract text, invoice contents, embeddings, secrets, tokens, and customer PII are not stored.
- Suggested mutating actions must be marked `requiresConfirmation: true` with medium, high, or critical risk. Execution occurs only after the confirmation endpoint re-checks permissions and blockers.
- Assistant action payloads and previews store only entity references, enum values, safe labels, blockers, and deterministic status metadata.
- Confirmation and cancellation routes re-check auth, workspace scope, action scope, role, pending status, and expiry before updating state.
- Action execution stores only safe result summaries, result references, and redacted failure codes. Raw source text, invoice rows, prompts, and model outputs are never stored in action results.
- Finding intelligence prompts include only compact tool context and entity references, not full contracts, invoice rows, usage rows, raw prompts, embeddings, or raw model output.
- Finding intelligence cannot mutate finding amount, finding status, evidence approval state, report state, or customer communications.
- Assistant tables are server-written only. RLS allows scoped reads, but browser clients cannot directly insert or update assistant threads, messages, actions, or tool calls.

## Persistence

Copilot uses:

- `assistant_threads`
- `assistant_messages`
- `assistant_actions`
- `assistant_tool_calls`

`assistant_tool_calls` includes a safe `error_summary` field for failed Gemini generation or validation. `assistant_actions` stores pending action proposals, confirmation state, execution status, safe result summaries, safe result references, and redacted failure codes.

## Fallback

If Gemini is unavailable, returns invalid JSON, fails schema validation, or includes ungrounded numeric claims, the route returns a deterministic fallback answer. The raw Gemini output is never returned or stored.

## Role Behavior

- `viewer` and `member`: read-only Copilot questions only. They cannot create, confirm, cancel for mutation, or execute action cards.
- `reviewer`: can prepare and confirm review workflow actions such as extraction, reconciliation, evidence work, finding status review, and report drafts, subject to blockers.
- `admin` and `owner`: can do reviewer actions and broader actions such as reviewer assignment, subject to existing role policy.
- All roles: Copilot answers are advisory unless an explicit confirmed action flow runs through an existing guarded workflow.

## Testing Commands

Final local gate:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm env:check
```

Targeted Copilot checks:

```bash
pnpm test src/lib/copilot
pnpm test src/lib/evidence
```

Optional live/runtime checks when env and server are available:

```bash
pnpm test:e2e
pnpm start
APP_URL=http://localhost:3000 pnpm smoke
```

## Known Limitations

- Report export from Copilot remains intentionally disabled.
- Email sending, invoice creation, document deletion, role changes, and customer communications remain forbidden.
- Live Gemini quality, deployed Supabase RLS behavior, Vercel env wiring, and role-persona browser QA still require a real production-like environment.
- Recovery notes are drafts only and must be reviewed by a human before any external use.
- Copilot is not legal advice and does not make legal conclusions.

## Deferred

- Report export from Copilot.
- Role changes, document deletion, email sending, and invoice creation.
- Any autonomous approval or status change that bypasses explicit human confirmation.
