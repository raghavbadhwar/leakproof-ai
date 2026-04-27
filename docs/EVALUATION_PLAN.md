# Evaluation Plan

The goal is not to make the AI sound smart. The goal is to make findings accurate, cited, and financially useful.

## Eval dataset

Use `sample-data/` first, then add anonymized real customer examples.

Current local fixtures:

- `sample-data/customer_alpha_*`: smallest single-customer parser/reconciliation fixture.
- `sample-data/mock-pilot/contracts.json`: multi-customer contract excerpts plus expected extraction terms validated against the production extraction schema.
- `sample-data/mock-pilot/invoices.csv`: invoice rows with customer metadata, service periods, discounts, seat quantities, and subscription fees.
- `sample-data/mock-pilot/usage.csv`: usage rows for API calls, active seats, and shipment events.
- `sample-data/mock-pilot/customer_metadata.csv`: customer segment, billing model, contract type, owner, domain, renewal, and contract value metadata.
- `sample-data/mock-pilot/expected_findings.json`: expected per-customer findings and the current mock-pilot total of USD 26,690.

Each eval case should include:

- contract text or PDF
- invoice CSV
- usage CSV
- expected extracted terms
- expected findings
- expected non-findings

## Extraction evals

Measure:

- term recall: did the model find the important commercial terms?
- term precision: did it avoid unsupported terms?
- citation quality: does the citation point to the right clause?
- confidence calibration: are uncertain clauses marked `needs_review`?

## Reconciliation evals

Measure:

- correct finding type
- correct amount
- correct currency
- correct customer
- correct period
- correct evidence rows
- no false finding when invoice matches contract

## Human review evals

Ask a finance person:

- Can they understand the finding in under 60 seconds?
- Do they trust the evidence?
- Would they send the draft email after light editing?
- What extra proof would they need?

## Required tests

- unit tests for each leakage rule
- parser tests for CSV ingestion
- extraction schema validation tests
- authorization tests for tenant boundaries
- end-to-end smoke test for demo flow

## Automated local gate

Fast unit/evaluation tests:

```bash
pnpm test:unit
```

Full local verification:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` runs Playwright against a local Next.js server. It covers the public landing page, login page, `/api/health`, signed-out `/app` auth handling, and a mocked authenticated audit shell across overview, uploads, findings, analytics, and reports.

Local smoke after starting the app:

```bash
APP_URL=http://localhost:3000 pnpm smoke
```

By default, smoke checks the app route, health endpoint, and the analytics API auth guard without requiring Supabase credentials. To exercise a seeded analytics workspace, provide `SMOKE_WORKSPACE_ID`, `SMOKE_ORGANIZATION_ID`, and `SMOKE_AUTH_TOKEN`; that mode expects the analytics endpoint to return `200`.

Live integration tests must be named `*.integration.test.ts` and should require `RUN_INTEGRATION=1` plus real service credentials. They are intentionally separate from `pnpm test:unit` and CI so local evaluation does not depend on Gemini or Supabase.

```bash
RUN_INTEGRATION=1 pnpm test:integration
```

Current live placeholders cover real Supabase Auth, real upload, real extraction, real embedding, and real report generation. They should be converted from placeholders to live tests only when a production-like Supabase project, seeded personas, and Gemini account are available.

## Quality gate before selling

Before charging a customer, the product must pass:

- 95%+ deterministic test pass rate on known evals
- 0 known cross-tenant access bugs
- every finding has citations
- every money amount has calculation details
- all external actions require human approval
