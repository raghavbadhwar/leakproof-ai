# QA Runbook

LeakProof uses this rule for every QA pass: LLM extracts, code calculates, human approves.

## Automated Commands

Run these before a paid pilot:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
```

For faster local iteration:

```bash
pnpm test:unit
pnpm test:e2e
```

Live Supabase and Gemini checks are intentionally separate from normal CI. They stay skipped unless the runner sets `RUN_INTEGRATION=1` and provides all required integration env vars:

```bash
RUN_INTEGRATION=1 pnpm test:integration
```

Required live integration env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_GENERATION_MODEL`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_DIMENSION`
- `INTEGRATION_OWNER_EMAIL`
- `INTEGRATION_OWNER_PASSWORD`
- `INTEGRATION_ORGANIZATION_ID`
- `INTEGRATION_WORKSPACE_ID`

If Playwright browsers are missing on a new machine, run:

```bash
pnpm exec playwright install chromium
```

## Manual Persona Checks

Run these against a production-like Supabase project with four real users:

Owner checklist:

- [ ] Can create an organization and workspace.
- [ ] Can invite users and change existing member roles.
- [ ] Cannot remove or demote the last remaining owner.
- [ ] Can upload contract, invoice CSV, usage CSV, and customer CSV fixtures.
- [ ] Can run extraction, embedding, reconciliation, semantic search, term review, finding review, evidence review, report generation, and report export.
- [ ] Can see audit events for important mutations.

Admin checklist:

- [ ] Can manage non-owner roles and invites.
- [ ] Cannot remove or demote the last owner.
- [ ] Can run the same audit workflow as owner: upload, extract, embed, reconcile, review terms/findings/evidence, and generate/export reports.
- [ ] Cannot bypass organization/workspace boundaries.

Reviewer checklist:

- [ ] Can upload approved test files.
- [ ] Can run extraction, embedding, reconciliation, semantic search, term review, finding review, evidence candidate approve/reject, and report generation.
- [ ] Cannot manage roles, remove members, or demote owners.
- [ ] Cannot export a report containing unapproved evidence.

Viewer checklist:

- [ ] Can view permitted workspace data, findings, analytics, and reports.
- [ ] Cannot upload files.
- [ ] Cannot run extraction, embedding, reconciliation, semantic search mutation flows, evidence approval, finding status changes, report export, role changes, or invite changes.
- [ ] Receives clear blocked/forbidden states without data leakage.

Cross-tenant checks:

- A user from one organization cannot read another organization's workspaces, documents, findings, analytics, evidence, or reports.
- A workspace ID from a different organization is rejected even when the user belongs to the requested organization.
- Service-role routes still require bearer auth, organization membership, workspace ownership, and the correct role.

## Expected Mock Leakage Total

The mock pilot fixture in `sample-data/mock-pilot/expected_findings.json` totals:

```text
USD 26,690
```

The seeded Playwright shell test also expects `USD 26,690.00` so the browser report/analytics surface has a stable known total without using real customer data.

## Mock Audit Checklist

- [ ] Use only files under `sample-data/mock-pilot`.
- [ ] Confirm all mock customers are linked by external ID, domain, name, or explicit customer assignment.
- [ ] Upload contracts, invoices, usage, and customer metadata fixtures.
- [ ] Run extraction and approve/edit the expected terms.
- [ ] Run reconciliation.
- [ ] Approve only evidence-backed findings.
- [ ] Generate the report or analytics surface.
- [ ] Confirm the customer-facing mock leakage total is `USD 26,690`.
- [ ] Confirm draft, needs-review, dismissed, not-recoverable, and unapproved-evidence findings do not inflate customer-facing totals.
- [ ] Confirm no real customer files or secrets were used.

## Screenshots Checklist

Capture desktop and mobile screenshots for:

- Public landing page.
- Login page.
- Signed-out `/app` auth-required state.
- Authenticated overview shell.
- Uploads page with contract, invoice, and usage fixture rows.
- Findings page with deterministic calculated leakage.
- Analytics page showing customer-facing totals separately from internal pipeline.
- Reports page showing only approved/customer-facing findings.
- Role-management page for owner/admin/reviewer/viewer permissions.
- Error state for missing Supabase browser env vars.

Do not capture screenshots that show raw contracts, invoice contents, prompts, model outputs, embeddings, service-role keys, Gemini keys, or customer PII.

## Data Safety Checks

- [ ] Use mock fixtures until live security checks pass.
- [ ] Do not place raw customer files, generated customer reports, or screenshots with customer data in Git.
- [ ] Confirm no secret appears in browser bundles, screenshots, logs, or `NEXT_PUBLIC_` env vars.
- [ ] Confirm system-created evidence starts as `suggested` and is not exported until reviewer-approved.
- [ ] Confirm customer-facing reports exclude unapproved evidence and internal-only findings.
