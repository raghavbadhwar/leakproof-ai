# Reporting

LeakProof reports are designed for founder/CFO pilot-audit review. They are presentation-ready summaries of customer-facing leakage, not a dump of every internal finding.

## Inclusion Boundary

Customer-facing reports include only findings with these statuses:

- `approved`
- `customer_ready`
- `recovered`

Reports exclude `draft`, `needs_review`, `dismissed`, and `not_recoverable` from customer-facing totals.

Evidence is also filtered before export:

- Only `approved` evidence is included.
- Draft, suggested, rejected, and system-created evidence is excluded.
- Money findings require approved contract evidence, approved invoice or usage evidence, and formula inputs.
- Risk-only findings may export with approved contract evidence, but they are counted separately from recovery actions.

## Report Sections

The executive report presents:

- Executive summary.
- Total recoverable leakage.
- Total prevented future leakage.
- Recovered amount.
- Risk-only items.
- Findings by customer.
- Findings by category.
- Top 10 findings.
- Methodology.
- Appendix with approved citations for every included finding.

## Display Labels

The report JSON and UI expose the customer-facing controls explicitly:

- Customer-facing leakage.
- Approved evidence only.
- Human reviewed.
- Generated at.
- Included statuses.

## Export Readiness

The report can be previewed before export. Export is blocked until at least one finding passes the customer-facing status and approved-evidence rules.

Empty states are shown for:

- No approved findings.
- Missing approved evidence.
- Report not exportable yet.

## Print/PDF

The app uses the browser print flow for now. Print styles prioritize readable totals, tables, section breaks, and a citation appendix that starts on a new printed section. A branded PDF rendering engine is intentionally deferred until the report contract stabilizes.
