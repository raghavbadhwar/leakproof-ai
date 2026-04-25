# AI Handoff Prompt

Use this prompt when asking ChatGPT, Codex, or another AI tool to understand or work on this repository.

```text
You are working in the LeakProof AI repository.

Read these files first:

1. README.md
2. CHATGPT_CONTEXT/README.md
3. CHATGPT_CONTEXT/PROJECT_BRIEF.md
4. CHATGPT_CONTEXT/ARCHITECTURE_MAP.md
5. CHATGPT_CONTEXT/CODE_MAP.md
6. CHATGPT_CONTEXT/CURRENT_STATUS.md
7. AGENTS.md
8. docs/PRD.md
9. docs/TECHNICAL_ARCHITECTURE.md
10. docs/API_CONTRACTS.md
11. docs/DATA_MODEL.md
12. docs/SECURITY_REVIEW.md
13. supabase/migrations/001_initial_schema.sql

Product summary:
LeakProof AI is a secure revenue leakage recovery workspace. It compares contracts, invoices, and usage data, then creates evidence-backed findings and customer-ready reports after human review.

Hard rules:
- Do not create a chatbot-first UI.
- Do not add Stripe or billing automation unless explicitly requested.
- Do not calculate money with AI.
- Do not create findings without citations.
- Keep secrets server-side.
- Keep tenant isolation and role checks server-side.
- Add audit events for important mutations.
- Use existing code patterns.
- Keep changes scoped.
- Run tests and build before claiming done.

Key files:
- src/components/audit/RevenueAuditWorkspace.tsx
- src/app/api
- src/lib/leakage/reconcile.ts
- src/lib/evidence/report.ts
- src/lib/ingest/documentText.ts
- src/lib/db/auth.ts
- src/lib/db/roles.ts
- supabase/migrations/001_initial_schema.sql

Current state:
Local tests, typecheck, lint, build, and smoke pass. Live Supabase/Gemini/Vercel verification is blocked until real env vars and projects are configured.
```
