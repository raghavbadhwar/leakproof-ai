import { describe, expect, it } from 'vitest';
import { buildWorkspaceAnalytics, customerFacingFindingStatuses, type WorkspaceAnalyticsFinding } from './workspaceAnalytics';

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
    expect(analytics.reviewBurden.allStatuses.map((item) => item.label)).toContain('Dismissed');
  });
});

function finding(status: WorkspaceAnalyticsFinding['status'], amountMinor: number): WorkspaceAnalyticsFinding {
  return {
    ...baseFinding,
    id: `finding_${status}`,
    title: `${status} finding`,
    status,
    amountMinor
  };
}
