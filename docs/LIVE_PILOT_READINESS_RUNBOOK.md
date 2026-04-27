# Live Pilot Readiness Runbook

Date: 2026-04-27

Baseline: `docs/AI_FEATURES_READINESS_REPORT.md`

Current verdict: Pilot-ready after live setup.

Production verdict: Not production-ready until live verification passes.

## Hard Warning

Do not use real customer data until every checklist in this runbook passes.

Until then, use only:

- `sample-data/mock-pilot/contracts.json`
- `sample-data/mock-pilot/invoices.csv`
- `sample-data/mock-pilot/usage.csv`
- `sample-data/mock-pilot/customer_metadata.csv`
- `sample-data/mock-pilot/expected_findings.json`

Do not upload real contracts, real invoices, real usage files, customer PII, screenshots with customer data, generated customer reports, or customer-ready exports until the Supabase migration checks, Vercel deploy checks, persona QA, mock audit, live Gemini smoke, and audit-log checks all pass.

## Readiness Boundary

Repo-side gates passed in the baseline report:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm env:check`
- `pnpm test:e2e`

Live pilot readiness still requires:

- Supabase migrations applied and verified.
- Supabase Auth redirect URLs configured.
- Vercel production env vars configured.
- Vercel production deployment smoke-tested.
- Owner/admin/reviewer/member/viewer role QA completed.
- Mock audit total verified as exactly `USD 26,690`.
- Live Gemini smoke completed with safe logs.
- Audit-log inspection completed.

## Stop Conditions

Stop the live pilot and do not use customer data if any of these happen:

- Any migration is missing or out of order.
- RLS is disabled on a tenant table.
- `source-documents` bucket is missing or public.
- `LEAKPROOF_RATE_LIMIT_BACKEND` is `memory` in production.
- `SUPABASE_SERVICE_ROLE_KEY` appears in a browser bundle, screenshot, client error, or `NEXT_PUBLIC_` variable.
- `GEMINI_API_KEY` appears in a browser bundle, screenshot, client error, or `NEXT_PUBLIC_` variable.
- Viewer/member can mutate workflow data.
- AI changes leakage amounts, approves findings, approves evidence, exports reports, sends emails, creates invoices, or fabricates totals.
- Reports include draft, needs-review, dismissed, not-recoverable, or unapproved-evidence findings in customer-facing totals.
- Mock audit total is anything other than `USD 26,690`.
- Assistant logs contain raw contracts, raw invoices, raw CSV rows, prompts, model outputs, embeddings, secrets, tokens, or customer PII.

## Supabase Migration Verification Checklist

Run these against the dedicated live-pilot Supabase project only.

### 1. Link And Apply

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
supabase migration list
```

Expected migration files in this repo:

- `001_initial_schema.sql`
- `002_analytics_metadata.sql`
- `003_idempotent_audit_runs.sql`
- `004_team_invites_and_review_assignments.sql`
- `005_evidence_approval_hardening.sql`
- `006_api_rate_limits.sql`
- `007_invoice_finance_metadata.sql`
- `008_finding_ai_critiques.sql`
- `009_copilot_read_only_assistant.sql`
- `010_contract_document_relationships.sql`

Pass criteria:

- `supabase migration list` shows all `001` through `010` as applied to the linked remote project.
- No migration is marked pending locally or remotely.
- No migration was manually skipped.

### 2. Verify Migration History In SQL

Run in Supabase SQL editor:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Pass criteria:

- Versions `001` through `010` are present.
- `008_finding_ai_critiques`, `009_copilot_read_only_assistant`, and `010_contract_document_relationships` are present.

### 3. Verify Required Extensions

```sql
select extname
from pg_extension
where extname in ('vector', 'uuid-ossp');
```

Pass criteria:

- `vector` is present.
- `uuid-ossp` is present.

### 4. Verify Required Tables

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'organizations',
    'organization_members',
    'audit_workspaces',
    'customers',
    'source_documents',
    'document_chunks',
    'ai_jobs',
    'embedding_jobs',
    'document_embeddings',
    'semantic_search_logs',
    'contract_terms',
    'invoice_records',
    'usage_records',
    'extraction_runs',
    'reconciliation_runs',
    'leakage_findings',
    'evidence_items',
    'evidence_candidates',
    'evidence_packs',
    'audit_events',
    'organization_invites',
    'api_rate_limit_buckets',
    'finding_ai_critiques',
    'assistant_threads',
    'assistant_messages',
    'assistant_actions',
    'assistant_tool_calls',
    'contract_document_relationships'
  )
order by table_name;
```

Pass criteria:

- Every listed table is returned.
- No required AI table is missing.

### 5. Verify RLS Is Enabled

```sql
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'organizations',
    'organization_members',
    'audit_workspaces',
    'customers',
    'source_documents',
    'document_chunks',
    'ai_jobs',
    'embedding_jobs',
    'document_embeddings',
    'semantic_search_logs',
    'contract_terms',
    'invoice_records',
    'usage_records',
    'extraction_runs',
    'reconciliation_runs',
    'leakage_findings',
    'evidence_items',
    'evidence_candidates',
    'evidence_packs',
    'audit_events',
    'organization_invites',
    'api_rate_limit_buckets',
    'finding_ai_critiques',
    'assistant_threads',
    'assistant_messages',
    'assistant_actions',
    'assistant_tool_calls',
    'contract_document_relationships'
  )
order by relname;
```

Pass criteria:

- Every returned row has `rls_enabled = true`.
- Any `false` value is a blocker.

### 6. Verify Key Functions And RPCs

```sql
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'is_org_member',
    'has_org_role',
    'match_document_chunks',
    'complete_extraction_run',
    'complete_reconciliation_run',
    'consume_api_rate_limit'
  )
order by proname;
```

Pass criteria:

- Every listed function is returned.

### 7. Verify Storage Bucket

```sql
select id, name, public
from storage.buckets
where id = 'source-documents';
```

Pass criteria:

- One row is returned.
- `public = false`.

### 8. Verify Storage Policies Exist

```sql
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%source document%'
order by policyname;
```

Pass criteria:

- Read and upload policies for source document objects exist.
- Policies are scoped to organization membership and reviewer/admin/owner write roles.

### 9. Verify Assistant Action Constraint

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.assistant_actions'::regclass
  and conname = 'assistant_actions_action_type_check';
```

Pass criteria:

- The definition includes `prepare_contract_hierarchy_resolution`.
- The definition includes the existing Copilot action types such as `prepare_generate_report_draft`, `prepare_recovery_note`, and `prepare_approve_evidence`.

### 10. Verify Embedding Dimension

```sql
select format_type(atttypid, atttypmod) as column_type
from pg_attribute
where attrelid = 'public.document_embeddings'::regclass
  and attname = 'embedding';
```

Pass criteria:

- Column type is compatible with `vector(1536)`.
- `GEMINI_EMBEDDING_DIMENSION=1536` in local and Vercel env.

### 11. Verify Report And Evidence Boundaries

Run after mock audit data exists:

```sql
select status, count(*), coalesce(sum(estimated_amount_minor), 0) as amount_minor
from public.leakage_findings
where is_active = true
group by status
order by status;
```

Pass criteria:

- Customer-facing totals are calculated only from `approved`, `customer_ready`, and `recovered`.
- `draft`, `needs_review`, `dismissed`, and `not_recoverable` are not counted as customer-facing leakage.

```sql
select approval_state, count(*)
from public.evidence_items
group by approval_state
order by approval_state;
```

Pass criteria:

- Customer-facing report evidence uses only `approval_state = 'approved'`.
- Approved evidence rows have reviewer metadata.

## Vercel Deployment Checklist

Run from the repo root.

### 1. Link Project

```bash
vercel link
```

Pass criteria:

- The linked project is the intended LeakProof AI project.
- The linked team/account is the production owner.

### 2. Configure Production Env Vars

Add or verify these in Vercel production:

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

Required values:

- `GEMINI_GENERATION_MODEL=gemini-2.5-pro`
- `GEMINI_FAST_MODEL=gemini-2.5-flash`
- `GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview`
- `GEMINI_EMBEDDING_DIMENSION=1536`
- `LEAKPROOF_RATE_LIMIT_BACKEND=supabase`
- `NEXT_PUBLIC_APP_URL=<production-url>`

Pass criteria:

- `SUPABASE_SERVICE_ROLE_KEY` is not equal to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not prefixed with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SUPABASE_URL` points to the dedicated pilot Supabase project.

### 3. Pull Production Env Locally

```bash
vercel pull --environment=production
pnpm env:check
```

Pass criteria:

- `pnpm env:check` passes.
- It reports required variables present.
- It reports database embedding dimension `1536`.

### 4. Run Local Production Gate With Pulled Env

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm env:check
```

Pass criteria:

- Every command exits `0`.

### 5. Deploy Production

```bash
vercel deploy --prod
```

Pass criteria:

- Deployment finishes successfully.
- Final production URL matches `NEXT_PUBLIC_APP_URL`.
- Vercel build logs do not print secrets.

### 6. Deployed Smoke

```bash
APP_URL=<production-url> pnpm smoke
```

If a real smoke token is available:

```bash
APP_URL=<production-url> \
SMOKE_AUTH_TOKEN=<owner-or-reviewer-token> \
SMOKE_ORGANIZATION_ID=<org-id> \
SMOKE_WORKSPACE_ID=<workspace-id> \
pnpm smoke
```

Pass criteria:

- Public app route responds.
- `/api/health` responds.
- Unauthenticated private analytics route returns `401`.
- Authenticated analytics smoke returns `200` when token/org/workspace are provided.

### 7. Browser Deployment Check

Open `<production-url>` in a clean browser profile.

Pass criteria:

- Public pages load.
- Login page loads.
- Signed-out `/app` requires auth.
- No critical console errors.
- No secret values appear in page source, network responses, console logs, or screenshots.

## Role And Persona QA Checklist

Create five real users in the live-pilot Supabase project:

- Owner: `owner+pilot@<domain>`
- Admin: `admin+pilot@<domain>`
- Reviewer: `reviewer+pilot@<domain>`
- Member: `member+pilot@<domain>`
- Viewer: `viewer+pilot@<domain>`

Use one dedicated live-pilot organization and one dedicated live-pilot workspace.

### Owner

- [ ] Can create organization and workspace.
- [ ] Can invite admin, reviewer, member, and viewer.
- [ ] Can change member roles.
- [ ] Cannot remove or demote the last owner.
- [ ] Can upload contract, invoice CSV, usage CSV, and customer CSV mock fixtures.
- [ ] Can run extraction, embedding, reconciliation, semantic search, term review, finding review, evidence review, report generation, and report export.
- [ ] Can create, confirm, cancel, and execute allowed Copilot action cards.
- [ ] Cannot make Copilot auto-approve evidence/findings, auto-export reports, send emails, or create invoices.
- [ ] Can see audit events for role, upload, extraction, reconciliation, evidence, finding, report, and Copilot actions.

### Admin

- [ ] Can invite and manage non-owner users.
- [ ] Cannot remove or demote the last owner.
- [ ] Can run upload, extraction, embedding, reconciliation, semantic search, term review, finding review, evidence review, report generation, and report export.
- [ ] Can create, confirm, cancel, and execute allowed Copilot action cards.
- [ ] Cannot bypass organization or workspace boundaries.
- [ ] Cannot make Copilot auto-approve evidence/findings, auto-export reports, send emails, or create invoices.

### Reviewer

- [ ] Can upload mock files.
- [ ] Can run extraction, embedding, reconciliation, and semantic search.
- [ ] Can approve/edit/reject extracted terms.
- [ ] Can approve/dismiss/mark findings as needs review/customer-ready/recovered/not recoverable when evidence rules allow it.
- [ ] Can approve/reject evidence candidates and evidence items.
- [ ] Can generate report drafts only when report-readiness rules pass.
- [ ] Cannot manage roles, remove members, demote owners, or invite users beyond allowed role policy.
- [ ] Cannot export a report with unapproved evidence.
- [ ] Cannot make Copilot auto-approve evidence/findings, auto-export reports, send emails, or create invoices.

### Member

- [ ] Can sign in and view permitted organization/workspace data.
- [ ] Can view findings, analytics, reports, and Copilot read-only answers when permitted.
- [ ] Cannot upload files.
- [ ] Cannot run extraction, embedding, reconciliation, or semantic-search mutation flows.
- [ ] Cannot approve terms, approve evidence, change finding status, generate/export reports, manage roles, or invite users.
- [ ] Cannot create, confirm, or execute Copilot mutation action cards.
- [ ] Receives clear forbidden or read-only states without seeing data from another organization.

### Viewer

- [ ] Can sign in and view permitted read-only workspace surfaces.
- [ ] Can ask read-only Copilot questions.
- [ ] Cannot upload files.
- [ ] Cannot run extraction, embedding, reconciliation, semantic search, evidence approval, finding status changes, report export, role changes, invite changes, or Copilot mutation actions.
- [ ] Receives clear forbidden or read-only states without leaking hidden data.

### Cross-Tenant

- [ ] User from organization A cannot read organization B workspaces.
- [ ] User from organization A cannot read organization B documents, findings, analytics, reports, evidence, Copilot threads, or audit events.
- [ ] A workspace ID from a different organization is rejected.
- [ ] Service-role routes still require bearer auth, organization membership, workspace ownership, and correct role.

## Mock Audit Checklist

Expected total: `USD 26,690`

Expected total minor units: `2,669,000`

Dataset: `sample-data/mock-pilot/expected_findings.json`

### Inputs

- [ ] Use only `sample-data/mock-pilot/contracts.json`.
- [ ] Use only `sample-data/mock-pilot/invoices.csv`.
- [ ] Use only `sample-data/mock-pilot/usage.csv`.
- [ ] Use only `sample-data/mock-pilot/customer_metadata.csv`.
- [ ] Confirm no real customer data is mixed into the workspace.

### Workflow

- [ ] Sign in as owner or reviewer.
- [ ] Create a fresh live-pilot organization/workspace or clear the previous mock workspace.
- [ ] Upload mock customer metadata.
- [ ] Upload mock contracts.
- [ ] Upload mock invoice CSV.
- [ ] Upload mock usage CSV.
- [ ] Confirm customers link by external ID, domain, name, or explicit assignment.
- [ ] Run extraction on mock contracts.
- [ ] Review extracted terms and approve/edit/reject manually.
- [ ] Run embedding for documents where needed.
- [ ] Run reconciliation.
- [ ] Review generated findings.
- [ ] Approve only findings with deterministic calculations and approved evidence.
- [ ] Approve required evidence.
- [ ] Generate report or analytics view.

### Expected Findings

Verify at least these expected amounts:

- Alpha Retail Cloud Ltd.: `USD 2,250` total.
- Beta Health Ops Inc.: `USD 1,600`.
- Cobalt API Co.: `USD 2,400`.
- Delta Media Group: `USD 2,400`.
- Evergreen Analytics LLC.: `USD 3,780`.
- Fjord Support Services: `USD 5,000`.
- Helio Learning Systems: `USD 6,945`.
- Ion Logistics Platform: `USD 2,315`.

Pass criteria:

- Customer-facing total is exactly `USD 26,690`.
- Minor-unit total is exactly `2,669,000`.
- Draft findings do not appear in customer-facing total.
- Needs-review findings do not appear in customer-facing total.
- Dismissed findings do not appear in customer-facing total.
- Not-recoverable findings do not appear in customer-facing total.
- Unapproved evidence does not appear in customer-facing report evidence.
- Report labels say approved/customer-ready/recovered only.
- Empty chart states show no fake values.

## Live Gemini Smoke Checklist

Use only mock-pilot data.

### Setup

- [ ] `GEMINI_API_KEY` is set server-side locally and in Vercel.
- [ ] `GEMINI_GENERATION_MODEL` is set.
- [ ] `GEMINI_FAST_MODEL` is set.
- [ ] `GEMINI_EMBEDDING_MODEL` is set.
- [ ] `GEMINI_EMBEDDING_DIMENSION=1536`.
- [ ] `pnpm env:check` passes.

### Extraction Smoke

- [ ] Upload one mock contract.
- [ ] Run extraction.
- [ ] Confirm extracted terms cite safe source labels.
- [ ] Confirm low-confidence or ambiguous terms remain needs-review/extracted and require human approval.
- [ ] Confirm no raw prompt or full model output is stored in audit events or assistant tables.

### Embedding And Search Smoke

- [ ] Run embedding for a mock document.
- [ ] Confirm `embedding_jobs` row is created.
- [ ] Confirm `document_embeddings` rows are created.
- [ ] Run semantic search for a mock finding.
- [ ] Confirm returned evidence candidates use safe source labels/citations.
- [ ] Confirm embeddings are not copied into assistant logs, audit metadata, browser payloads, or screenshots.

### AI Feature Smoke

- [ ] Run finding AI review for a mock finding.
- [ ] Confirm result is advisory only.
- [ ] Run root-cause classification for a mock finding.
- [ ] Confirm result is advisory only.
- [ ] Run recovery note draft for an approved mock finding.
- [ ] Confirm it does not auto-send, export a report, create an invoice, or claim legal conclusions.
- [ ] Run CFO summary for the mock workspace.
- [ ] Confirm totals match deterministic report/analytics values.
- [ ] Confirm dismissed/not-recoverable amounts are not displayed as recovery totals.
- [ ] Run Copilot read-only prompt.
- [ ] Confirm Copilot explains/suggests only unless a human confirms an action card.

Pass criteria:

- Gemini failures use deterministic safe fallbacks.
- Gemini outputs pass schema validation.
- Gemini cannot mutate leakage amounts.
- Gemini cannot approve findings or evidence.
- Gemini cannot export reports.
- Gemini cannot send emails.
- Gemini cannot create invoices.
- Logs contain safe summaries, prompt versions, route/tool refs, and entity refs only.

## Audit-Log Inspection Checklist

Inspect the app audit log UI and database rows after mock-pilot QA.

### Events To Verify

- [ ] Organization created.
- [ ] Workspace created.
- [ ] Member invited/added.
- [ ] Member role changed.
- [ ] Document uploaded.
- [ ] Extraction started/completed.
- [ ] Embedding started/completed.
- [ ] Reconciliation started/completed.
- [ ] Evidence candidate approved/rejected.
- [ ] Evidence item approved/removed.
- [ ] Finding status changed.
- [ ] Report generated/exported where applicable.
- [ ] Copilot action created.
- [ ] Copilot action confirmed.
- [ ] Copilot action executed or failed safely.
- [ ] AI review/root-cause/recovery-note/CFO-summary events where applicable.

### Database Inspection

Run:

```sql
select event_type, entity_type, entity_id, actor_user_id, metadata, created_at
from public.audit_events
order by created_at desc
limit 100;
```

Pass criteria:

- Events have actor user IDs where expected.
- Events have organization/workspace context where expected.
- Metadata includes safe IDs, counts, status names, route refs, prompt versions, and blocker names only.
- Metadata does not include raw contract text, raw invoice rows, raw usage rows, raw CSV, prompts, full model outputs, embeddings, secrets, tokens, auth headers, emails beyond safe user identity where already part of auth UI, or customer PII.

### Assistant Tables Inspection

Run:

```sql
select role, safe_summary, referenced_entities, ui_payload, created_at
from public.assistant_messages
order by created_at desc
limit 50;
```

```sql
select tool_name, status, input_refs, output_refs, result_summary, error_summary, created_at
from public.assistant_tool_calls
order by created_at desc
limit 50;
```

```sql
select action_type, status, target_entity_type, target_entity_id, payload_refs, result_refs, created_at
from public.assistant_actions
order by created_at desc
limit 50;
```

Pass criteria:

- Rows contain safe summaries and refs only.
- No raw contracts.
- No raw invoices.
- No raw CSV rows.
- No prompts.
- No full model output.
- No embeddings.
- No secrets or tokens.
- Action rows show pending/confirmed/executed/failed lifecycle and human confirmation fields where expected.

## Final Live Blockers

These remain blockers until checked off in the live environment:

- [ ] Supabase project is dedicated to LeakProof AI.
- [ ] Supabase migrations `001` through `010` are applied and verified.
- [ ] Supabase Auth Site URL and redirect URLs are configured for production and local development.
- [ ] `source-documents` storage bucket exists and is private.
- [ ] RLS is enabled on tenant tables.
- [ ] `LEAKPROOF_RATE_LIMIT_BACKEND=supabase` is configured for production.
- [ ] Vercel production env vars are configured.
- [ ] `pnpm env:check` passes with production env values.
- [ ] Production deploy succeeds.
- [ ] `APP_URL=<production-url> pnpm smoke` passes.
- [ ] Owner/admin/reviewer/member/viewer persona QA passes.
- [ ] Cross-tenant access checks pass.
- [ ] Mock audit confirms exact customer-facing total `USD 26,690`.
- [ ] Live Gemini smoke passes on mock data.
- [ ] Audit-log and assistant-log inspection passes.
- [ ] No real customer data has been uploaded before all checks pass.

## Final Decision Rule

If every item above passes:

- Status becomes live-pilot ready.
- Use only approved pilot data with explicit founder/customer permission.
- Continue to keep customer-facing outputs behind human approval.

If any item fails:

- Status remains pilot-ready after live setup.
- Do not upload real customer data.
- Fix the blocker and rerun the affected checklist plus the automated gates.
