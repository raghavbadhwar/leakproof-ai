# Security and Compliance Checklist

Contracts and invoices are sensitive. Build trust from day one.

## MVP security requirements

- Supabase Auth enabled.
- Multi-tenant organization model.
- Row-Level Security on all tenant data tables.
- Server-side authorization checks on every API route.
- File type allowlist.
- File size limits.
- Magic-byte validation for PDFs, DOCX, PNG, and JPEG uploads.
- Security headers for CSP, clickjacking, content sniffing, referrer leakage, and browser permissions.
- Route-level throttling for upload, extraction, embedding, search, and reconciliation.
- Virus scanning when production volume justifies it.
- No secrets committed to repo.
- No raw contracts in logs.
- No invoice content in error messages.
- Audit events for uploads, extraction, reconciliation, status changes, and exports.
- Auth success/failure audit hooks before enterprise launch.
- Human approval before draft emails or invoice notes are used externally.

## AI safety requirements

- Use structured extraction schemas.
- Store confidence and citations.
- Mark uncertain output as `needs_review`.
- Do not use AI-generated calculations as final financial amounts.
- Do not present output as legal advice.
- Show source excerpts next to findings.

## Compliance posture

For the first paid customers, be honest:

- “We are not SOC 2 certified yet.”
- “We use encryption in transit and at rest through our infrastructure providers.”
- “We isolate customer workspaces by organization.”
- “We can sign a lightweight NDA.”
- “We can delete uploaded data after the audit if requested.”

## Data retention

Default MVP policy:

- uploaded files retained while workspace is active,
- extracted terms retained for product use,
- audit events retained for security,
- deletion available by request,
- customer data never used in demos without written permission.

## Red flags that block production launch

- RLS disabled on tenant tables.
- Any route accepts `organization_id` without checking membership.
- Raw document text appears in logs.
- The app displays findings without evidence.
- The app sends customer emails automatically.
- Uploads allow arbitrary executable files.
- Sensitive routes can be spammed without shared production rate limits.
