import { describe, expect, it } from 'vitest';
import { generateExecutiveAuditReport, type ReportFinding } from './report';

const findings: ReportFinding[] = [
  {
    id: 'f1',
    title: 'Minimum commitment shortfall',
    findingType: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    status: 'approved',
    amountMinor: 100_000,
    currency: 'USD',
    confidence: 0.94
  },
  {
    id: 'f2',
    title: 'Expired discount',
    findingType: 'expired_discount_still_applied',
    outcomeType: 'prevented_future_leakage',
    status: 'customer_ready',
    amountMinor: 25_000,
    currency: 'USD',
    confidence: 0.88
  },
  {
    id: 'f3',
    title: 'Rejected duplicate',
    findingType: 'usage_overage_unbilled',
    outcomeType: 'recoverable_leakage',
    status: 'dismissed',
    amountMinor: 50_000,
    currency: 'USD',
    confidence: 0.7
  }
];

describe('executive audit report generation', () => {
  it('summarizes only approved customer-facing findings into report totals', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings,
      generatedAt: '2026-04-25T00:00:00.000Z'
    });

    expect(report.totalPotentialLeakageMinor).toBe(125_000);
    expect(report.totalApprovedRecoverableMinor).toBe(100_000);
    expect(report.totalPreventedLeakageMinor).toBe(25_000);
    expect(report.methodologyNote).toContain('Gemini extracts and retrieves');
  });
});
