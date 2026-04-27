import { describe, expect, it } from 'vitest';
import { exportBlockerForFinding } from './exportReadiness';

const calculation = {
  formula: 'minimum_commitment_minor - billed_minor',
  minimum_commitment_minor: 100_000,
  billed_minor: 60_000
};

describe('evidence export readiness rules', () => {
  it('requires approved evidence before export', () => {
    expect(
      exportBlockerForFinding({
        status: 'approved',
        outcomeType: 'recoverable_leakage',
        calculation,
        evidenceCitations: [{ sourceType: 'contract', approvalState: 'suggested' }]
      })
    ).toBe('approved_evidence_required');
  });

  it('requires contract evidence for customer-facing findings', () => {
    expect(
      exportBlockerForFinding({
        status: 'approved',
        outcomeType: 'recoverable_leakage',
        calculation,
        evidenceCitations: [{ sourceType: 'invoice', approvalState: 'approved' }]
      })
    ).toBe('contract_evidence_required');
  });

  it('requires invoice or usage evidence for recoverable money findings', () => {
    expect(
      exportBlockerForFinding({
        status: 'approved',
        outcomeType: 'recoverable_leakage',
        calculation,
        evidenceCitations: [{ sourceType: 'contract', approvalState: 'approved' }]
      })
    ).toBe('invoice_or_usage_evidence_required');
  });

  it('requires formula inputs for recoverable money findings', () => {
    expect(
      exportBlockerForFinding({
        status: 'approved',
        outcomeType: 'recoverable_leakage',
        calculation: { formula: 'minimum_commitment_minor - billed_minor' },
        evidenceCitations: [
          { sourceType: 'contract', approvalState: 'approved' },
          { sourceType: 'invoice', approvalState: 'approved' }
        ]
      })
    ).toBe('calculation_required');
  });

  it('allows risk alerts with approved contract-only evidence', () => {
    expect(
      exportBlockerForFinding({
        status: 'customer_ready',
        outcomeType: 'risk_alert',
        calculation: null,
        evidenceCitations: [{ sourceType: 'contract', approvalState: 'approved' }]
      })
    ).toBeNull();
  });
});
