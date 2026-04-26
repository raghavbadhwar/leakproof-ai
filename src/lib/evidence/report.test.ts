import { describe, expect, it } from 'vitest';
import { CUSTOMER_FACING_REPORT_STATUSES, generateExecutiveAuditReport, REPORT_VERSION, type ReportFinding } from './report';

const contractCitation = {
  sourceType: 'contract',
  label: 'MSA section 4.1',
  excerpt: 'Minimum commitment is USD 1,000.',
  approvalState: 'approved' as const
};

const invoiceCitation = {
  sourceType: 'invoice',
  label: 'invoices.csv row 8',
  excerpt: 'Billed USD 600.',
  approvalState: 'approved' as const
};

function finding(overrides: Partial<ReportFinding> & Pick<ReportFinding, 'id' | 'status' | 'amountMinor'>): ReportFinding {
  return {
    id: overrides.id,
    title: overrides.title ?? `Finding ${overrides.id}`,
    findingType: overrides.findingType ?? 'minimum_commitment_shortfall',
    outcomeType: overrides.outcomeType ?? 'recoverable_leakage',
    status: overrides.status,
    amountMinor: overrides.amountMinor,
    currency: overrides.currency ?? 'USD',
    confidence: overrides.confidence ?? 0.9,
    customerName: overrides.customerName ?? 'Acme Cloud',
    recommendedAction: overrides.recommendedAction ?? 'Recover underbilled amount.',
    calculation: overrides.calculation ?? {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    },
    reviewerUserId: overrides.reviewerUserId ?? 'reviewer_1',
    reviewedAt: overrides.reviewedAt ?? '2026-04-25T00:00:00.000Z',
    evidenceCitations: overrides.evidenceCitations ?? [contractCitation, invoiceCitation]
  };
}

describe('executive audit report generation', () => {
  it('includes only approved, customer_ready, and recovered findings with approved evidence', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      workspaceId: 'workspace_1',
      generatedBy: 'reviewer_1',
      generatedAt: '2026-04-25T00:00:00.000Z',
      findings: [
        finding({ id: 'approved', status: 'approved', amountMinor: 100_000 }),
        finding({
          id: 'customer_ready',
          status: 'customer_ready',
          outcomeType: 'prevented_future_leakage',
          amountMinor: 25_000,
          customerName: 'Beta Retail'
        }),
        finding({ id: 'recovered', status: 'recovered', amountMinor: 40_000 }),
        finding({ id: 'draft', status: 'draft', amountMinor: 10_000 }),
        finding({ id: 'needs_review', status: 'needs_review', amountMinor: 20_000 }),
        finding({ id: 'dismissed', status: 'dismissed', amountMinor: 50_000 }),
        finding({ id: 'not_recoverable', status: 'not_recoverable', amountMinor: 60_000 })
      ]
    });

    expect(report.topFindings.map((item) => item.id).sort()).toEqual(['approved', 'customer_ready', 'recovered']);
    expect(report.metadata).toEqual({
      generated_at: '2026-04-25T00:00:00.000Z',
      generated_by: 'reviewer_1',
      workspace_id: 'workspace_1',
      report_version: REPORT_VERSION,
      included_statuses: CUSTOMER_FACING_REPORT_STATUSES
    });
    expect(report.findingsByStatus).toEqual({ approved: 1, customer_ready: 1, recovered: 1 });
  });

  it('excludes unapproved evidence and drops findings without approved contract evidence', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings: [
        finding({
          id: 'approved_evidence',
          status: 'approved',
          amountMinor: 100_000,
          evidenceCitations: [
            contractCitation,
            { ...invoiceCitation, approvalState: 'suggested' },
            { ...invoiceCitation, label: 'invoices.csv row 9', approvalState: 'rejected' }
          ]
        }),
        finding({
          id: 'unapproved_only',
          status: 'approved',
          amountMinor: 75_000,
          evidenceCitations: [{ ...contractCitation, approvalState: 'suggested' }]
        })
      ]
    });

    expect(report.topFindings.map((item) => item.id)).toEqual(['approved_evidence']);
    expect(report.topFindings[0]?.evidenceCitations).toEqual([contractCitation]);
    expect(report.totalPotentialLeakageMinor).toBe(100_000);
  });

  it('keeps totals matched to included findings and excludes dismissed amounts', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings: [
        finding({ id: 'recoverable', status: 'approved', amountMinor: 100_000, customerName: 'Acme Cloud' }),
        finding({
          id: 'prevented',
          status: 'customer_ready',
          outcomeType: 'prevented_future_leakage',
          amountMinor: 25_000,
          customerName: 'Beta Retail',
          findingType: 'expired_discount_still_applied'
        }),
        finding({ id: 'recovered', status: 'recovered', amountMinor: 40_000, customerName: 'Acme Cloud' }),
        finding({ id: 'dismissed', status: 'dismissed', amountMinor: 500_000, customerName: 'Acme Cloud' })
      ]
    });

    expect(report.totalPotentialLeakageMinor).toBe(165_000);
    expect(report.totalApprovedRecoverableMinor).toBe(140_000);
    expect(report.totalPreventedLeakageMinor).toBe(25_000);
    expect(report.totalRecoveredMinor).toBe(40_000);
    expect(report.executiveSummary.totalLeakageMinor).toBe(165_000);
    expect(report.recoverableLeakage.totalMinor).toBe(140_000);
    expect(report.preventedFutureLeakage.totalMinor).toBe(25_000);
    expect(report.recoveredAmount.totalMinor).toBe(40_000);
    expect(report.leakageByCustomer).toEqual({ 'Acme Cloud': 140_000, 'Beta Retail': 25_000 });
    expect(report.leakageByCategory).toEqual({
      minimum_commitment_shortfall: 140_000,
      expired_discount_still_applied: 25_000
    });
  });

  it('includes formula, input values, citations, and reviewer status for each reported finding', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings: [finding({ id: 'approved', status: 'approved', amountMinor: 100_000 })]
    });

    const reportedFinding = report.topFindings[0];
    expect(reportedFinding?.formula).toBe('minimum_commitment_minor - billed_minor');
    expect(reportedFinding?.inputValues).toEqual({
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    });
    expect(reportedFinding?.contractCitation).toEqual(contractCitation);
    expect(reportedFinding?.invoiceUsageCitations).toEqual([invoiceCitation]);
    expect(reportedFinding?.reviewerStatus).toBe('approved');
    expect(report.appendixWithCitations[0]?.citations).toEqual([contractCitation, invoiceCitation]);
    expect(report.methodologyNote).toContain('approved evidence');
  });
});
