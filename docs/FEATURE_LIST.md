# Feature List - LeakProof AI

LeakProof AI is a contract-to-cash revenue leakage recovery workspace. The product helps finance, RevOps, and founders turn contracts, invoices, and usage exports into evidence-backed recovery findings.

Product principle: LLM extracts. Code calculates. Human approves.

## Feature Status Legend

- `Implemented`: present in the current app codebase.
- `Partially implemented`: foundations exist, but the end-to-end customer-grade version still needs hardening or live verification.
- `Planned`: product requirement for the full app, not yet built in the current repo.
- `Not planned`: intentionally excluded from the product boundary.

## 1. Public Website And Conversion

| Feature | Status | Notes |
| --- | --- | --- |
| Landing page | Implemented | Explains LeakProof AI as revenue leakage recovery, not general contract management. |
| Pricing page | Implemented | Manual audit pricing, success option, and quoted monitoring. |
| Contact page | Implemented | Email-based request flow for founder-led audit setup. |
| Onboarding checklist | Implemented | Lists required contracts, invoice exports, usage exports, and finance reviewer. |
| Product positioning | Implemented | Focused on contract-backed revenue recovery for finance teams. |
| Self-serve checkout | Planned | Not included; first audits are manually sold and onboarded. |
| Lead capture CRM integration | Planned | Useful after repeatable audit demand is proven. |

## 2. Authentication And Access

| Feature | Status | Notes |
| --- | --- | --- |
| Supabase Auth sign-in | Implemented | Password and magic-link sign-in surface exists. |
| Auth-gated workspace | Implemented | `/app` requires a signed-in session. |
| Organization membership | Implemented | Users operate inside organizations. |
| Role model | Implemented | `owner`, `admin`, `reviewer`, `member`, and `viewer`. |
| Role management UI | Implemented | Owners/admins can change member roles from the app. |
| Role-gated workflow mutation | Implemented | Review and mutation actions are restricted to privileged roles. |
| Last-owner protection | Partially implemented | Required for production; keep covered in live RLS/persona testing. |
| SSO/SAML | Planned | Needed for enterprise buyers later. |
| Fine-grained workspace-level roles | Planned | Useful when one organization runs many audit programs. |

## 3. Organization And Workspace Management

| Feature | Status | Notes |
| --- | --- | --- |
| Create organization | Implemented | Users can create an organization from the workspace overview. |
| Create audit workspace | Implemented | Workspaces scope a single audit project. |
| Select active organization/workspace | Implemented | Header selectors control the active context. |
| Workspace status model | Implemented | `draft`, `processing`, `ready`, `error`, `archived`. |
| Workspace dashboard metrics | Implemented | Exposure, open findings, approved findings, document count. |
| Multi-workspace audit portfolio | Partially implemented | Multiple workspaces exist; portfolio-level reporting is planned. |
| Workspace templates | Planned | Future shortcut for SaaS, services, usage-based, and retainer audits. |

## 4. Source Data Ingestion

| Feature | Status | Notes |
| --- | --- | --- |
| Contract upload | Implemented | Supports PDF, DOCX, TXT, and image MIME types through configured storage rules. |
| Invoice CSV upload | Implemented | Normalizes invoice rows for reconciliation. |
| Usage CSV upload | Implemented | Normalizes usage or seat metrics. |
| Customer CSV document type | Partially implemented | Schema and validation recognize it; main UI flow is still centered on contract/invoice/usage. |
| File validation | Implemented | Type and size validation exist before persistence. |
| Tenant-scoped storage paths | Implemented | Source files are stored under organization/workspace paths. |
| Text extraction and chunking | Implemented | Creates citation-ready document chunks. |
| Scanned PDF/image ingestion | Partially implemented | Server-side Gemini multimodal extraction path is implemented, including low-confidence blocking, but production use still needs live Gemini credentials and representative scanned-file QA. |
| Duplicate file detection | Planned | Use hashes to avoid duplicate source records and stale reruns. |
| Direct integrations | Planned | QuickBooks/Xero, HubSpot/Salesforce, Chargebee/Recurly, DocuSign/Ironclad, Google Drive. |

## 5. AI Extraction

| Feature | Status | Notes |
| --- | --- | --- |
| Gemini contract extraction | Implemented | Server-side AI extraction creates structured terms. |
| Prompt templates | Implemented | Prompts live outside UI code. |
| Zod validation | Implemented | AI output is schema-validated before use. |
| Extraction run tracking | Implemented | Provider, model, prompt version, status, and term count are stored. |
| Original vs edited value preservation | Implemented | Contract terms store original and reviewed values. |
| Confidence scoring | Implemented | Terms include confidence for review decisions. |
| Citation capture | Implemented | Extracted terms carry source citation data. |
| Low-confidence review routing | Implemented | Terms can be marked `needs_review`. |
| Multi-contract amendment reasoning | Partially implemented | Amendment conflict risk exists; fuller contract hierarchy handling is planned. |
| Extraction evaluation dataset | Implemented | Synthetic evaluation data exists. |
| Live model quality benchmark | Planned | Needs real customer-like contracts and expected outputs. |

## 6. Human Review

| Feature | Status | Notes |
| --- | --- | --- |
| Contract term review | Implemented | Reviewers can approve, edit, mark needs review, or reject terms. |
| Finding status review | Implemented | Findings support draft, needs review, approved, dismissed, customer-ready, recovered, not recoverable. |
| Reviewer notes | Implemented | Finding review notes and term reviewer fields exist. |
| Human approval before customer-facing output | Implemented | Reports are based on customer-facing finding statuses and reviewer-approved evidence; system-created evidence starts as suggested. |
| Evidence candidate review | Implemented | Candidates can be approved into evidence or rejected. |
| Dedicated audit queue | Planned | A reviewer inbox across workspaces is not yet a separate product surface. |
| Escalation workflow | Planned | Legal/finance escalation routing is a later workflow. |

## 7. Reconciliation And Finance Logic

| Feature | Status | Notes |
| --- | --- | --- |
| Deterministic reconciliation engine | Implemented | TypeScript rules calculate leakage, not the LLM. |
| Integer money math | Implemented | Money is represented in minor units with currency codes. |
| Minimum commitment shortfall | Implemented | Compares approved minimum commitment against invoice totals. |
| Usage overage unbilled | Implemented | Compares allowance, overage price, usage, and billed overage rows. |
| Seat underbilling | Implemented | Compares observed seat usage to billed seat quantities. |
| Expired discount still applied | Implemented | Flags post-expiry discount invoice rows. |
| Missed annual uplift | Implemented | Checks post-anniversary invoice pricing against uplift terms. |
| Renewal/notice window risk | Implemented | Creates risk findings around upcoming or missed notice deadlines. |
| Amendment conflict risk | Implemented | Flags later amendments that may supersede approved terms. |
| Payment terms mismatch | Implemented | Creates a risk finding when approved contract payment terms differ from invoice terms detected from structured fields or invoice line text. |
| Period-aware reconciliation | Implemented | Current money rules reconcile inside monthly, quarterly, annual, or one-time billing periods instead of letting another period offset a shortfall. |
| Customer-contract linkage workflow | Implemented | Upload metadata, CSV customer fields, domain/name matching, extracted customer names, customer APIs, and document assignment APIs link contracts, invoices, usage, and findings to customer accounts. |
| Rerun idempotency and stale finding handling | Implemented | Extraction and reconciliation use run versions, logical keys, staged rows, active/superseded promotion, and tests to avoid doubled report totals. |

## 8. Evidence And Semantic Search

| Feature | Status | Notes |
| --- | --- | --- |
| Document chunk embeddings | Implemented | Gemini embeddings and pgvector storage are available server-side. |
| Tenant-scoped semantic search | Implemented | Search is limited to organization/workspace context. |
| Evidence candidate creation | Implemented | Search results can be attached to findings as candidates. |
| Candidate approval/rejection | Implemented | Reviewer controls what becomes approved evidence. |
| Evidence item removal | Implemented | Reviewers can remove attached evidence. |
| Evidence coverage status | Implemented | Findings track pending, complete, weak, or conflicting evidence. |
| Citation-backed evidence pack | Implemented | Findings and reports include structured evidence references. |
| Conflicting evidence workflow | Planned | Full workflow should surface contradictions, not just weak coverage. |
| Evidence quality scoring | Planned | Add checks for source type, recency, exactness, and completeness. |

## 9. Reports And Exports

| Feature | Status | Notes |
| --- | --- | --- |
| Customer-ready report generation | Implemented | Generates executive report JSON from customer-facing findings that pass approved-evidence export rules. |
| Report summary metrics | Implemented | Total potential leakage, approved recoverable, prevented leakage, risk-only items. |
| Top findings | Implemented | Customer-ready report includes the most important findings. |
| Copy report | Implemented | Copies report text and records export event. |
| JSON export | Implemented | Downloads structured report JSON. |
| Print/PDF export | Implemented | Uses browser print as PDF path. |
| Export audit event | Implemented | Export actions are recorded. |
| Branded PDF template | Planned | Needed for polished customer delivery. |
| Evidence appendix | Planned | Full report should include a defensible appendix per finding. |
| Board/CFO summary view | Planned | Higher-level portfolio report across multiple audits. |

## 10. Autopilot And Workflow Agent

| Feature | Status | Notes |
| --- | --- | --- |
| Audit phase planner | Implemented | Plans next phase from workspace state. |
| Guardrail language | Implemented | LLM extracts, code calculates, human approval required. |
| Autopilot UI | Implemented | Dedicated page with consent, caution, and visible log. |
| Autonomous extraction/reconciliation run | Implemented | Can embed, extract, classify confidence, reconcile, suggest evidence, and draft report. |
| Human consent before autopilot | Implemented | Autopilot requires explicit opt-in and caution acknowledgement. |
| Automatic customer action | Not planned | The app must not auto-send customer emails or invoices. |
| Background job runner | Planned | Current workflow is request-driven; production should use queue-backed jobs. |
| Agent activity replay | Planned | Full app should show exactly what the agent did and why. |

## 11. Audit Log, Security, And Compliance

| Feature | Status | Notes |
| --- | --- | --- |
| Audit event table | Implemented | Important workflow/security actions are recorded. |
| Audit log page | Partially implemented | Route exists; full dedicated event explorer is still thin. |
| Row-Level Security policies | Implemented | Tenant tables and storage bucket policies are defined. |
| Server-side secret handling | Implemented | Gemini and service-role keys are server-side only. |
| Workspace ownership checks | Implemented | API routes enforce organization and workspace scope. |
| Redaction boundaries | Implemented | Product docs and helper code prohibit logging raw sensitive data. |
| Security review docs | Implemented | Dedicated security documentation exists. |
| SOC 2 program | Planned | Future enterprise requirement. |
| Data retention controls | Planned | Needed for production contracts and invoices. |
| Customer data deletion workflow | Planned | Required before broader customer rollout. |

## 12. Admin, Settings, And Operations

| Feature | Status | Notes |
| --- | --- | --- |
| Settings page | Partially implemented | Route exists; deeper org/app configuration is planned. |
| Health endpoint | Implemented | Public health route exists for smoke testing. |
| Environment checker | Implemented | Validates required Supabase, Gemini, and app URL envs. |
| Production gate script | Implemented | Chains env check, tests, typecheck, lint, and build. |
| Deployment docs | Implemented | Vercel and Supabase setup docs exist. |
| Error monitoring integration | Planned | Sentry DSN is optional; full alerting still needs setup. |
| Admin job dashboard | Planned | Needed for extraction/embedding/reconciliation job operations. |

## 13. Data Model And APIs

| Feature | Status | Notes |
| --- | --- | --- |
| Organizations API | Implemented | Create/list organization context. |
| Members API | Implemented | List/change organization members and roles. |
| Workspaces API | Implemented | Create/list audit workspaces. |
| Documents API | Implemented | Upload/list source documents. |
| Extraction API | Implemented | Run AI extraction for a document. |
| Terms API | Implemented | List and review contract terms. |
| Invoice/usage APIs | Implemented | List normalized source rows. |
| Reconciliation API | Implemented | Run deterministic finding generation. |
| Findings APIs | Implemented | List details, update status, and build evidence pack. |
| Evidence APIs | Implemented | Candidate attach/review and evidence item removal. |
| Report/export APIs | Implemented | Generate and mark reports exported. |
| OpenAPI document | Implemented | Human and OpenAPI-style docs exist. |
| External public API | Planned | Useful after internal workflow stabilizes. |

## 14. Testing And Verification

| Feature | Status | Notes |
| --- | --- | --- |
| Unit tests | Implemented | Covers extraction schemas, reconciliation, evidence, uploads, embeddings, auth, status. |
| Typecheck | Implemented | Strict TypeScript verification. |
| Lint | Implemented | ESLint configured. |
| Production build | Implemented | Next build is part of verification. |
| Smoke test | Implemented | Checks app and health route against a running build. |
| Browser persona QA | Planned | Owner/admin/reviewer/viewer flows need real environment screenshots. |
| Live Gemini extraction verification | Planned | Requires real API key and representative contracts. |
| Live Supabase RLS verification | Planned | Requires linked Supabase project and users. |
| Production deployment smoke | Planned | Requires Vercel project and production env vars. |

## 15. Full-App Future Scope

These features belong to the end-state product but should not distract from the current upload-first audit wedge.

- Native accounting integrations: QuickBooks, Xero, NetSuite.
- CRM integrations: HubSpot, Salesforce.
- Billing/subscription integrations: Chargebee, Recurly, Stripe Billing.
- CLM/document integrations: DocuSign, Ironclad, Google Drive, SharePoint.
- Slack/email approval workflows.
- Portfolio-level leakage monitoring across all customers.
- Scheduled recurring audits.
- Customer-specific recovery playbooks.
- Branded PDF evidence packs.
- Revenue recovery pipeline tracking.
- Finance-controller review queue.
- Enterprise SSO, retention, and compliance controls.
- SOC 2 readiness package.
