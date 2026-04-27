import { describe, expect, it } from 'vitest';
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFinding } from './workspaceAnalytics';

describe('audit readiness analytics boundary', () => {
  it('keeps draft and needs-review leakage out of customer-facing totals', () => {
    const analytics = buildWorkspaceAnalytics({
      generatedAt: '2026-04-27T10:00:00.000Z',
      findings: [
        finding('approved', 25_000),
        finding('customer_ready', 15_000),
        finding('draft', 900_000),
        finding('needs_review', 800_000)
      ]
    });

    expect(analytics.customerFacing.totalLeakageMinor).toBe(40_000);
    expect(analytics.internalPipeline.unapprovedExposureMinor).toBe(1_700_000);
    expect(analytics.customerFacing.description).toContain('Draft and needs-review findings are excluded');
  });
});

function finding(status: WorkspaceAnalyticsFinding['status'], amountMinor: number): WorkspaceAnalyticsFinding {
  return {
    id: `finding_${status}`,
    title: `${status} finding`,
    findingType: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    status,
    amountMinor,
    currency: 'USD',
    confidence: 0.9,
    evidenceCoverageStatus: 'complete',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z'
  };
}
