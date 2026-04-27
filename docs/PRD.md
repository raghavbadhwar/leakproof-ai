# Product Requirements Document - LeakProof AI

## 1. Product Summary

LeakProof AI is an AI-assisted revenue leakage recovery workspace for B2B companies. It reads contracts, invoices, and usage data, extracts commercial terms, calculates missed or at-risk revenue with deterministic rules, and produces evidence-backed findings that a human reviewer can approve before customer use.

This is not a chatbot-first product and not a CLM replacement. The product is an audit workspace for contract-to-cash leakage.

Core product principle: LLM extracts. Code calculates. Human approves.

## 2. Product Promise

Find revenue a company is already entitled to under signed contracts but failed to bill, collect, renew, escalate, or protect.

The product must turn messy commercial documents and billing exports into defensible finance actions:

- What did the contract say?
- What did the company invoice?
- What usage or seats actually happened?
- What revenue was missed, underbilled, or put at risk?
- What evidence supports the finding?
- What action should a finance reviewer take?

## 3. Problem

B2B companies often sell with non-standard commercial terms: minimum commitments, annual uplifts, usage allowances, seat pricing, discount expiries, renewal notice windows, amendments, and special billing notes.

Those terms live in contracts, PDFs, order forms, amendments, spreadsheets, email threads, or CLM tools. Billing data lives elsewhere: accounting tools, invoice exports, subscription systems, CRM objects, or manual spreadsheets. Finance teams do not have a reliable way to continuously reconcile contract obligations against invoices and usage.

The result is revenue leakage:

- usage overages never billed,
- seats or licenses undercounted,
- minimum commitments missed,
- discounts applied after expiry,
- annual uplifts forgotten,
- renewal notice windows missed,
- amendments interpreted inconsistently,
- customer recovery conversations delayed because evidence is scattered.

## 4. Target Customers

### Beachhead

B2B SaaS and tech-enabled services companies with usage, seat, retainer, minimum commitment, or custom pricing structures.

### Primary Buyers

- Founder or CEO at a growing B2B company.
- CFO or finance lead.
- RevOps lead.
- Head of Operations.

### Primary Operators

- Finance associate.
- Billing manager.
- RevOps manager.
- Customer success operations manager.
- Controller or fractional CFO.

### Secondary Users

- Account managers preparing customer recovery conversations.
- Legal or contracts reviewer validating contract interpretation.
- Customer success leader tracking renewal and notice risk.

## 5. Positioning

Not: AI contract management.

Not: invoice automation.

Not: legal advice.

Instead: AI revenue recovery from contracts, invoices, and usage data.

Suggested taglines:

- Find the revenue your contracts already earned.
- Stop under-billing customers you already serve.
- Contract-to-cash leakage recovery for modern finance teams.

## 6. Full Product Scope

LeakProof AI must support the complete contract-to-cash audit lifecycle:

1. Bring in contracts and billing data.
2. Extract structured commercial terms with citations.
3. Let a human reviewer approve or correct extracted terms.
4. Normalize invoice and usage records.
5. Run deterministic reconciliation rules.
6. Generate leakage, prevention, and risk findings.
7. Attach and approve evidence.
8. Review finding status and recovery notes.
9. Export customer-ready reports.
10. Track actions, exports, and decisions in an audit log.
11. Repeat audits across customers, workspaces, and eventually direct integrations.

## 7. Core User Flows

### 7.1 First Audit Setup

1. User lands on the public site.
2. User reads positioning, pricing, and onboarding requirements.
3. User signs in with Supabase Auth.
4. User creates or selects an organization.
5. User creates an audit workspace.
6. User uploads source files.
7. App validates files and stores them in tenant-scoped storage.
8. App parses documents and normalizes CSV rows.

### 7.2 Contract Term Extraction And Review

1. User selects a contract document.
2. User runs AI extraction.
3. Gemini extracts structured commercial terms.
4. App validates output with schemas.
5. App stores term value, original value, confidence, model metadata, and citation.
6. Reviewer approves, edits, rejects, or marks each term as needs review.
7. Only approved or edited terms are eligible for reconciliation.

### 7.3 Revenue Reconciliation

1. User runs reconciliation after terms and billing data are ready.
2. Deterministic rules compare approved terms with invoice and usage records.
3. App generates findings with title, summary, amount, confidence, status, calculation, and citations.
4. Reviewer opens finding details.
5. Reviewer approves, dismisses, marks needs review, marks customer-ready, marks recovered, or marks not recoverable.

### 7.4 Evidence Workflow

1. User embeds workspace documents for semantic search.
2. User searches for evidence related to a finding.
3. App returns tenant-scoped document chunks.
4. Reviewer attaches search results as evidence candidates.
5. Reviewer approves or rejects candidates.
6. Approved evidence becomes part of the finding and report.

### 7.5 Customer-Ready Reporting

1. Reviewer approves findings.
2. User generates a customer-ready report.
3. Report includes approved recoverable amounts, prevented leakage, risk items, top findings, and methodology.
4. User copies, downloads JSON, or prints to PDF.
5. Export actions are audit logged.

### 7.6 Autopilot Audit

1. User enables autonomous mode.
2. User accepts a warning that output requires review.
3. Agent embeds files, runs extraction, flags low-confidence terms, runs reconciliation, suggests evidence, and drafts a report.
4. Agent leaves customer-facing decisions to the human reviewer.
5. User reviews terms, findings, evidence, and report before use.

## 8. Functional Requirements

### 8.1 Public Site

- Explain the product clearly as revenue leakage recovery.
- Provide pricing structure for manual audits and future monitoring.
- Provide audit request contact path.
- Provide onboarding checklist for required inputs.

### 8.2 Authentication And Tenant Model

- Support Supabase Auth password and magic-link sign-in.
- Require authentication for the app workspace.
- Scope data by organization and workspace.
- Support roles: `owner`, `admin`, `reviewer`, `member`, `viewer`.
- Restrict workflow mutations to allowed roles.
- Prevent privilege escalation and last-owner lockout.
- Enforce access checks server-side, not only in the UI.

### 8.3 Workspace Management

- Create organizations.
- List organizations available to the user.
- Create audit workspaces.
- List and select workspaces.
- Track workspace status: `draft`, `processing`, `ready`, `error`, `archived`.
- Show workspace-level metrics: documents, exposure, open findings, approved findings.

### 8.4 Upload And Ingestion

- Accept contracts as TXT, DOCX, text-based PDF, scanned PDF, or contract images where supported.
- Accept invoice CSVs.
- Accept usage or seat CSVs.
- Support customer CSVs in the full product.
- Validate file type and size.
- Store source files in private organization/workspace paths.
- Extract text and chunk documents for citations.
- Normalize invoice and usage rows.
- Preserve row-level citations for CSV-derived records.
- Track parse, chunking, and embedding status.

### 8.5 AI Extraction

- Use Gemini only server-side.
- Extract structured terms with citations and confidence.
- Validate AI output before storage.
- Track provider, model, prompt version, run status, and errors.
- Preserve original AI output separately from human-edited values.
- Flag low-confidence or ambiguous terms for review.
- Never use AI output directly for money calculation without human-approved structured terms.

Required term types include:

- customer name,
- contract start date,
- contract end date,
- renewal terms,
- notice period,
- base fee,
- seat price,
- committed seats,
- usage allowance,
- overage price,
- minimum commitment,
- discount percentage,
- discount expiry date,
- annual price uplift,
- payment terms,
- amendment/supersession notes,
- special billing notes.

### 8.6 Reconciliation Rules

The engine must calculate money in code using integer minor units and currency codes.

Current and required finding categories:

- minimum commitment shortfall,
- usage overage unbilled,
- seat underbilling,
- expired discount still applied,
- missed annual uplift,
- renewal or notice window risk,
- amendment conflict risk,
- payment terms mismatch,
- invoice amount below contract-required billing schedule,
- committed seats versus actual seats mismatch,
- special billing note review item.

Full-product reconciliation must become period-aware. It should compare contract terms, usage, and invoices by customer, contract, billing period, currency, and effective date rather than only by customer-level totals.

### 8.7 Findings

Each finding must include:

- finding type,
- outcome type: `recoverable_leakage`, `prevented_future_leakage`, or `risk_alert`,
- severity,
- customer,
- title,
- summary,
- detailed explanation when available,
- estimated amount in minor units,
- currency,
- confidence,
- status,
- calculation JSON,
- recommended action,
- source citations,
- evidence coverage status,
- reviewer note,
- review timestamps.

Finding statuses:

- `draft`,
- `needs_review`,
- `approved`,
- `dismissed`,
- `customer_ready`,
- `recovered`,
- `not_recoverable`.

### 8.8 Evidence

- Generate document chunks from source files.
- Embed chunks with Gemini embeddings.
- Search evidence by workspace and organization.
- Attach semantic results as evidence candidates.
- Let reviewers approve, reject, and remove evidence.
- Keep evidence candidates separate from approved evidence items.
- Track evidence coverage: `pending`, `complete`, `weak`, `conflicting`.
- Reports must use reviewer-approved evidence only. System-created reconciliation evidence starts as `suggested` and is excluded from customer-facing exports until approved by a reviewer.
- Recoverable money findings must have approved contract evidence, approved invoice or usage evidence, a deterministic formula, and input values before export.
- Risk-only findings may export with approved contract-only evidence, but the report must label them as risk-only.

### 8.9 Reports

Reports must include:

- organization name,
- workspace name,
- generation timestamp,
- total potential leakage,
- total approved recoverable leakage,
- prevented future leakage,
- risk-only items,
- findings by category,
- findings by status,
- top findings,
- methodology note,
- approved evidence references.

Export requirements:

- copy report text,
- JSON download,
- browser print/PDF,
- export audit event,
- future branded PDF template,
- future evidence appendix.

### 8.10 Autopilot

Autopilot may:

- check workspace readiness,
- embed documents,
- run extraction,
- approve only high-confidence terms into a provisional reviewed state,
- flag low-confidence terms,
- run deterministic reconciliation,
- approve high-confidence findings with caution notes,
- flag uncertain findings,
- suggest evidence candidates,
- draft a report.

Autopilot must not:

- send customer emails,
- create invoices,
- mark customer recovery as complete,
- bypass human approval,
- hide uncertainty,
- make legal conclusions.

### 8.11 Audit Log

Audit events must be written for:

- organization and workspace creation,
- uploads,
- extraction runs,
- term review changes,
- reconciliation runs,
- finding status changes,
- evidence candidate decisions,
- evidence removal,
- report generation and export,
- role changes,
- security-sensitive failures where useful without exposing secrets.

Audit metadata must avoid raw contract text, invoice row dumps, embeddings, prompts, API keys, tokens, and model responses.

## 9. Non-Functional Requirements

### Security

- Keep all secrets server-side.
- Never expose Supabase service-role key or Gemini key to the browser.
- Enforce tenant isolation through API checks and RLS.
- Use private storage buckets.
- Redact sensitive customer data from logs.
- Do not auto-send external customer communications.

### Reliability

- Track run status for extraction, embeddings, reconciliation, and reports.
- Surface useful errors to operators.
- Avoid duplicate or stale findings after reruns.
- Make calculations repeatable.
- Preserve source evidence for every customer-facing claim.

### Performance

- Initial upload-first workflow should handle small and mid-sized audits.
- Long-running AI and embedding operations should move to background jobs before heavier production use.
- Semantic search should use pgvector indexes and scoped match functions.

### Compliance

- Provide clear non-legal-advice positioning.
- Support customer data deletion and retention policies before broader production rollout.
- Prepare for SOC 2 controls if selling to larger finance teams.

## 10. Data Model Requirements

Core entities:

- organizations,
- organization_members,
- audit_workspaces,
- customers,
- source_documents,
- document_chunks,
- ai_jobs,
- embedding_jobs,
- document_embeddings,
- semantic_search_logs,
- extraction_runs,
- contract_terms,
- invoice_records,
- usage_records,
- reconciliation_runs,
- leakage_findings,
- evidence_candidates,
- evidence_items,
- evidence_packs,
- audit_events.

The data model must support:

- organization-level tenant boundaries,
- workspace-level audit boundaries,
- customer-to-contract linkage,
- source document provenance,
- citation-backed extraction,
- deterministic recalculation,
- human review history,
- report export history.

## 11. Business Model

### Initial Wedge

Founder-led audits with manual onboarding:

- starter audit: USD 1,500 to 3,000,
- optional success fee: 5 to 10 percent of verified recoverable leakage,
- monitoring quoted after the first audit.

### Expansion

- recurring monitoring subscription,
- per-workspace or per-customer audit pricing,
- success-fee hybrid,
- enterprise tier for SSO, retention, direct integrations, and custom controls.

## 12. Success Metrics

### Product Outcome Metrics

- Total recoverable revenue identified.
- Total approved recoverable revenue.
- Total recovered revenue.
- Prevented future leakage.
- Number of approved findings.
- False-positive rate.
- Average time from upload to first finding.
- Average time from finding to customer-ready report.

### Trust Metrics

- Percentage of findings with approved evidence.
- Percentage of findings marked `needs_review`.
- Percentage of customer-ready findings later marked recovered.
- Customer-reported accuracy.
- Number of security or access-control incidents.

### Business Metrics

- Audit request conversion rate.
- Audit-to-paid conversion rate.
- Success fee collected.
- Subscription conversion after first audit.
- Gross retention.
- Net revenue retention.
- Customer acquisition cost.

## 13. Current Implementation Snapshot

The current repo already includes:

- public landing, pricing, onboarding, contact, and login pages,
- authenticated audit workspace,
- organization and workspace creation,
- role management,
- uploads for contracts, invoice CSVs, and usage CSVs,
- document parsing, chunking, embeddings, and semantic search foundations,
- server-side Gemini extraction and embedding boundaries,
- term review,
- invoice and usage record views,
- deterministic reconciliation rules,
- findings review,
- evidence candidates and approved evidence items,
- report generation and export,
- autopilot workflow with explicit caution controls,
- audit logging foundations,
- Supabase schema, RLS policies, and storage policies,
- tests, typecheck, lint, build, env check, and smoke-test scripts.

Known gaps before customer-facing production sign-off:

- real Supabase project and migrations,
- real RLS persona test with owner/admin/reviewer/member/viewer,
- real Gemini extraction and embedding verification,
- customer-contract mapping in the main UI,
- period-aware reconciliation,
- payment terms mismatch rule,
- rerun idempotency and stale finding handling,
- production deployment smoke test,
- browser QA across the core workflow,
- stronger settings and audit-log surfaces,
- branded PDF evidence pack.

## 14. Acceptance Criteria

The full app is ready for first controlled customer audits when:

- a user can sign in and create an organization/workspace,
- source files upload into private tenant-scoped storage,
- contracts are parsed or processed by the selected Gemini path,
- contract terms extract with citations and confidence,
- reviewers can approve, edit, reject, or flag terms,
- invoice and usage rows normalize correctly,
- reconciliation produces deterministic findings from approved terms only,
- every customer-ready finding has approved evidence,
- report export includes approved findings only,
- role restrictions hold for owner/admin/reviewer/member/viewer,
- audit events capture key workflow decisions,
- local tests, typecheck, lint, and build pass,
- Supabase migrations pass against the real project,
- deployed smoke test passes,
- one complete audit runs from upload to report export with real credentials.

## 15. Non-Goals

LeakProof AI should not become:

- a full CLM replacement,
- a contract drafting or redlining tool,
- a legal advice product,
- an automatic invoice sender,
- an automatic collections tool,
- a general chatbot over contracts,
- a system that sends customer-facing claims without human review,
- a broad BI dashboard before the audit workflow is proven.

## 16. Roadmap

### Phase 1 - Upload-Based Audit

- Polish upload, extraction, review, reconciliation, evidence, and report flow.
- Verify live Supabase, Gemini, and Vercel setup.
- Run first founder-led audits with controlled customers.

### Phase 2 - Finance-Grade Accuracy

- Add customer-contract linkage.
- Add period-aware reconciliation.
- Add payment terms mismatch.
- Add rerun idempotency.
- Improve evidence coverage and conflict detection.
- Build branded PDF reports.

### Phase 3 - Repeatable Monitoring

- Add scheduled audits.
- Add portfolio reporting.
- Add reviewer queue.
- Add Slack/email approval workflow.
- Add customer recovery pipeline tracking.

### Phase 4 - Integrations And Enterprise

- Add QuickBooks/Xero first.
- Add HubSpot/Salesforce.
- Add Chargebee/Recurly/Stripe Billing.
- Add DocuSign/Ironclad/Google Drive.
- Add SSO, retention controls, admin settings, and SOC 2 readiness.
