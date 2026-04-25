# Product Requirements Document — LeakProof AI

## 1. Product name

LeakProof AI

## 2. Category

AI revenue leakage recovery and contract-to-cash audit software.

## 3. Customer promise

Find money a company is entitled to under its contracts but failed to bill, collect, or act on.

## 4. Main customer pain

Many companies have signed contracts with pricing terms, annual uplifts, discounts, minimum commitments, usage overages, renewal windows, and service obligations. Those terms often live in PDFs, email threads, or CLM tools, while invoices are generated from spreadsheets, accounting tools, billing systems, or manual processes. The result is leakage: money that should have been invoiced, adjusted, renewed, or claimed but was missed.

## 5. Target users

### Primary buyer

- Founder/CEO at a B2B company
- CFO or finance lead
- RevOps lead
- Head of Operations

### Primary operator

- Finance associate
- RevOps manager
- Billing manager
- Customer success operations manager

### First beachhead

B2B SaaS and services companies that use non-standard pricing, seat counts, usage, retainers, or minimum commitments.

## 6. What the MVP does

The MVP supports a simple upload-based audit.

### Inputs

- Contract file: PDF, DOCX, TXT, or pasted text
- Invoice export: CSV
- Usage or seat export: CSV
- Customer list: CSV or manual entry

### AI extraction

Extract these commercial terms:

- customer name
- contract start date
- contract end date
- renewal terms
- notice period
- base fee
- seat price
- committed seats
- usage allowance
- overage price
- minimum monthly or annual commitment
- discount percentage
- discount expiry date
- annual price uplift
- payment terms
- special billing notes

### Deterministic reconciliation

Compare extracted terms with invoices and usage records to find:

- unbilled usage overages
- unbilled seats
- expired discounts still being applied
- missed annual uplift
- invoice amount below minimum commitment
- renewal or notice window risk
- payment terms mismatch

### Output

For each finding:

- finding type
- customer
- estimated recoverable amount
- calculation details
- confidence score
- evidence citations
- recommended next action
- draft invoice note or customer email
- approval status

## 7. MVP user flow

1. User signs up.
2. User creates organization.
3. User creates an audit workspace.
4. User uploads contract and CSV files.
5. App validates files.
6. User runs extraction.
7. User reviews extracted terms.
8. User runs reconciliation.
9. App shows findings.
10. User opens evidence pack.
11. User approves, dismisses, or marks finding as needs review.
12. User exports the evidence pack.

## 8. Non-goals for MVP

Do not build these in the first version:

- full CLM replacement
- contract drafting/redlining
- automatic invoice sending
- automatic payment collection
- legal advice
- support for every document format
- complex enterprise integrations
- multi-language extraction beyond English unless required by first customers

## 9. Success metrics

### Product outcome metrics

- Total recoverable revenue identified
- Verified recoverable revenue accepted by customer
- Number of findings approved
- False-positive rate
- Average time from upload to first finding

### Business metrics

- Audit-to-subscription conversion rate
- Monthly recurring revenue
- Customer acquisition cost
- Gross retention
- Net revenue retention
- Success fee collected

### Trust metrics

- Percentage of findings with complete citations
- Percentage of findings marked `needs_review`
- Customer-reported accuracy
- Number of security incidents

## 10. MVP acceptance criteria

The MVP is acceptable when:

- sample data produces at least one correct leakage finding,
- every finding has evidence citations,
- the user can review extracted terms before reconciliation,
- calculations are deterministic and tested,
- multi-tenant access control is implemented,
- file uploads are validated,
- audit events are logged,
- a user can export or copy an evidence pack.

## 11. Production completion requirements

LeakProof AI is production-ready only after repo verification and live service verification both pass.

### Live environment gate

- Supabase project is linked.
- Supabase migrations apply cleanly.
- RLS is verified with real `owner`, `admin`, `reviewer`, and `viewer` users.
- Supabase Auth sign-up, sign-in, and existing-member role flows are tested end-to-end.
- Gemini API key is configured server-side only.
- Gemini contract extraction is tested with real API calls.
- Gemini Embedding 2 and pgvector search are tested with real embeddings.
- Vercel project is linked.
- Production environment variables are configured.
- Deployed Vercel smoke test passes.

### Role management

Production role model is `owner`, `admin`, `reviewer`, `member`, and `viewer`.

The app must support member list, role changes for existing members, last-owner protection, privilege-escalation prevention, and clear permission errors. Role changes must be audit logged.

### Human review

Contract terms must support approve, edit, reject, needs-review, reviewer notes, source citations, and comparison between original AI extraction and the edited human-approved value.

Findings must support `needs_review`, `approved`, `dismissed`, `customer_ready`, `recovered`, and `not_recoverable`. Customer-ready reports must use approved findings only.

### Evidence candidate workflow

Evidence candidates are reviewer-controlled suggestions, not customer-ready proof until approved. Reviewers can attach, remove, approve, and reject candidates. Candidate actions are audit logged and approved evidence is what powers customer-ready reports.

### Scanned PDF and image ingestion

Production path selected: **Option B, Gemini file/multimodal ingestion**.

Text-based PDFs, DOCX, and TXT files use local text extraction first. Scanned PDFs and contract images are detected when local text extraction fails or when image MIME types are uploaded. The server sends the original file bytes to Gemini multimodal extraction, validates the structured result with Zod, preserves confidence and page-level text mapping when available, and then chunks the extracted text for citation-backed review.

### Final production gate

Production sign-off requires:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- Supabase migration application against the real project
- RLS persona test with owner/admin/reviewer/viewer users
- real Gemini extraction call
- real Gemini embedding and pgvector search call
- deployed Vercel smoke test
- browser console check for critical errors
- one full audit from upload to report export

## 12. Positioning

Not: “AI contract management.”

Instead: “AI revenue recovery from contracts and invoices.”

Tagline options:

- “Find the revenue your contracts already earned.”
- “Stop under-billing customers you already serve.”
- “Contract-to-cash leakage recovery for modern finance teams.”
