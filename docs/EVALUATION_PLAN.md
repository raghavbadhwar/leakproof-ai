# Evaluation Plan

The goal is not to make the AI sound smart. The goal is to make findings accurate, cited, and financially useful.

## Eval dataset

Use `sample-data/` first, then add anonymized real customer examples.

Each eval case should include:

- contract text or PDF
- invoice CSV
- usage CSV
- expected extracted terms
- expected findings
- expected non-findings

## Extraction evals

Measure:

- term recall: did the model find the important commercial terms?
- term precision: did it avoid unsupported terms?
- citation quality: does the citation point to the right clause?
- confidence calibration: are uncertain clauses marked `needs_review`?

## Reconciliation evals

Measure:

- correct finding type
- correct amount
- correct currency
- correct customer
- correct period
- correct evidence rows
- no false finding when invoice matches contract

## Human review evals

Ask a finance person:

- Can they understand the finding in under 60 seconds?
- Do they trust the evidence?
- Would they send the draft email after light editing?
- What extra proof would they need?

## Required tests

- unit tests for each leakage rule
- parser tests for CSV ingestion
- extraction schema validation tests
- authorization tests for tenant boundaries
- end-to-end smoke test for demo flow

## Quality gate before selling

Before charging a customer, the product must pass:

- 95%+ deterministic test pass rate on known evals
- 0 known cross-tenant access bugs
- every finding has citations
- every money amount has calculation details
- all external actions require human approval

