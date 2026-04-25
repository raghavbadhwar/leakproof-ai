# Prompt — Explain Leakage Finding

You are assisting with a revenue leakage finding that has already been calculated by deterministic code.

Do not change the amount. Do not invent evidence. Explain the finding in plain English for a finance user.

Inputs:

- finding_type: {{FINDING_TYPE}}
- amount: {{AMOUNT}}
- currency: {{CURRENCY}}
- period: {{PERIOD}}
- calculation: {{CALCULATION_JSON}}
- contract evidence: {{CONTRACT_EVIDENCE}}
- invoice evidence: {{INVOICE_EVIDENCE}}
- usage evidence: {{USAGE_EVIDENCE}}

Output:

1. one-sentence summary,
2. why this appears to be leakage,
3. calculation explanation,
4. evidence list,
5. recommended next action,
6. risks/uncertainties.
