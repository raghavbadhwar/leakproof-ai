import { describe, expect, it } from 'vitest';
import {
  buildCfoSummaryDraft,
  cfoSummaryOutputSchema,
  type CfoSummaryContext
} from './cfoSummarySchema';

const cfoContext: CfoSummaryContext = {
  organizationName: 'Acme Audit Co.',
  workspace: {
    id: 'workspace_1',
    name: 'Q1 Revenue Audit'
  },
  currency: 'USD',
  report: {
    totalPotentialLeakageMinor: 165_000,
    totalApprovedRecoverableMinor: 140_000,
    totalPreventedLeakageMinor: 25_000,
    totalRecoveredMinor: 40_000,
    totalRiskOnlyItems: 1,
    includedFindingCount: 3,
    categoryBreakdown: [
      { label: 'minimum_commitment_shortfall', amountMinor: 140_000, findingCount: 2 },
      { label: 'expired_discount_still_applied', amountMinor: 25_000, findingCount: 1 }
    ],
    customerBreakdown: [
      { label: 'Acme Cloud', amountMinor: 140_000, findingCount: 2 }
    ],
    exportability: {
      exportable: true,
      blockers: [],
      statusEligibleFindingCount: 3,
      includedFindingCount: 3,
      excludedAfterEvidenceReviewCount: 0,
      emptyStates: {
        no_approved_findings: { title: 'No approved findings', detail: 'Approve findings.' },
        missing_approved_evidence: { title: 'Missing approved evidence', detail: 'Approve evidence.' },
        mixed_currency_findings: { title: 'Mixed currencies require separate reports', detail: 'Split currencies.' },
        report_not_exportable_yet: { title: 'Report not exportable yet', detail: 'Resolve blockers.' }
      }
    }
  },
  internalPipeline: {
    unapprovedExposureMinor: 70_000,
    findingCount: 2,
    needsReviewCount: 1,
    topUnapproved: [
      { label: 'Draft seat underbilling', value: 50_000, amountMinor: 50_000, count: 1 }
    ]
  },
  closedReview: {
    dismissedCount: 1,
    notRecoverableCount: 1
  },
  riskOnly: {
    count: 1
  }
};

describe('CFO summary schema', () => {
  it('separates approved leakage, internal exposure, closed findings, and risk-only items', () => {
    const summary = buildCfoSummaryDraft(cfoContext);

    expect(summary.totalApprovedLeakageText).toContain('Customer-facing leakage');
    expect(summary.totalApprovedLeakageText).toContain('USD 1,650.00');
    expect(summary.internalExposureText).toContain('Internal unapproved exposure');
    expect(summary.internalExposureText).toContain('USD 700.00');
    expect(summary.reportReadiness.dismissedNotRecoverableText).toContain('Dismissed findings: 1');
    expect(summary.reportReadiness.dismissedNotRecoverableText).not.toContain('USD');
    expect(summary.topDrivers.find((driver) => driver.scope === 'dismissed_or_not_recoverable')?.amountText).toBe('Excluded from recovery totals');
    expect(summary.reportReadiness.riskOnlyItemsText).toContain('Risk-only items');
    expect(summary.topDrivers.map((driver) => driver.scope)).toEqual(expect.arrayContaining([
      'customer_facing_leakage',
      'internal_unapproved_exposure',
      'dismissed_or_not_recoverable',
      'risk_only'
    ]));
  });

  it('uses deterministic totals when model output tries to introduce unsupported numbers', () => {
    const summary = buildCfoSummaryDraft(cfoContext, {
      executiveSummary: 'The audit found USD 999,999.00 and should be sent today.',
      totalApprovedLeakageText: 'Customer-facing leakage is USD 999,999.00.',
      internalExposureText: 'Internal exposure is zero.',
      topDrivers: [],
      priorityActions: ['Review the report manually.'],
      reportReadiness: {
        customerFacingLeakageText: 'Unsupported number.',
        internalUnapprovedExposureText: 'Unsupported number.',
        dismissedNotRecoverableText: 'Unsupported number.',
        riskOnlyItemsText: 'Unsupported number.',
        exportable: false,
        blockers: ['Unsupported blocker'],
        narrative: 'Unsupported readiness.'
      },
      caveats: ['Unsupported caveat with USD 123.00.'],
      humanReviewRequired: true,
      referencedEntities: []
    });

    expect(summary.executiveSummary).toContain('USD 1,650.00');
    expect(summary.totalApprovedLeakageText).toContain('USD 1,650.00');
    expect(summary.internalExposureText).toContain('USD 700.00');
    expect(summary.caveats.join(' ')).not.toContain('USD 123.00');
    expect(() => cfoSummaryOutputSchema.parse(summary)).not.toThrow();
  });
});
