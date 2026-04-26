import { describe, expect, it } from 'vitest';
import { buildWorkspaceAnalytics, customerFacingFindingStatuses, type WorkspaceAnalyticsFinding } from './workspaceAnalytics';
import { filterByAnalyticsPeriod, parseAnalyticsDateFilter } from './period';

const baseFinding = {
  findingType: 'minimum_commitment_shortfall',
  outcomeType: 'recoverable_leakage',
  severity: 'high',
  currency: 'USD',
  confidence: 0.91,
  customerId: 'customer_alpha',
  customerName: 'Alpha Retail Cloud',
  customerSegment: 'Enterprise',
  billingModel: 'Annual contract',
  contractType: 'Usage + minimum',
  evidenceCoverageStatus: 'complete',
  createdAt: '2026-01-12T00:00:00.000Z',
  updatedAt: '2026-01-20T00:00:00.000Z'
} satisfies Omit<WorkspaceAnalyticsFinding, 'id' | 'title' | 'status' | 'amountMinor'>;

describe('workspace analytics aggregation', () => {
  it('defines customer-facing statuses explicitly', () => {
    expect(customerFacingFindingStatuses).toEqual(['approved', 'customer_ready', 'recovered']);
  });

  it('excludes draft, needs-review, dismissed, and not-recoverable findings from customer-facing leakage', () => {
    const analytics = buildWorkspaceAnalytics({
      generatedAt: '2026-04-26T00:00:00.000Z',
      findings: [
        finding('approved', 100_000),
        finding('customer_ready', 50_000),
        finding('recovered', 25_000),
        finding('draft', 900_000),
        finding('needs_review', 800_000),
        finding('dismissed', 700_000),
        finding('not_recoverable', 600_000)
      ]
    });

    expect(analytics.customerFacing.totalLeakageMinor).toBe(175_000);
    expect(analytics.customerFacing.findingCount).toBe(3);
    expect(analytics.customerFacing.trend.reduce((sum, point) => sum + point.internalPipelineMinor, 0)).toBe(0);
    expect(analytics.customerFacing.description).toContain('Draft and needs-review findings are excluded');
    expect(analytics.customerFacing.byCategory[0]?.amountMinor).toBe(175_000);
  });

  it('keeps draft and needs-review exposure in a clearly labeled internal pipeline', () => {
    const analytics = buildWorkspaceAnalytics({
      findings: [
        finding('approved', 100_000),
        finding('draft', 90_000),
        finding('needs_review', 40_000),
        finding('dismissed', 1_000_000)
      ]
    });

    expect(analytics.internalPipeline.label).toBe('Internal pipeline');
    expect(analytics.internalPipeline.description).toContain('not customer-facing leakage');
    expect(analytics.internalPipeline.unapprovedExposureMinor).toBe(130_000);
    expect(analytics.internalPipeline.findingCount).toBe(2);
    expect(analytics.internalPipeline.trend.reduce((sum, point) => sum + point.approvedMinor, 0)).toBe(0);
    expect(analytics.internalPipeline.trend.reduce((sum, point) => sum + point.internalPipelineMinor, 0)).toBe(130_000);
    expect(analytics.reviewBurden.allStatuses.map((item) => item.label)).toContain('Dismissed');
  });

  it('returns empty metadata dimensions instead of placeholder chart values', () => {
    const analytics = buildWorkspaceAnalytics({
      findings: [
        finding('approved', 100_000, {
          customerName: null,
          customerSegment: null,
          billingModel: null,
          contractType: null
        })
      ],
      documents: [],
      terms: [],
      usage: []
    });

    expect(analytics.customerFacing.byCustomer).toEqual([]);
    expect(analytics.customerFacing.bySegment).toEqual([]);
    expect(analytics.customerFacing.byBillingModel).toEqual([]);
    expect(analytics.internalPipeline.byContractType).toEqual([]);
    expect(analytics.operations.documentPipeline).toEqual([]);
    expect(analytics.operations.contractHealth).toEqual([]);
    expect(analytics.operations.usageVariance).toEqual([]);
    expect(analytics.operations.renewalCalendar).toEqual([]);
  });

  it('builds optional dimension cuts only when metadata exists', () => {
    const analytics = buildWorkspaceAnalytics({
      findings: [
        finding('approved', 100_000, {
          customerName: 'Acme',
          customerSegment: 'Enterprise',
          billingModel: 'Usage',
          findingType: 'expired_discount'
        }),
        finding('approved', 75_000, {
          customerName: 'Beta',
          customerSegment: null,
          billingModel: null,
          findingType: 'missed_uplift'
        }),
        finding('draft', 50_000, {
          contractType: 'Usage + minimum'
        })
      ]
    });

    expect(analytics.customerFacing.byCustomer.map((point) => point.label)).toEqual(['Acme', 'Beta']);
    expect(analytics.customerFacing.bySegment.map((point) => point.label)).toEqual(['Enterprise']);
    expect(analytics.customerFacing.byBillingModel.map((point) => point.label)).toEqual(['Usage']);
    expect(analytics.customerFacing.discountTrend).toHaveLength(1);
    expect(analytics.customerFacing.upliftTrend).toHaveLength(1);
    expect(analytics.internalPipeline.byContractType.map((point) => point.label)).toEqual(['Usage + minimum']);
  });

  it('filters analytics rows by inclusive period boundaries', () => {
    const period = {
      periodStart: parseAnalyticsDateFilter('2026-02-01'),
      periodEnd: parseAnalyticsDateFilter('2026-02-28')
    };
    const rows = [
      finding('approved', 100_000, { updatedAt: '2026-01-31T23:59:59.000Z' }),
      finding('approved', 200_000, { updatedAt: '2026-02-01T00:00:00.000Z' }),
      finding('approved', 300_000, { updatedAt: '2026-02-28T23:59:59.000Z' }),
      finding('approved', 400_000, { updatedAt: '2026-03-01T00:00:00.000Z' })
    ];

    const filtered = filterByAnalyticsPeriod(rows, period, (row) => row.updatedAt);

    expect(filtered.map((row) => row.amountMinor)).toEqual([200_000, 300_000]);
  });
});

function finding(
  status: WorkspaceAnalyticsFinding['status'],
  amountMinor: number,
  override: Partial<WorkspaceAnalyticsFinding> = {}
): WorkspaceAnalyticsFinding {
  return {
    ...baseFinding,
    id: `finding_${status}`,
    title: `${status} finding`,
    status,
    amountMinor,
    ...override
  };
}
