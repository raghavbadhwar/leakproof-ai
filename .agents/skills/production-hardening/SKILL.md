---
name: production-hardening
description: Harden LeakProof AI for secure production use with tenant isolation, validation, logging, and deployment checks.
---

# Production Hardening Skill

Use this skill before any production or customer demo deployment.

## Critical checks

- Auth required for private routes.
- Organization membership checked server-side.
- RLS enabled on all tenant tables.
- File uploads validated by type and size.
- Storage paths are tenant-scoped.
- No secrets in client bundle.
- No raw contract text in logs.
- Errors are user-friendly but not data-leaking.
- AI job rate limits exist.
- Audit events are written.
- Manual approval exists before external action.

## API route pattern

Every API route should:

1. authenticate user,
2. validate input with Zod,
3. verify organization/workspace membership,
4. perform action,
5. write audit event if important,
6. return safe response.

## Logging rule

Log IDs and status. Do not log contracts, invoice rows, full prompts, API keys, or customer PII.

## Deployment rule

Production deployment must have:

- `OPENAI_API_KEY`
- Supabase URL/key variables
- Stripe keys if billing enabled
- Sentry DSN if monitoring enabled
- secure storage bucket policies
- database migrations applied
- smoke test completed

