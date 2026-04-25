---
name: revenue-reconciliation
description: Build deterministic leakage rules that compare approved contract terms with invoice and usage records.
---

# Revenue Reconciliation Skill

Use this skill for the deterministic calculation engine.

## Core rule

AI may explain and extract. Code calculates.

## Finding types

### `minimum_commitment_shortfall`

If invoiced amount for a period is below contractual minimum commitment, create a finding for the difference.

### `seat_underbilling`

If actual seats exceed billed seats or committed billing threshold, create a finding for missing seats times contract seat price.

### `usage_overage_unbilled`

If usage exceeds included allowance and invoice does not include the overage, create a finding.

### `expired_discount_still_applied`

If a discount expiry date has passed but invoice still reflects discounted price, create a finding.

### `missed_annual_uplift`

If contract includes annual uplift and invoice price did not increase after anniversary, create a finding.

### `renewal_window_risk`

If renewal/notice window is close or missed, create a non-money risk finding.

## Calculation requirements

Every finding must include:

- formula
- input values
- source term IDs
- invoice/usage row IDs
- period
- currency
- amount in minor units
- confidence

## Money handling

- Use integer minor units for money.
- Do not use JavaScript floats for final money.
- Round only at defined currency boundaries.
- Keep currency consistent.
- If currency mismatch exists, mark as needs review.

## False positive prevention

Do not create a finding if:

- required contract term is unapproved,
- invoice data is missing,
- customer mapping is uncertain,
- currency is inconsistent,
- period overlap cannot be determined,
- required evidence citation is missing.

## Tests to add

- no finding when billed amount equals minimum commitment
- minimum commitment shortfall when invoice is too low
- usage overage finding with correct amount
- expired discount finding with correct date logic
- annual uplift finding after anniversary

