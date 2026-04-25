# ChatGPT Context Entry Point

This folder exists so ChatGPT or another AI reader can scan the repository and quickly understand what LeakProof AI is, how it is structured, what is complete, and where to make changes safely.

Read these files in order:

1. `PROJECT_BRIEF.md`
2. `ARCHITECTURE_MAP.md`
3. `CODE_MAP.md`
4. `CURRENT_STATUS.md`
5. `AI_HANDOFF_PROMPT.md`

Then inspect:

1. `../README.md`
2. `../docs/PRD.md`
3. `../docs/TECHNICAL_ARCHITECTURE.md`
4. `../docs/API_CONTRACTS.md`
5. `../docs/DATA_MODEL.md`
6. `../supabase/migrations/001_initial_schema.sql`
7. `../src/components/audit/RevenueAuditWorkspace.tsx`
8. `../src/app/api`
9. `../src/lib`

## One-Sentence Summary

LeakProof AI is a secure revenue leakage recovery workspace that turns contracts, invoices, and usage data into evidence-backed, human-approved findings and customer-ready reports.

## Non-Negotiables

- No hallucinated money.
- AI extracts and retrieves; deterministic TypeScript calculates.
- Every finding needs evidence.
- Human approval is required before customer-facing use.
- Multi-tenant access control is required.
- Secrets stay server-side.
- Important actions are audit logged.
- The product does not provide legal advice.
