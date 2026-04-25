---
name: contract-term-extraction
description: Extract commercial contract terms with citations, confidence, and needs-review flags for LeakProof AI.
---

# Contract Term Extraction Skill

Use this skill when implementing or modifying AI extraction from contracts.

## Goal

Convert unstructured contract text into structured commercial terms that can be reviewed by a human and used by deterministic reconciliation code.

## Terms to extract

- customer name
- supplier/company name
- contract start date
- contract end date
- renewal term
- notice period
- base fee
- billing frequency
- seat price
- committed seats
- included usage allowance
- overage price
- minimum commitment
- annual uplift/escalator
- discounts and discount expiry
- payment terms
- special billing notes

## Required output fields

Each term must include:

- `term_type`
- `value`
- `normalized_value`
- `currency` when money is involved
- `period` when time-bound
- `citation`
- `source_excerpt`
- `confidence`
- `needs_review`
- `reasoning_summary`

## Extraction rules

1. Do not guess missing terms.
2. Prefer `needs_review: true` over unsupported extraction.
3. Every term must have a citation.
4. Use source excerpts short enough for UI display.
5. Do not calculate leakage here.
6. Normalize dates to ISO format.
7. Normalize money to minor units when possible.
8. Keep raw extracted text available for human review.

## Schema mindset

AI output should be parsed and validated with Zod or JSON Schema. Invalid output should fail safely and ask for review.

## Tests to add

- sample contract extracts correct minimum commitment
- sample contract extracts annual uplift
- sample contract extracts usage allowance and overage rate
- missing term returns no term or needs_review, not a hallucination

