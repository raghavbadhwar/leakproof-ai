# AGENTS.md — Codex Instructions for LeakProof AI

You are building **LeakProof AI**, a production-minded B2B revenue leakage recovery product.

## Mission

Build a secure web app that helps companies identify under-billing and missed contract entitlements by comparing contract terms, invoices, customer usage, seat counts, discounts, renewals, and commercial obligations.

The product must produce evidence-backed findings, not vague AI summaries.

## Read this first

Before making code changes, read these files:

1. `README.md`
2. `START_HERE_NON_TECHNICAL.md`
3. `docs/PRD.md`
4. `docs/TECHNICAL_ARCHITECTURE.md`
5. `docs/BUILD_PLAN_FOR_CODEX.md`
6. `docs/SECURITY_AND_COMPLIANCE.md`
7. relevant `.agents/skills/*/SKILL.md` files

## Local skills to use

Use the local skills in `.agents/skills/` as playbooks:

- `contract-term-extraction` — for extraction logic and prompt design.
- `revenue-reconciliation` — for deterministic leakage calculations.
- `evidence-pack-generation` — for evidence pack UI/export.
- `production-hardening` — for auth, tenant isolation, logging, and deployment quality.
- `nontechnical-founder-handoff` — for keeping the app usable by a non-technical founder.

## Product non-negotiables

1. **No hallucinated money.** Never create a financial finding unless it has source evidence.
2. **LLM extracts; code calculates.** Use AI to extract structured terms and explanations. Use deterministic TypeScript functions for money calculations.
3. **Every finding needs citations.** Store citation references to contract text/page/section and invoice/usage rows.
4. **Human approval required.** The app may draft invoice notes or emails, but must not send external communication or charge customers automatically without approval.
5. **Multi-tenant from day one.** Every organization’s data must be isolated.
6. **Security over cleverness.** Files may contain sensitive contracts and invoices.
7. **Audit trail.** Important actions must be logged.
8. **Do not build legal advice.** The app identifies commercial discrepancies and drafts operational evidence. It must not represent itself as legal advice.

## Target user

The user is a non-technical founder. Prefer simple UX and clear labels over developer-heavy flows. Build screens that can be demoed to a CFO in under 10 minutes.

## Recommended stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- Supabase Auth, Postgres, Storage, Row-Level Security
- OpenAI API / Agents SDK for extraction and evidence reasoning
- Vitest for unit tests
- Playwright for core user-flow tests when UI exists
- Zod for validation
- Stripe for billing when implemented
- Sentry or equivalent error monitoring when implemented

## Repository conventions

- Keep business logic in `src/lib/`.
- Keep deterministic leakage rules in `src/lib/leakage/`.
- Keep AI extraction code in `src/lib/agents/` or `src/server/agents/`.
- Keep API routes in `src/app/api/`.
- Keep database migrations in `supabase/migrations/`.
- Keep prompts in `prompts/`.
- Keep non-code docs in `docs/`.

## Testing commands

After implementing dependencies, maintain these commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

If a command cannot run because the project is not fully scaffolded yet, update `package.json` and document what remains.

## Definition of done for each task

A task is done only when:

- code compiles,
- tests are added or updated,
- no sensitive sample data is committed except the provided fake sample data,
- user-facing error states are handled,
- the non-technical founder can understand the screen or workflow,
- the final response explains what changed and which tests passed.

## Security rules

- Never log full contract contents, invoices, API keys, or customer PII.
- Never expose one tenant’s data to another tenant.
- Use server-side checks even if UI hides controls.
- Use environment variables for secrets.
- Validate every uploaded file type and size.
- Store extracted terms separately from raw documents.
- Record audit events for uploads, extraction jobs, findings approval, and exports.

## AI rules

- Prefer JSON schema outputs for extraction.
- Include confidence and citation fields for every extracted term.
- Mark uncertain terms as `needs_review` instead of guessing.
- Require deterministic reconciliation before creating a finding.
- Use eval fixtures in `sample-data/` and `docs/EVALUATION_PLAN.md`.

## Pull request / final response format

When you finish a Codex task, respond with:

1. Summary of changes.
2. Files changed.
3. Tests run and results.
4. Known limitations.
5. Next recommended task.

