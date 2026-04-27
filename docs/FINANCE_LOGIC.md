# Finance Logic

LeakProof uses deterministic finance rules after contract terms, invoice rows, and usage rows have evidence citations. The guiding assumption is: LLM extracts, code calculates, human approves.

## Assumptions

- Money is calculated in integer minor units, with no currency conversion.
- A recoverable leakage finding must have a positive amount and at least invoice or usage evidence.
- Recurring billing checks are period-aware. A later period does not offset an earlier period unless a supported term says so.
- Invoice `service_period_start` is preferred for period placement, then `service_period_end`, then `invoice_date`.
- Credit note, credit memo, refund, reversal, and write-off rows are not treated as billable evidence for underbilling checks.
- Payment terms are risk alerts by default. They do not claim recoverable leakage unless a future rule can calculate a supported finance amount.
- Renewal window findings are risk alerts because the amount at risk depends on human commercial judgment.

## Supported Inputs

Invoice CSVs require customer, invoice, date, line item, amount, and currency fields. They may also include:

- `payment_terms_days`
- `due_date`
- `paid_at`
- `service_period_start`
- `service_period_end`
- `product_label`
- `team_label`

Usage CSVs may include `product_label` and `team_label`.

## Supported Rules

- Minimum commitment shortfall: compares approved commitment against billable invoice rows in the same currency and billing period.
- Usage overage: compares period usage over allowance against overage invoice rows, and only flags the missing amount after partial billing.
- Seat underbilling: compares period seat or user usage against billed seat quantities.
- Expired discount: flags discount rows that continue after the approved expiry date.
- Annual uplift: checks post-anniversary recurring subscription or platform rows, while ignoring one-time setup and implementation fees.
- Renewal risk: flags notice windows that are due soon or already missed.
- Payment terms mismatch: prefers explicit `payment_terms_days`, then due-date math, then line item text such as Net 30.
- Amendment conflict: flags a later approved amendment that may supersede an approved term.

## Not Supported Yet

- Tax, refunds, and refund netting.
- Tiered pricing, volume bands, ramps, and true-ups.
- Currency conversion or FX normalization.
- Multi-entity customer hierarchies.
- Product-level contract matching beyond preserving product and team labels.
- Proration, mid-period upgrades, downgrades, and co-terming.
- Recoverable amounts for renewal risk or payment behavior.

## Interpreting Findings

- `recoverable_leakage` means the rule found a positive, evidence-backed amount that should be reviewed before customer use.
- `risk_alert` means the rule found a contract-to-cash risk but did not calculate a recoverable claim.
- `needs_review` means a human should confirm context before approving.
- Missing findings do not prove billing is correct; unsupported scenarios should be reviewed manually.
