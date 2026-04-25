---
name: evidence-pack-generation
description: Generate CFO-ready evidence packs for each revenue leakage finding.
---

# Evidence Pack Generation Skill

Use this skill when building finding detail pages, exports, and customer-ready evidence.

## Purpose

A finding is only valuable if a finance leader can trust it quickly.

## Evidence pack structure

1. Executive summary
2. Finding type and amount
3. Customer and period
4. Contract clause evidence
5. Invoice/usage evidence
6. Deterministic calculation
7. Recommended next action
8. Draft internal note
9. Draft external customer message
10. Human approval status

## UI rules

- Show citations next to claims.
- Show amount and formula above the fold.
- Use plain English.
- Make confidence and review status visible.
- Include “why this might be wrong” when uncertainty exists.
- Make the page print/PDF friendly.

## Draft message rules

- Use polite language.
- Do not accuse the customer.
- Frame as a reconciliation correction.
- Include evidence references.
- Require human approval before use.

## Example draft tone

```text
Hi {{customer_name}},

During our regular billing reconciliation, we noticed that the {{period}} invoice may not have reflected the usage overage described in section {{section}} of our agreement. We have attached the calculation for review.

Could you please confirm whether we should include this adjustment on the next invoice?
```

