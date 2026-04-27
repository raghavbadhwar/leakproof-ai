import { describe, expect, it } from 'vitest';
import {
  buildRootCausePrompt,
  classifyRootCauseDeterministic,
  parseRootCauseOutput,
  type RootCauseFindingContext
} from './rootCause';
import { ROOT_CAUSE_SAFETY, rootCauseOutputSchema } from './rootCauseSchema';

const baseContext: RootCauseFindingContext = {
  finding: {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    title: 'Minimum commitment shortfall',
    summary: 'Customer was billed below the approved minimum commitment.',
    status: 'needs_review',
    estimatedAmountMinor: 123_456,
    currency: 'USD',
    confidence: 0.9,
    evidenceCoverageStatus: 'complete',
    calculation: {
      minimum_commitment_minor: 200_000,
      billed_minor: 76_544,
      formula: 'minimum_commitment_minor - billed_minor'
    }
  },
  approvedEvidence: [
    {
      evidenceId: '44444444-4444-4444-8444-444444444444',
      evidenceType: 'contract_term',
      sourceType: 'contract',
      label: 'MSA section 4.1',
      approvalState: 'approved'
    }
  ]
};

describe('root cause classifier', () => {
  it('maps expired discount findings to expired_discount_not_removed', () => {
    const rootCause = classifyRootCauseDeterministic({
      ...baseContext,
      finding: {
        ...baseContext.finding,
        type: 'expired_discount_still_applied',
        title: 'Expired discount still applied',
        summary: 'A promotional discount continued after its expiry date.'
      }
    });

    expect(rootCause.primaryRootCause).toBe('expired_discount_not_removed');
    expect(rootCause.preventionRecommendation).toMatch(/discount-expiry/i);
  });

  it('maps annual uplift findings to annual_uplift_not_configured', () => {
    const rootCause = classifyRootCauseDeterministic({
      ...baseContext,
      finding: {
        ...baseContext.finding,
        type: 'missed_annual_uplift',
        title: 'Missed annual uplift',
        summary: 'The approved annual uplift was not applied in billing.'
      }
    });

    expect(rootCause.primaryRootCause).toBe('annual_uplift_not_configured');
    expect(rootCause.operationalOwnerSuggestion).toMatch(/revenue operations/i);
  });

  it('maps seat findings to seat_count_not_synced', () => {
    const rootCause = classifyRootCauseDeterministic({
      ...baseContext,
      finding: {
        ...baseContext.finding,
        type: 'seat_underbilling',
        title: 'Seat underbilling',
        summary: 'Active users exceeded billed seats for the same service period.'
      }
    });

    expect(rootCause.primaryRootCause).toBe('seat_count_not_synced');
    expect(rootCause.preventionRecommendation).toMatch(/seat counts/i);
  });

  it('does not alter the deterministic finding amount while classifying root cause', () => {
    const before = structuredClone(baseContext.finding);
    const rootCause = classifyRootCauseDeterministic(baseContext);

    expect(rootCause.primaryRootCause).toBe('minimum_commitment_not_monitored');
    expect(baseContext.finding).toEqual(before);
    expect(baseContext.finding.estimatedAmountMinor).toBe(123_456);
  });

  it('validates safe root cause output with strict safety booleans', () => {
    const output = classifyRootCauseDeterministic(baseContext);

    expect(rootCauseOutputSchema.parse(output)).toEqual(output);
    expect(parseRootCauseOutput(output).safety).toEqual(ROOT_CAUSE_SAFETY);
    expect(() =>
      parseRootCauseOutput({
        ...output,
        safety: {
          ...output.safety,
          canApproveFindings: true
        }
      })
    ).toThrow();
  });

  it('keeps raw evidence and deterministic amount values out of the root cause prompt', () => {
    const prompt = buildRootCausePrompt({
      ...baseContext,
      approvedEvidence: [
        {
          evidenceId: '55555555-5555-4555-8555-555555555555',
          evidenceType: 'invoice_row',
          sourceType: 'invoice',
          label: 'invoice.csv row 8',
          approvalState: 'approved',
          excerpt: 'Raw invoice row for Customer Secret Inc should not be stored.'
        } as NonNullable<RootCauseFindingContext['approvedEvidence']>[number] & { excerpt: string }
      ]
    });

    expect(prompt).not.toContain('Raw invoice row');
    expect(prompt).not.toContain('Customer Secret Inc');
    expect(prompt).not.toContain('123456');
    expect(prompt).not.toContain('estimatedAmountMinor');
    expect(prompt).toContain('calculationSignalKeys');
  });
});
