# Start Here — Non-Technical Founder Guide

You do not need to code. Your job is to give Codex clear tasks, review the app visually, and test whether customers understand the outcome.

## Step 1 — Create the project repo

1. Create a new private GitHub repository named `leakproof-ai`.
2. Upload every file from this pack into that repository.
3. Connect the repository to Codex.
4. Tell Codex to read `AGENTS.md`, `docs/PRD.md`, and `docs/BUILD_PLAN_FOR_CODEX.md` before editing code.

## Step 2 — Run Codex in small phases

Do not ask Codex to build the whole company in one instruction. Use the tasks in this order:

1. `docs/CODEX_TASKS.md` → Task 01: repo setup and dependency verification.
2. Task 02: database/auth/storage.
3. Task 03: upload flow.
4. Task 04: contract extraction.
5. Task 05: reconciliation engine.
6. Task 06: findings dashboard.
7. Task 07: evidence pack generation.
8. Task 08: customer demo polish.
9. Task 09: security hardening.
10. Task 10: production deployment checklist.

## Step 3 — What you should manually test

Use the sample data in `sample-data/`.

The demo should let you:

1. create an account,
2. create an organization,
3. upload a contract file,
4. upload invoice CSV,
5. upload usage CSV,
6. run extraction,
7. run reconciliation,
8. see at least one finding,
9. open the evidence pack,
10. approve or dismiss the finding.

## Step 4 — What “ready to sell” means

The first sellable version does not need every integration. It needs:

- upload-based workflow,
- credible extracted terms,
- citations to source documents,
- deterministic calculations,
- a clean dashboard,
- exportable evidence pack,
- human approval,
- secure tenant separation,
- working billing page or manual invoicing process.

## Step 5 — First offer to sell

Use this offer:

> “We run an AI-assisted revenue leakage audit on your contracts, invoices, and usage data. If we do not find recoverable or preventable leakage, you do not pay the audit fee.”

Suggested early pricing:

- Starter audit: USD 1,500–3,000
- Success fee: 5–10% of verified recoverable revenue, capped for trust
- Software after audit: USD 399–1,999/month depending on contract volume

## Step 6 — First 20 prospects

Target:

- B2B SaaS founders at 20–200 employees
- CFOs at SaaS companies with usage-based pricing
- RevOps leaders
- finance leads at agencies and IT services firms
- MSPs and reseller businesses

Outreach angle:

> “I am not selling another AI chatbot. I am offering to find billing leakage hiding inside your contracts and invoices.”

## Do not skip this

Get real messy data from 3–5 companies before building advanced integrations. The product moat comes from learning the real leakage patterns, not from beautiful UI.

