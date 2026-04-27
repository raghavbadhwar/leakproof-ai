import { describe, expect, it } from 'vitest';
import { buildRootCauseAnalytics, type RootCauseAnalyticsFinding } from './rootCauseAnalytics';

const baseFinding = {
  title: 'Expired discount still applied',
  findingType: 'expired_discount_still_applied',
  outcomeType: 'recoverable_leakage',
  currency: 'USD',
  confidence: 0.92,
  summary: 'A discount continued after the approved expiry date.',
  evidenceCoverageStatus: 'complete',
  calculation: {
    discount_expiry_date: '2026-01-31',
    formula: 'expected_minor - billed_minor'
  }
} satisfies Omit<RootCauseAnalyticsFinding, 'id' | 'status' | 'amountMinor'>;

describe('root cause analytics', () => {
  it('separates customer-facing and internal data when amounts are used', () => {
    const analytics = buildRootCauseAnalytics({
      generatedAt: '2026-04-27T00:00:00.000Z',
      findings: [
        finding('approved', 100_000, { id: 'approved_discount' }),
        finding('customer_ready', 50_000, { id: 'customer_ready_discount' }),
        finding('recovered', 25_000, { id: 'recovered_discount' }),
        finding('draft', 900_000, { id: 'draft_discount' }),
        finding('needs_review', 800_000, { id: 'needs_review_discount' }),
        finding('dismissed', 700_000, { id: 'dismissed_discount' })
      ]
    });

    expect(analytics.customerFacing.description).toContain('approved, customer_ready, and recovered');
    expect(analytics.customerFacing.rootCausesByLeakageAmount[0]).toMatchObject({
      label: 'Expired discount not removed',
      amountMinor: 175_000,
      count: 3
    });
    expect(analytics.internalPipeline.description).toContain('not customer-facing leakage');
    expect(analytics.internalPipeline.rootCausesByLeakageAmount[0]).toMatchObject({
      label: 'Expired discount not removed',
      amountMinor: 1_700_000,
      count: 2
    });
  });

  it('builds prevention priorities and operational fixes from deterministic classifications', () => {
    const analytics = buildRootCauseAnalytics({
      findings: [
        finding('approved', 100_000, { id: 'discount_1' }),
        finding('approved', 60_000, {
          id: 'uplift_1',
          findingType: 'missed_annual_uplift',
          title: 'Missed annual uplift',
          summary: 'Annual uplift was not applied in billing.'
        }),
        finding('needs_review', 40_000, {
          id: 'seat_1',
          findingType: 'seat_underbilling',
          title: 'Seat underbilling',
          summary: 'Active users exceeded billed seats.'
        })
      ]
    });

    expect(analytics.customerFacing.preventionPriority.map((item) => item.rootCause)).toEqual(
      expect.arrayContaining(['expired_discount_not_removed', 'annual_uplift_not_configured'])
    );
    expect(analytics.recurringPatterns.map((item) => item.rootCause)).toContain('seat_count_not_synced');
    expect(analytics.topOperationalFixes[0]).toEqual(expect.objectContaining({
      preventionRecommendation: expect.any(String),
      operationalOwnerSuggestion: expect.any(String)
    }));
  });
});

function finding(
  status: RootCauseAnalyticsFinding['status'],
  amountMinor: number,
  override: Partial<RootCauseAnalyticsFinding> = {}
): RootCauseAnalyticsFinding {
  return {
    ...baseFinding,
    id: `finding_${status}`,
    status,
    amountMinor,
    ...override
  };
}
