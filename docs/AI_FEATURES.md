# LeakProof AI Features

LeakProof AI uses AI as an advisory layer over deterministic finance and evidence workflows.

Product principle:

- LLM explains and suggests.
- Code calculates.
- Human approves.

## Shared Safety Rules

- AI must not fabricate financial values, contract terms, invoice rows, usage rows, customers, or evidence.
- AI must not calculate final leakage amounts. Deterministic reconciliation outputs are the source of truth for money.
- AI must not approve findings, approve evidence, mark findings customer-ready, export reports, send emails, or create invoices automatically.
- AI must distinguish customer-facing leakage from internal unapproved exposure.
- Customer-facing leakage includes only approved, customer_ready, and recovered findings.
- Draft and needs_review findings remain internal pipeline exposure.
- AI must not provide legal advice, legal conclusions, legal threats, or jurisdiction-specific legal interpretation.
- Server-side code must keep Supabase service-role keys and Gemini API keys out of client code.
- AI logs and audit metadata must not store raw contracts, raw invoices, raw usage rows, embeddings, prompts, full model outputs, secrets, tokens, or customer PII beyond safe labels.

## Human Approval Model

AI output can be shown as advisory review material or a draft. It can create pending action suggestions only when the task registry permits it. Any mutation still has to run through existing guarded routes and role checks.

Humans remain responsible for:

- approving extracted terms,
- approving evidence,
- approving or dismissing findings,
- marking findings customer-ready,
- exporting customer-facing reports,
- sending recovery notes or emails,
- creating invoices.

## Task Registry

Shared task definitions live in `src/lib/ai/tasks.ts`. Every task declares safe input references, forbidden data, output schema, read-only behavior, pending-action capability, and required role.

Registered task types:

- `data_mapping`
- `missing_data_detection`
- `audit_readiness`
- `evidence_quality_review`
- `false_positive_review`
- `contract_hierarchy_resolution`
- `recovery_note_draft`
- `cfo_summary_draft`
- `root_cause_classification`
- `next_best_action`
- `reviewer_checklist`

All tasks use the shared result envelope in `src/lib/ai/resultSchema.ts`.

## Copilot Integration

LeakProof Copilot exposes the AI features as a command layer. Copilot routes user requests to feature-specific tools and route metadata instead of rebuilding feature logic inside the chat layer.

Supported Copilot commands:

- “Map this CSV” / “Map uploaded CSV” -> data mapping assistant.
- “What data is missing?” / “Find missing data” -> missing-data detector.
- “Is the audit ready?” -> audit readiness score.
- “What should I do next?” -> next best action.
- “Check evidence quality” / “Review evidence quality” -> evidence quality scorer for a selected finding.
- “Check false positives” -> false-positive critic for a selected finding.
- “Resolve contract hierarchy” -> confirmation-gated contract hierarchy resolver.
- “Draft recovery note” -> advisory recovery-note preview plus confirmation-gated persistence.
- “Prepare CFO summary” -> CFO summary generator with customer-facing and internal exposure separated.
- “Why did this leakage happen?” -> finding-level root-cause classifier.
- “Show prevention recommendations” / “Explain root causes” -> workspace root-cause analytics and prevention recommendations.

Copilot execution rules:

- Read-only analysis can run directly from existing deterministic feature helpers.
- Routes that persist drafts, critiques, relationships, report rows, approvals, or status changes require pending action cards and role re-checks.
- Viewer and member roles remain read-only. Reviewer, admin, and owner actions still use existing workspace and role checks.
- Customer-facing summaries and reports preserve `approved`, `customer_ready`, `recovered`, approved-evidence, and report-readiness rules.
- Copilot stores only safe summaries, route/tool references, and redacted output references. It does not store raw source text, prompts, full model output, embeddings, secrets, tokens, or customer PII.

## What AI Can Do

- Explain deterministic outputs in plain language.
- Identify missing safe references and review blockers.
- Critique evidence quality.
- Flag false-positive risks.
- Draft reviewer checklists.
- Draft internal recovery notes for human review.
- Draft CFO summaries that keep customer-facing and internal exposure separate.
- Suggest next actions that require human confirmation before any mutation.

## AI Data Mapping Assistant

The data mapping assistant helps reviewers upload messy invoice, usage, and customer CSV exports. It suggests how uploaded headers such as `Client`, `Bill Date`, `Total`, `Users`, `Usage Qty`, `Product`, `ARR`, and `Due Date` map to LeakProof canonical fields.

Guardrails:

- Gemini may suggest column mappings, confidence, missing fields, warnings, and a safe preview only.
- If Gemini is unavailable or returns invalid JSON, deterministic fuzzy matching is used.
- Confirmed mappings are validated with strict schemas before parsing.
- LeakProof does not fabricate missing required fields; missing amount or customer identifiers block confirmation.
- Existing deterministic CSV parsers still validate dates, money, quantities, and required fields.
- AI mapping does not approve evidence, approve findings, mark anything customer-ready, export reports, send email, or create invoices.
- Raw CSV values are not stored in AI logs or prompts; mapping prompts use headers plus redacted sample value shapes.

## Guided Audit UX and Review Queue

The guided audit home and review queue are deterministic UX surfaces. They do not ask AI to calculate leakage or approve workflow states.

What the UX shows:

- customer-facing approved leakage from `approved`, `customer_ready`, and `recovered` findings only,
- internal unapproved exposure from `draft` and `needs_review` findings only,
- deterministic audit readiness blockers,
- one next-best-action CTA,
- review queue items for pending terms, findings, evidence candidates, report blockers, low-confidence terms, and unassigned documents.

The queue is sorted by amount impact, evidence strength, false-positive risk, age, and priority. Amount impact comes only from existing deterministic finding rows; terms, documents, and blockers without a deterministic finding amount show no amount instead of placeholder money.

Progressive disclosure keeps the default finding view plain-English:

- What happened
- Why it matters
- What to check
- Recommended next step

Advanced details expose formula, citations, raw calculation inputs, and audit trail for finance reviewers.

## Contract Hierarchy Resolver

The contract hierarchy resolver helps reviewers decide which document controls when a customer has multiple contract documents, such as an MSA, order form, renewal order, amendment, side letter, pricing schedule, or discount approval.

Guardrails:

- Route: `POST /api/workspaces/[workspaceId]/contract-hierarchy/resolve`.
- Required role: owner, admin, or reviewer.
- Gemini may classify document roles, suggest document relationships, identify controlling-term candidates, and produce a reviewer checklist.
- Gemini output is validated with strict Zod schemas in `src/lib/ai/contractHierarchy.ts`.
- The resolver does not approve, edit, replace, or reject approved terms.
- The resolver does not calculate leakage or create recoverable leakage findings.
- Non-approved conflicting terms may be marked `needs_review`; approved and edited terms are left unchanged for a human reviewer.
- Relationship persistence stores only safe document IDs, relationship type, effective date, confidence, and citation labels. It does not store raw contracts, prompts, full Gemini output, embeddings, secrets, tokens, or customer PII.
- Deterministic reconciliation refuses ambiguous conflicting approved terms and surfaces a zero-dollar `amendment_conflict` risk instead of creating recoverable leakage from an unresolved hierarchy.

Reviewer workflow:

1. Open the Contract Hierarchy view.
2. Select the customer account.
3. Run hierarchy resolution after extraction.
4. Review the document timeline, controlling-term recommendations, conflicts, unresolved items, and checklist.
5. Manually approve, edit, or reject terms before relying on reconciliation or customer-ready reports.

## Recovery Note Generator

The recovery note generator drafts internal reviewer notes and, only when safe, customer-facing reconciliation language for an approved finding.

Guardrails:

- Route: `POST /api/findings/[id]/recovery-note`.
- Required role: owner, admin, or reviewer.
- Draft and needs-review findings only receive an internal note.
- Customer-facing drafts require an approved/customer-ready/recovered finding plus report-ready approved evidence.
- Money language uses the stored deterministic finding amount and stored calculation summary only.
- The schema rejects or replaces aggressive legal language, threats, legal conclusions, auto-send behavior, invoice creation, and report export claims.
- If Gemini fails or returns invalid JSON, LeakProof returns a deterministic safe fallback.
- The route stores a safe draft only if an optional `recovery_note_drafts` table exists; otherwise it returns the draft without persistence.

Human still approves whether any draft is used externally.

## CFO Summary Generator

The CFO summary generator drafts an advisory executive narrative from analytics and report data.

Guardrails:

- Route: `POST /api/workspaces/[workspaceId]/cfo-summary`.
- Required role: owner, admin, or reviewer.
- Customer-facing leakage, internal unapproved exposure, dismissed/not recoverable counts, and risk-only items are separated in the schema.
- Report-ready totals come from `generateExecutiveAuditReport`; internal exposure comes from workspace analytics.
- Dismissed and not-recoverable amounts are excluded and are not displayed as recovery totals.
- AI cannot invent totals. Guardrails overwrite money fields with deterministic report and analytics values.
- If Gemini fails or returns invalid JSON, LeakProof returns a deterministic safe fallback.
- The route does not export reports, send email, create invoices, or mark anything customer-ready.

## Root Cause Classifier And Prevention Recommendations

The root-cause classifier explains why a deterministic leakage finding likely happened and suggests operational controls to prevent recurrence.

Routes:

- `POST /api/findings/:id/root-cause` returns advisory finding-level root-cause output.
- `GET /api/workspaces/:workspaceId/root-causes` returns workspace-level root-cause analytics.

Guardrails:

- Root-cause output is validated by `src/lib/ai/rootCauseSchema.ts`.
- The classifier never changes finding amount, status, evidence approval, customer-ready state, report state, emails, or invoices.
- Deterministic reconciliation remains the source of truth for leakage amounts.
- Finding-level prompts use safe finding metadata, calculation field names, and approved evidence labels only.
- Workspace analytics uses deterministic classification and keeps customer-facing amounts separate from draft and needs-review internal exposure.
- Root-cause audit metadata stores safe task summaries and entity references only; it does not store raw evidence, prompts, full Gemini output, secrets, tokens, or customer PII.

Taxonomy:

- `expired_discount_not_removed`
- `annual_uplift_not_configured`
- `usage_overage_not_billed`
- `seat_count_not_synced`
- `minimum_commitment_not_monitored`
- `amendment_not_reflected`
- `contract_term_not_visible`
- `manual_invoice_error`
- `customer_master_data_mismatch`
- `missing_usage_feed`
- `renewal_notice_missed`
- `payment_terms_setup_error`
- `unclear_contract_language`
- `unknown`

## Audit Readiness, Missing Data, And Next Best Action

The audit readiness engine lives in `src/lib/ai/auditReadiness.ts`. It is deterministic and read-only. It does not calculate leakage, approve evidence, approve findings, mark anything customer-ready, export reports, send email, or create invoices.

What it checks:

- contracts, invoice CSVs, usage CSVs, and optional customer CSVs,
- customer assignment on contracts, invoice rows, usage rows, terms, and findings,
- extracted terms, approved terms, and low-confidence terms,
- generated findings and findings still needing human review,
- evidence candidates and reviewer-approved evidence,
- existing customer-facing report blockers from the report/export rules.

The API is:

- `GET /api/workspaces/[workspaceId]/readiness?organization_id=...`

The route requires authentication, checks workspace membership, loads workspace-scoped rows server-side, and returns only safe IDs, counts, labels, blockers, warnings, and deep links. It does not call Gemini for scoring. If Gemini is added later, it may only phrase the next-best-action explanation after deterministic scoring has already been produced.

Output includes:

- `readinessScore` from `0` to `100`,
- `readinessLabel`,
- missing-data items grouped into blocker or warning severity,
- one deterministic `nextBestAction`,
- secondary actions for the review queue.

The dashboard card shows the score, phase, blockers, and a “Fix N blockers” shortcut. Deep links point reviewers to uploads, contracts, findings, evidence, revenue records, or reports.

## Evidence Quality And False-Positive Review

The finding AI review endpoint is `POST /api/findings/[id]/ai-review`. It accepts `organization_id`, `workspace_id`, and `review_type` of `evidence_quality`, `false_positive`, or `both`.

What it does:

- Scores evidence quality using strict schemas in `src/lib/ai/evidenceQualitySchema.ts`.
- Flags false-positive risks using strict schemas in `src/lib/ai/falsePositiveSchema.ts`.
- Uses deterministic guardrails in `src/lib/evidence/aiReview.ts` for required contract evidence, invoice or usage evidence, formula support, amendment conflicts, credit-note signals, period mismatch, wrong customer match, missing usage data, duplicate invoices, currency mismatch, and one-time versus recurring confusion.
- Stores only the safe advisory review result in `finding_ai_critiques`.

What it does not do:

- It does not change `estimated_amount_minor`, `calculation`, or any reconciliation formula.
- It does not approve evidence or findings.
- It does not mark findings customer-ready.
- It does not export reports, send emails, or create invoices.
- It does not store prompts, raw source text, raw invoices, raw contracts, embeddings, full Gemini outputs, secrets, tokens, or customer PII in the saved review.

## What AI Cannot Do

- Calculate final leakage.
- Override reconciliation rules.
- Approve terms, evidence, findings, reports, exports, emails, or invoices.
- Mark anything customer-ready.
- Export reports.
- Send external communications.
- Create invoices.
- Store raw source text, raw model output, prompts, embeddings, secrets, tokens, or customer PII in logs.
- Give legal advice.

## Shared Modules

- `src/lib/ai/taskTypes.ts`: canonical AI task and safe entity reference types.
- `src/lib/ai/tasks.ts`: AI task registry.
- `src/lib/ai/resultSchema.ts`: common strict Zod result envelope.
- `src/lib/ai/safety.ts`: redaction, secret checks, raw source checks, safe excerpts, and safe entity references.
- `src/lib/ai/promptRules.ts`: shared prompt rules for future AI features.
- `src/lib/audit/aiEvents.ts`: safe AI audit event builders.

## Implementation Order

1. Shared AI foundation, task registry, safety helpers, audit event builders, result schema, prompt rules, docs, and tests.
2. Route-level integration for a single AI task using existing organization, workspace, role, RLS, and audit checks.
3. UX for advisory output with explicit human review states.
4. Controlled pending actions through existing guarded routes only.
5. Production QA for logs, audit metadata, auth boundaries, role behavior, and finance totals.
