# LeakProof Copilot Implementation Plan

Phase 0 status: reconnaissance and plan only. Do not treat this file as authorization to implement later phases.

Product principle: LLM explains and suggests. Code calculates. Human approves.

## 1. Current Repo Architecture Summary

LeakProof AI is a Next.js App Router product with a structured audit workspace, not a chatbot-first product. The current flow is:

1. Authenticated user opens the app workspace.
2. User selects an organization and audit workspace.
3. User uploads source documents and CSV records.
4. Gemini extracts contract terms server-side.
5. Human reviewers approve or edit extracted terms.
6. Deterministic TypeScript reconciliation creates leakage findings.
7. Reviewers approve findings and evidence.
8. Reports export only approved customer-facing findings and reviewer-approved evidence.

Key files and responsibilities:

- `src/components/audit/RevenueAuditWorkspace.tsx`: main workspace UI, section routing, client session state, data fetching, review actions, report actions, and current advisory AI review button.
- `src/components/layout/AppShell.tsx`: left navigation, workspace header, context controls, and primary workspace content mount.
- `src/app/api/**`: private Next.js API routes. Current private routes authenticate bearer tokens, validate request bodies with Zod, check organization/workspace scope, gate mutations by role, call service-role Supabase helpers, and return safe API errors.
- `src/lib/db/auth.ts`: request auth and tenant boundary helpers.
- `src/lib/db/roles.ts`: role constants and role-management guards.
- `src/lib/db/audit.ts` plus `src/lib/audit/auditEvents.ts`: audit write helper and metadata redaction.
- `src/lib/ai/geminiClient.ts`: server-only Gemini JSON generation and embedding helper.
- `src/lib/agents/**`: extraction and current deterministic audit-agent planning helpers.
- `src/lib/leakage/**`: deterministic finance rules and integer minor-unit money calculations.
- `src/lib/evidence/**`: evidence approval/export readiness and customer-ready report generation.
- `supabase/migrations/**`: canonical tenant tables, RLS policies, pgvector RPC, rate-limit bucket, and current `finding_ai_critiques` table.

Current Copilot-adjacent implementation already exists in a narrow form:

- `src/app/api/findings/[id]/ai-critique/route.ts` runs Gemini as an evidence-quality critic only.
- `src/lib/ai/findingCritique.ts` forces `canApproveFinding=false`, `canChangeFindingAmount=false`, and `canChangeFindingStatus=false`.
- `RevenueAuditWorkspace.tsx` displays the AI review on finding details and labels it advisory only.
- `supabase/migrations/008_finding_ai_critiques.sql` stores advisory finding critiques separately from deterministic finding amount and human status.

Important current tension: `RevenueAuditWorkspace.tsx` also contains an Autopilot flow that can mutate terms/findings after explicit consent. LeakProof Copilot should not copy that behavior in early phases. Copilot starts as a right-side assistant and command layer, with all mutating actions deferred to explicit confirmation phases.

## 2. Proposed Copilot Architecture

Copilot should be a right-side assistant panel mounted over the existing audit workspace. It must not replace the workspace with a chatbot-only UI.

Recommended architecture:

- `src/components/layout/AppShell.tsx`
  - Add an optional `rightPanel` or `assistantPanel` prop in a later UI phase.
  - Render it as a third grid column on desktop and as a controlled drawer on mobile.
  - Keep `children` as the current audit workspace center content.

- `src/components/audit/RevenueAuditWorkspace.tsx`
  - Own selected organization, selected workspace, selected finding, current section, session, and role state.
  - Pass a new `CopilotPanel` into `AppShell`.
  - Pass only entity refs and safe context into the panel: `organizationId`, `workspaceId`, `activeSection`, `findingId`, `role`, and session token.

- `src/components/copilot/CopilotPanel.tsx` later
  - Right-side assistant panel.
  - Thread selector, message list, suggested command cards, tool result cards, and action confirmation cards.
  - Never displays as the only workspace experience.

- `src/lib/copilot/**` later
  - Tool registry and policy layer.
  - Message redaction and entity-reference extraction.
  - Prompt context builder that assembles safe summaries from existing APIs/helpers.
  - Action policy and confirmation state machine.

- `src/app/api/copilot/**` later
  - Thread/message APIs.
  - Read-only tool execution APIs.
  - Later action proposal/confirmation APIs.

The existing finding AI critique can become one Copilot tool later, but it should remain scoped to a finding and advisory. It must not be generalized into status-changing or amount-changing behavior.

## 3. DB Schema Plan

Use a new migration after `008_finding_ai_critiques.sql`, likely:

- `supabase/migrations/009_copilot_assistant.sql`

New tables:

### `assistant_threads`

Purpose: workspace-scoped conversation container with safe metadata.

Columns:

- `id uuid primary key default uuid_generate_v4()`
- `organization_id uuid not null references public.organizations(id) on delete cascade`
- `workspace_id uuid not null references public.audit_workspaces(id) on delete cascade`
- `created_by uuid not null`
- `title text`
- `status text not null default 'active' check (status in ('active', 'archived'))`
- `context_entity_type text check (context_entity_type in ('workspace', 'finding', 'document', 'report', 'term', 'evidence'))`
- `context_entity_id uuid`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `last_message_at timestamptz`

Constraints and indexes:

- Index `(organization_id, workspace_id, updated_at desc)`.
- Index `(organization_id, workspace_id, context_entity_type, context_entity_id)`.
- `metadata` must only contain safe UI settings, entity refs, and counters.

RLS:

- Org members can select threads.
- Org members can create threads only for their org/workspace.
- Thread archive should require owner/admin/reviewer in app routes, even if RLS permits a broader authenticated write. Prefer role-aware RLS helper if adding write policies.

### `assistant_messages`

Purpose: safe message ledger, not raw prompt/model output storage.

Columns:

- `id uuid primary key default uuid_generate_v4()`
- `organization_id uuid not null references public.organizations(id) on delete cascade`
- `workspace_id uuid not null references public.audit_workspaces(id) on delete cascade`
- `thread_id uuid not null references public.assistant_threads(id) on delete cascade`
- `role text not null check (role in ('user', 'assistant', 'system', 'tool'))`
- `message_kind text not null check (message_kind in ('user_intent', 'assistant_summary', 'tool_summary', 'system_notice', 'action_prompt'))`
- `safe_summary text`
- `referenced_entities jsonb not null default '[]'::jsonb`
- `ui_payload jsonb not null default '{}'::jsonb`
- `redaction_state text not null default 'redacted' check (redaction_state in ('redacted', 'blocked'))`
- `created_by uuid`
- `created_at timestamptz not null default now()`

Hard rule:

- Do not store raw user prompts, raw assistant completions, raw contract text, invoice row dumps, evidence excerpts, embeddings, model outputs, secrets, tokens, emails, domains, customer names, or free-form notes in this table.
- Store safe summaries and entity refs such as `{ "type": "finding", "id": "..." }`.
- If a user message contains sensitive content, store only a summary such as `User asked about finding evidence coverage` plus refs, not the original text.

Indexes:

- `(organization_id, workspace_id, thread_id, created_at)`.
- GIN index on `referenced_entities` if needed later.

RLS:

- Org members can select and insert messages for threads in their org/workspace.
- App route must verify the thread belongs to the submitted org/workspace before insert.

### `assistant_actions`

Purpose: proposed action records and confirmation state. Phase 0 only plans this table; execution is deferred.

Columns:

- `id uuid primary key default uuid_generate_v4()`
- `organization_id uuid not null references public.organizations(id) on delete cascade`
- `workspace_id uuid not null references public.audit_workspaces(id) on delete cascade`
- `thread_id uuid references public.assistant_threads(id) on delete set null`
- `message_id uuid references public.assistant_messages(id) on delete set null`
- `action_type text not null`
- `target_entity_type text not null`
- `target_entity_id uuid`
- `status text not null default 'suggested' check (status in ('suggested', 'awaiting_confirmation', 'confirmed', 'executing', 'executed', 'cancelled', 'failed', 'expired'))`
- `proposed_by uuid`
- `confirmed_by uuid`
- `executed_by uuid`
- `idempotency_key text`
- `payload_refs jsonb not null default '{}'::jsonb`
- `preview jsonb not null default '{}'::jsonb`
- `failure_code text`
- `created_at timestamptz not null default now()`
- `confirmed_at timestamptz`
- `executed_at timestamptz`
- `expires_at timestamptz`

Hard rule:

- `payload_refs` and `preview` must contain entity ids, statuses, enum values, amount ids already calculated by code, and short safe labels only.
- Do not store email bodies, invoice text, raw evidence excerpts, raw prompts, or generated model prose.

Indexes:

- `(organization_id, workspace_id, status, created_at desc)`.
- Unique index on `(organization_id, workspace_id, idempotency_key)` where `idempotency_key is not null`.

RLS:

- Org members can read actions.
- Creating action suggestions can be allowed for org members, but confirmation/execution must be enforced in server routes with `REVIEWER_WRITE_ROLES` or `ADMIN_ROLES` depending on action type.

### `assistant_tool_calls`

Purpose: trace tool invocation state without persisting sensitive inputs/outputs.

Columns:

- `id uuid primary key default uuid_generate_v4()`
- `organization_id uuid not null references public.organizations(id) on delete cascade`
- `workspace_id uuid not null references public.audit_workspaces(id) on delete cascade`
- `thread_id uuid references public.assistant_threads(id) on delete set null`
- `message_id uuid references public.assistant_messages(id) on delete set null`
- `tool_name text not null`
- `tool_version text not null default 'v1'`
- `mode text not null check (mode in ('read_only', 'action_proposal'))`
- `status text not null check (status in ('queued', 'running', 'completed', 'failed', 'blocked'))`
- `input_refs jsonb not null default '{}'::jsonb`
- `output_refs jsonb not null default '{}'::jsonb`
- `result_summary text`
- `error_code text`
- `latency_ms integer`
- `created_by uuid`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz`

Hard rule:

- Store hashes, ids, counts, statuses, and safe summary text only.
- Do not store raw search query text if the query may contain pasted customer data. Store a query hash and optional sanitized intent label.
- Do not store raw tool output containing document chunks, invoice lines, contract excerpts, or model responses.

Indexes:

- `(organization_id, workspace_id, thread_id, created_at desc)`.
- `(organization_id, workspace_id, tool_name, created_at desc)`.

RLS:

- Org members can select tool calls in their org.
- Inserts/updates should go through server API only.

Schema cross-checks:

- Use the existing `public.is_org_member` and `public.has_org_role` helpers from `001_initial_schema.sql`.
- Prefer explicit app-level workspace ownership checks with `assertWorkspaceRowBelongsToOrganization` before every insert/read.
- Add assistant event types to `src/lib/audit/auditEvents.ts` before relying on `writeAuditEvent`, because unknown event types are currently ignored.

## 4. API Route Plan

Use the existing route style:

- `NextResponse`
- Zod schemas in `src/lib/api/schemas.ts` or new `src/lib/copilot/schemas.ts`
- `handleApiError`
- `enforceRateLimit`
- `requireWorkspaceMember` for read-only Copilot routes
- `requireWorkspaceRole(..., REVIEWER_WRITE_ROLES)` for action proposal/confirmation routes that can affect review workflow
- `requireOrganizationRole(..., ADMIN_ROLES)` for member/role/admin actions
- `createSupabaseServiceClient`
- `writeAuditEvent` with redacted metadata

Planned routes:

### Phase 1/2 read-only routes

- `GET /api/copilot/threads?organization_id=&workspace_id=`
  - Auth: `requireWorkspaceMember`.
  - Returns thread ids, safe titles, context refs, status, timestamps.

- `POST /api/copilot/threads`
  - Auth: `requireWorkspaceMember`.
  - Creates a thread with context refs only.
  - Audit: `assistant.thread.created` with safe metadata.

- `GET /api/copilot/threads/[threadId]/messages?organization_id=&workspace_id=`
  - Auth: `requireWorkspaceMember`.
  - Verifies thread belongs to organization/workspace.
  - Returns safe summaries and UI payloads.

- `POST /api/copilot/threads/[threadId]/messages`
  - Auth: `requireWorkspaceMember`.
  - Accepts user intent text but persists only redacted summary and entity refs.
  - In Phase 2, may route to read-only tools without Gemini.
  - In later Gemini phase, calls `generateGeminiJson` with a strict advisory schema.

- `POST /api/copilot/tools/run`
  - Auth: `requireWorkspaceMember`.
  - Request contains `organization_id`, `workspace_id`, `thread_id`, `tool_name`, and typed `input_refs`.
  - Executes only registered read-only tools in Phase 2.
  - Stores `assistant_tool_calls` with refs/counts, not raw content.

### Later action routes, not Phase 2

- `POST /api/copilot/actions`
  - Creates an action proposal only.
  - No existing business mutation executes here.

- `POST /api/copilot/actions/[actionId]/confirm`
  - Explicit confirmation step.
  - Re-checks auth, role, target entity, current state, allowed transition, and idempotency.

- `POST /api/copilot/actions/[actionId]/execute`
  - Later phase only.
  - Calls existing mutation helpers/routes internally after confirmation.
  - Writes normal domain audit events plus assistant action audit events.

Do not use the existing report generation POST route as a read-only tool. `src/app/api/workspaces/[workspaceId]/report/route.ts` inserts an `evidence_packs` row when exportable, so a Copilot report-readiness tool should reuse `generateExecutiveAuditReport` directly in a read-only helper and avoid persistence.

## 5. UI Integration Plan

Best mount point: `src/components/layout/AppShell.tsx`.

Reason:

- Every authenticated workspace page currently renders `RevenueAuditWorkspace`.
- `RevenueAuditWorkspace` already wraps its content in `AppShell`.
- `AppShell` owns the shell grid and is the right place to add a third desktop column without changing each section.
- `RevenueAuditWorkspace` owns selected organization/workspace/session/role and can pass safe context into the panel.

UI plan:

1. Extend `AppShell` with optional `rightPanel?: ReactNode`.
2. Render right panel after `.audit-main` as `.assistant-rail`.
3. Change desktop grid from `286px minmax(0, 1fr)` to `286px minmax(0, 1fr) minmax(320px, 380px)` only when the panel is open.
4. Keep the main workspace content visible and usable.
5. Add a compact Copilot button in topbar controls to open/collapse the rail.
6. On widths below the current mobile breakpoint, render Copilot as an overlay drawer, not as a route replacing the workspace.
7. Keep Copilot cards compact and action-oriented:
   - workspace context card
   - read-only tool result card
   - suggested next step card
   - action proposal card with disabled or deferred confirmation until later phases
8. Do not add a standalone `/app/copilot` route as the primary experience.

Initial panel behavior:

- Empty state: show current workspace context and suggested safe questions.
- Loading: show tool-level loading state.
- Error: show safe error without raw upstream error text.
- No workspace selected: ask user to select or create a workspace in the normal workspace UI.
- Viewer/member role: allow read-only explanation only; hide or disable action proposal controls.

## 6. Tool Registry Plan

Create a typed registry later under `src/lib/copilot/tools.ts` or `src/lib/copilot/toolRegistry.ts`.

Tool contract:

```ts
type CopilotToolMode = 'read_only' | 'action_proposal';

type CopilotTool<Input, Output> = {
  name: string;
  version: 'v1';
  mode: CopilotToolMode;
  description: string;
  inputSchema: ZodSchema<Input>;
  execute(input: Input, context: CopilotRequestContext): Promise<Output>;
  summarizeForLog(output: Output): SafeToolSummary;
};
```

Registry rules:

- Phase 2 exposes only read-only tools.
- Tool inputs must be ids, enums, filters, and safe options.
- Tool outputs returned to the UI may include existing user-visible values, but tool call persistence stores only refs/counts/safe summaries.
- Tools must never write domain tables except `assistant_tool_calls` logging. If a tool needs a business mutation, it is not a Phase 2 tool.
- Tools must never modify finding amounts, statuses, roles, evidence approval, reports, documents, invoices, or email/invoice state.

Exact Phase 2 read-only tools:

1. `get_workspace_context`
   - Input refs: `organization_id`, `workspace_id`, optional `active_section`, optional `finding_id`.
   - Uses: `requireWorkspaceMember`, `audit_workspaces`, `organizations`, membership role.
   - Output: org/workspace ids, names for UI display, user role, active section, selected entity refs.
   - Persisted log: ids, role, active section only.

2. `get_workspace_snapshot`
   - Uses the same read APIs/data shapes currently loaded by `fetchWorkspaceSnapshot` in `RevenueAuditWorkspace.tsx`.
   - Output: counts and statuses for documents, customers, terms, findings, invoices, usage, and evidence candidates.
   - Persisted log: counts only.

3. `list_source_documents`
   - Output: document ids, document type, parse/chunk/embed status, customer id, size bucket, created date.
   - Do not persist file names or storage paths in tool call logs.

4. `list_contract_terms`
   - Output: term ids, type, review status, confidence, source document id, customer id, citation label for UI.
   - Do not store term values or citation excerpts in assistant logs.

5. `list_findings`
   - Output: finding ids, title, type, outcome type, code-calculated amount/currency, confidence, status, severity, evidence coverage.
   - Financial values are read from existing deterministic findings only; the LLM must not create or alter them.
   - Persisted log: ids, statuses, counts, aggregate amount refs only.

6. `get_finding_detail`
   - Output: finding id, type, status, amount/currency from DB, calculation formula/input keys, evidence counts, candidate ids, latest advisory critique summary if present.
   - Do not persist raw calculation JSON, evidence excerpts, or model critique JSON in assistant message logs.

7. `get_report_readiness`
   - Read-only helper that queries eligible findings/evidence and calls `generateExecutiveAuditReport` without inserting an `evidence_packs` row.
   - Output: exportable boolean, blockers, eligible/included counts, included finding ids, totals from deterministic report helper.
   - Persisted log: blockers, counts, included ids, totals from code only.

8. `get_workspace_analytics`
   - Uses `buildWorkspaceAnalytics` or the existing analytics query pattern.
   - Output: customer-facing totals, internal pipeline totals, review burden, operations status.
   - Persisted log: aggregate counts/totals only.

9. `get_audit_agent_next_step`
   - Uses `planAuditAgentNextStep` from `src/lib/agents/auditAgent.ts`.
   - Output: deterministic phase, safe guardrails, read-only recommendation labels.
   - Does not execute Autopilot mutations.

10. `search_evidence_refs`
   - Read-only semantic search preview.
   - Use only after explicit tool invocation.
   - Prefer a no-persistence helper around embeddings and `match_document_chunks`; if reusing the current semantic search route, remember it writes `semantic_search_logs`.
   - Output to UI: chunk ids, document ids, source labels, similarity, short preview for user display.
   - Persisted log: query hash, result ids, source labels, similarity buckets. Do not store raw query text or chunk content in assistant tables.

11. `get_existing_ai_critique`
   - Reads latest `finding_ai_critiques` for a finding.
   - Output: recommendation status, evidence score, created_at, model label, high-level checklist count.
   - Do not store raw critique JSON in assistant messages.

Tools intentionally excluded from Phase 2:

- `run_extraction`
- `embed_document`
- `run_reconciliation`
- `approve_term`
- `edit_term`
- `approve_finding`
- `change_finding_status`
- `attach_evidence_candidate`
- `approve_evidence_candidate`
- `reject_evidence_candidate`
- `remove_evidence_item`
- `generate_report`
- `export_report`
- `invite_member`
- `change_member_role`
- `delete_document`
- `send_email`
- `create_invoice`

## 7. Action Confirmation Plan

No mutating action executes in Phase 0, Phase 1, or Phase 2.

Later action model:

1. Copilot may suggest an action.
2. Server writes an `assistant_actions` row with `status='awaiting_confirmation'`.
3. UI renders an action card with:
   - action type
   - target entity
   - current state
   - proposed state
   - blockers
   - required role
   - audit implication
4. User confirms through an explicit button or typed confirmation.
5. Server revalidates:
   - user auth
   - organization membership
   - workspace ownership
   - required role
   - target entity belongs to org/workspace
   - state transition still valid
   - idempotency key unused
6. Server executes through existing business helpers/routes.
7. Server writes domain audit event and assistant action audit event.
8. UI refreshes workspace data from normal APIs.

Action policies:

- Finding status changes must reuse `assertValidFindingStatusTransition`.
- Finding status changes must never alter `estimated_amount_minor` or `calculation`.
- Evidence approvals must reuse existing candidate/evidence rules.
- Report export must require existing `report.exportability.exportable`.
- Role changes must require `ADMIN_ROLES` and reuse `assertCanChangeMemberRole` and last-owner checks.
- Email sending, invoice creation, document deletion, and role changes should remain out of Copilot until a later high-assurance phase.

Exact mutating actions deferred until later phases:

- Uploading documents or CSVs.
- Running contract extraction.
- Embedding documents.
- Editing, approving, rejecting, or marking terms needs-review.
- Running deterministic reconciliation.
- Creating, approving, rejecting, or removing evidence candidates/items.
- Updating finding status.
- Assigning findings to reviewers.
- Generating reports, because current generation can insert `evidence_packs`.
- Exporting reports.
- Creating organizations or workspaces.
- Inviting members.
- Changing roles.
- Removing members.
- Assigning customers to documents.
- Sending customer emails.
- Creating invoices or billing-system records.
- Deleting or archiving documents.

## 8. Security Model

Security invariants:

- Tenant isolation remains organization and workspace scoped.
- RLS remains enabled for all tenant tables.
- API routes still verify auth server-side.
- Workspace-scoped reads verify the workspace belongs to the submitted organization.
- Mutating routes remain role-gated.
- Service-role Supabase and Gemini remain server-only.
- Copilot cannot approve evidence, approve findings, export reports, change roles, send emails, delete documents, create invoices, or change finding amounts without an explicit later confirmed action flow.

Sensitive persistence rules:

- Do not store raw contract text.
- Do not store invoice contents or row dumps.
- Do not store raw prompts.
- Do not store embeddings.
- Do not store raw model outputs.
- Do not store secrets, tokens, auth headers, API keys, emails, domains, customer names, file names, storage paths, or customer PII in assistant logs.
- Store entity references, hashes, status/count summaries, and safe UI labels instead.

Prompting rules for later Gemini phase:

- Build prompts server-side only.
- Prefer structured, bounded context from read-only tools.
- Include ids and safe summaries first.
- Include short evidence excerpts only when the user explicitly asks for evidence review and the server can fetch scoped data; do not persist those excerpts in assistant logs.
- Use `generateGeminiJson` with strict schemas and temperature 0.
- Validate model output before display.
- Guardrail schema must include booleans proving the model is not claiming action authority.

Audit rules:

- Reuse `writeAuditEvent`.
- Extend `AuditEventType` and `REQUIRED_AUDIT_EVENTS` with assistant-safe events before relying on them.
- Use `redactAuditMetadata` for all assistant audit metadata.
- Audit action proposal/confirmation/execution, not every private user message.
- Never include raw message text, raw tool input, raw tool output, prompt, model output, evidence excerpt, or customer names in audit metadata.

Rate-limit rules:

- Reuse `enforceRateLimit`.
- Add rate limits for message posting, tool execution, Gemini response generation, and action proposal/confirmation.
- Production must keep shared Supabase-backed rate limiting.

## 9. Test Plan

Add tests with each meaningful behavior change.

DB/schema and policy tests:

- Add `src/lib/copilot/schemaPolicy.test.ts` or a migration static test if this repo continues testing migrations through source inspection.
- Verify assistant migration includes organization/workspace ids, RLS enabled, indexes, and no raw-content columns such as `prompt`, `raw_content`, `model_output`, `embedding`, or `email_body`.

Redaction and persistence tests:

- Add `src/lib/copilot/messageRedaction.test.ts`.
- Verify user messages are reduced to safe summaries and entity refs.
- Verify raw contracts, invoice rows, prompts, excerpts, emails, domains, file names, storage paths, tokens, secrets, model outputs, and embeddings are blocked/redacted.
- Update `src/lib/audit/auditEvents.test.ts` for assistant event types and sensitive metadata keys.

Tool registry tests:

- Add `src/lib/copilot/toolRegistry.test.ts`.
- Verify only registered read-only tools run in Phase 2.
- Verify unregistered or mutating tool names are blocked.
- Verify tool call logs store refs/counts/summaries rather than raw outputs.

Tool behavior tests:

- Add `src/lib/copilot/tools/workspaceSnapshot.test.ts`.
- Add `src/lib/copilot/tools/findingDetail.test.ts`.
- Add `src/lib/copilot/tools/reportReadiness.test.ts`.
- Add `src/lib/copilot/tools/auditAgentNextStep.test.ts`.
- Verify `get_report_readiness` does not insert `evidence_packs`.
- Verify `get_audit_agent_next_step` does not execute Autopilot mutations.

Action policy tests:

- Add `src/lib/copilot/actionPolicy.test.ts`.
- Verify mutating actions are deferred/blocked before confirmation phases.
- Verify disallowed actions include amount edits, role changes without admin, report exports without confirmation, email sends, invoice creation, document deletion, and evidence/finding approvals without confirmation.

API security tests:

- Add `src/app/api/copilot/security.test.ts` or expand `src/app/api/security-routes.test.ts`.
- Verify unauthenticated Copilot routes return 401 before service-role work.
- Verify cross-org and cross-workspace access returns 403.
- Verify viewer/member can run read-only tools but cannot create confirmed action execution.
- Verify rate limit failures return 429.

Gemini phase tests:

- Add `src/lib/copilot/copilotPrompt.test.ts`.
- Add `src/lib/copilot/copilotResponseSchema.test.ts`.
- Verify prompts are built from safe summaries and entity refs.
- Verify model response schema cannot claim approval/export/amount-change authority.

UI/e2e tests:

- Add `tests/e2e/copilot-panel.spec.ts`.
- Verify the Copilot is a right-side panel/drawer over the existing workspace.
- Verify the main audit workspace remains visible.
- Verify viewer sees read-only posture.
- Verify action proposal cards do not execute mutations in Phase 2.
- Verify mobile uses a drawer and text does not overlap core workspace controls.

Always run at least:

- `pnpm typecheck`
- `pnpm lint`

For later code phases also run targeted unit tests first, then broader `pnpm test`, and use `pnpm build` when routes, Next types, or UI shell layout changes.

## 10. Phase-by-Phase Implementation Checklist

### Phase 0: Architecture reconnaissance

- [x] Inspect repo architecture and current guardrails.
- [x] Identify mount point, helpers, rules, data model needs, tools, actions, tests, and risks.
- [x] Create `docs/COPILOT_IMPLEMENTATION_PLAN.md`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint`.

Stop here for the current task.

### Phase 1: Copilot persistence and policy foundations

- [ ] Add migration `009_copilot_assistant.sql`.
- [ ] Add assistant tables, indexes, RLS, and role policies.
- [ ] Add Copilot schemas and redaction helpers.
- [ ] Add assistant audit event types with redacted metadata.
- [ ] Add thread/message API skeletons with no Gemini calls.
- [ ] Add tests for schema, redaction, auth, tenant isolation, and raw-content blocking.
- [ ] Run targeted tests, `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

### Phase 2: Read-only tool registry

- [ ] Add typed Copilot tool registry.
- [ ] Implement only the exact read-only tools listed in this plan.
- [ ] Add tool-call persistence with refs/counts/summaries only.
- [ ] Add report-readiness helper that does not insert evidence packs.
- [ ] Add tests proving no business tables mutate during read-only tools.
- [ ] Add API route for read-only tool execution.
- [ ] Run targeted tool tests, `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

### Phase 3: Right-side UI panel without Gemini

- [ ] Extend `AppShell` with optional right panel.
- [ ] Add `CopilotPanel` as a right rail/drawer.
- [ ] Wire safe context from `RevenueAuditWorkspace`.
- [ ] Render deterministic tool results and suggested safe questions.
- [ ] Keep the existing workspace as the primary UI.
- [ ] Add Playwright coverage for desktop and mobile panel behavior.
- [ ] Run targeted UI/e2e checks, `pnpm typecheck`, `pnpm lint`, and likely `pnpm build`.

### Phase 4: Advisory Gemini responses

- [ ] Add Copilot prompt builder from safe tool summaries.
- [ ] Use `generateGeminiJson` with strict advisory schema.
- [ ] Do not persist raw prompts or model outputs.
- [ ] Add guardrails preventing approval, export, role changes, document deletion, invoice/email creation, and amount changes.
- [ ] Add model response schema and prompt tests.
- [ ] Run AI helper tests, `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

### Phase 5: Confirmed action proposals

- [ ] Add action proposal cards and `assistant_actions`.
- [ ] Implement confirmation-only flows for low-risk internal workflow mutations first.
- [ ] Reuse existing route helpers and role checks.
- [ ] Revalidate every action at execution time.
- [ ] Write normal domain audit events plus assistant action audit events.
- [ ] Keep role changes, exports, emails, invoices, and destructive actions deferred unless explicitly approved in a later phase.
- [ ] Run action policy tests, route tests, role tests, `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## 11. Risks and Mitigations

### Branch/base risk

Risk: The requested branch `agent/leakproof-copilot-controlled-tools` was not present locally or on `origin` during Phase 0, so this local branch was created from the currently checked-out repo state.

Mitigation: Before Phase 1, verify the intended remote branch/base. If a remote branch appears later, compare diffs before implementing schema or UI changes.

### Large workspace component conflict risk

Risk: `RevenueAuditWorkspace.tsx` is a large all-in-one component. Copilot context, panel state, and existing workflow actions could cause conflicts or accidental broad refactors.

Mitigation: Put reusable Copilot code under `src/lib/copilot/**` and `src/components/copilot/**`. Keep `RevenueAuditWorkspace.tsx` edits limited to passing context and rendering the panel.

### Shell CSS conflict risk

Risk: `src/app/globals.css` has multiple historical definitions for `.audit-shell`, `.audit-main`, and related classes. Adding a right rail can be overridden by later declarations.

Mitigation: Add dedicated `.assistant-rail` and `.audit-shell.has-assistant` classes near the latest active shell definitions. Verify desktop and mobile with screenshots in the UI phase.

### Existing Autopilot behavior risk

Risk: Current Autopilot can run extraction/reconciliation and update terms/findings after consent. Copilot could accidentally inherit a too-powerful action model.

Mitigation: Phase 2 registry is read-only. Later action execution must go through `assistant_actions` and explicit confirmation. Do not route Copilot through `runAutonomousAudit`.

### Report generation mutation risk

Risk: Existing report generation route can insert an `evidence_packs` row when exportable.

Mitigation: Copilot report-readiness tool must use a read-only helper around `generateExecutiveAuditReport`, not the POST report route.

### Sensitive logging risk

Risk: Assistant systems naturally accumulate user prompts, model outputs, tool outputs, snippets, and PII.

Mitigation: Persist only redacted summaries and entity refs. Add tests that fail on raw-content column names and sensitive metadata keys. Use audit redaction and never store raw prompts/model outputs.

### Financial hallucination risk

Risk: Copilot may phrase suggested values as if it calculated leakage.

Mitigation: Tool outputs may read existing deterministic amounts only. Gemini schema must forbid amount changes and require provenance such as `amountSource: 'existing_finding' | 'report_helper'`. UI should label amounts as code-calculated.

### Tenant isolation risk

Risk: Assistant thread/tool/action tables add new data surfaces that can leak cross-org context.

Mitigation: Every assistant row includes `organization_id` and `workspace_id`, RLS uses org membership, and app routes also verify workspace ownership with existing helpers.

### Role bypass risk

Risk: A Copilot action layer can bypass viewer/member read-only restrictions if it calls mutation routes indirectly.

Mitigation: Phase 2 has no mutation tools. Later action routes re-check roles server-side and call existing role helpers. Viewer/member tests must cover Copilot specifically.

### Documentation drift risk

Risk: Some docs still list period-aware reconciliation, payment terms mismatch, and rerun idempotency as known gaps, while `FEATURE_LIST.md` and code indicate they are implemented.

Mitigation: Treat code and current feature list as implementation source of truth for Copilot planning. Do not expand Copilot scope based on stale known-gap bullets without re-checking code.

### Merge risk around finding AI critique

Risk: Existing `finding_ai_critiques` already implements a narrow advisory AI pattern. A broad Copilot schema may duplicate or conflict with it.

Mitigation: Keep `finding_ai_critiques` as the domain-specific artifact. Copilot can reference it through read-only tools instead of moving it into assistant messages.
