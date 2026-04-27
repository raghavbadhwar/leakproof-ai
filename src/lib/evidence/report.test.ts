import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_FACING_REPORT_STATUSES,
  generateExecutiveAuditReport,
  REPORT_DISPLAY_LABELS,
  REPORT_VERSION,
  type ReportFinding
} from './report';

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

const usageCitation = {
  sourceType: 'usage',
  label: 'usage.csv row 4',
  excerpt: 'Usage exceeded allowance.',
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
    expect(report.metadata).toEqual(expect.objectContaining({
      generated_at: '2026-04-25T00:00:00.000Z',
      generated_by: 'reviewer_1',
      workspace_id: 'workspace_1',
      report_version: REPORT_VERSION,
      included_statuses: CUSTOMER_FACING_REPORT_STATUSES
    }));
    expect(report.displayLabels).toEqual(REPORT_DISPLAY_LABELS);
    expect(report.metadata.evidence_policy).toBe('approved_evidence_only');
    expect(report.metadata.review_policy).toBe('human_reviewed');
    expect(report.metadata.status_eligible_finding_count).toBe(3);
    expect(report.metadata.excluded_after_evidence_review_count).toBe(0);
    expect(report.findingsByStatus).toEqual({ approved: 1, customer_ready: 1, recovered: 1 });
  });

  it('excludes draft, suggested, and rejected evidence while keeping approved evidence', () => {
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
            invoiceCitation,
            { ...usageCitation, approvalState: 'draft' },
            { ...usageCitation, label: 'usage.csv row 5', approvalState: 'suggested' },
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
    expect(report.topFindings[0]?.evidenceCitations).toEqual([contractCitation, invoiceCitation]);
    expect(report.totalPotentialLeakageMinor).toBe(100_000);
  });

  it('drops recoverable findings without approved invoice or usage evidence', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings: [
        finding({
          id: 'contract_only_recoverable',
          status: 'approved',
          amountMinor: 100_000,
          evidenceCitations: [contractCitation]
        })
      ]
    });

    expect(report.includedFindingCount).toBe(0);
    expect(report.totalPotentialLeakageMinor).toBe(0);
    expect(report.topFindings).toEqual([]);
    expect(report.exportability.exportable).toBe(false);
    expect(report.exportability.blockers).toEqual(['missing_approved_evidence', 'report_not_exportable_yet']);
  });

  it('allows risk alerts to export with approved contract-only evidence and labels them risk-only', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings: [
        finding({
          id: 'notice_window_risk',
          findingType: 'renewal_window_risk',
          outcomeType: 'risk_alert',
          status: 'customer_ready',
          amountMinor: 0,
          evidenceCitations: [contractCitation],
          calculation: {
            formula: 'renewal_date - notice_period_days',
            renewal_date: '2026-06-30',
            notice_period_days: 60
          }
        })
      ]
    });

    expect(report.includedFindingCount).toBe(1);
    expect(report.totalRiskOnlyItems).toBe(1);
    expect(report.topFindings[0]?.id).toBe('notice_window_risk');
    expect(report.topFindings[0]?.riskOnly).toBe(true);
    expect(report.topFindings[0]?.riskLabel).toBe('Risk-only');
    expect(report.topFindings[0]?.invoiceUsageCitations).toEqual([]);
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
        finding({
          id: 'missing_invoice_usage',
          status: 'approved',
          amountMinor: 700_000,
          evidenceCitations: [contractCitation],
          customerName: 'Acme Cloud'
        }),
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
    expect(report.customerBreakdown).toEqual([
      { label: 'Acme Cloud', amountMinor: 140_000, findingCount: 2 },
      { label: 'Beta Retail', amountMinor: 25_000, findingCount: 1 }
    ]);
    expect(report.categoryBreakdown).toEqual([
      { label: 'minimum_commitment_shortfall', amountMinor: 140_000, findingCount: 2 },
      { label: 'expired_discount_still_applied', amountMinor: 25_000, findingCount: 1 }
    ]);
    expect(report.includedFindings.map((item) => item.id).sort()).toEqual(['prevented', 'recoverable', 'recovered']);
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
    expect(report.methodologyNote).toContain('Human review');
  });

  it('includes metadata labels and empty-state guidance for CFO exports', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      generatedAt: '2026-04-25T00:00:00.000Z',
      findings: []
    });

    expect(report.displayLabels.customerFacingLeakage).toBe('Customer-facing leakage');
    expect(report.displayLabels.approvedEvidenceOnly).toBe('Approved evidence only');
    expect(report.displayLabels.humanReviewed).toBe('Human reviewed');
    expect(report.displayLabels.generatedAt).toBe('Generated at');
    expect(report.displayLabels.includedStatuses).toBe('Included statuses');
    expect(report.exportability.exportable).toBe(false);
    expect(report.exportability.blockers).toEqual(['no_approved_findings', 'report_not_exportable_yet']);
    expect(report.exportability.emptyStates.no_approved_findings.title).toBe('No approved findings');
    expect(report.exportability.emptyStates.missing_approved_evidence.title).toBe('Missing approved evidence');
    expect(report.exportability.emptyStates.mixed_currency_findings.title).toBe('Mixed currencies require separate reports');
    expect(report.exportability.emptyStates.report_not_exportable_yet.title).toBe('Report not exportable yet');
  });

  it('blocks customer-facing totals when approved findings use mixed currencies', () => {
    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings: [
        finding({ id: 'usd', status: 'approved', amountMinor: 100_000, currency: 'USD' }),
        finding({ id: 'eur', status: 'approved', amountMinor: 90_000, currency: 'EUR' })
      ]
    });

    expect(report.exportability.exportable).toBe(false);
    expect(report.exportability.blockers).toEqual(['mixed_currency_findings', 'report_not_exportable_yet']);
    expect(report.includedFindingCount).toBe(0);
    expect(report.totalPotentialLeakageMinor).toBe(0);
    expect(report.methodologyNote).toContain('do not combine findings across currencies');
  });

  it('keeps the top 10 findings concise while the appendix cites every included finding', () => {
    const findings = Array.from({ length: 11 }, (_, index) =>
      finding({
        id: `finding_${index + 1}`,
        status: 'approved',
        amountMinor: (index + 1) * 10_000,
        customerName: index % 2 === 0 ? 'Acme Cloud' : 'Beta Retail',
        findingType: index % 2 === 0 ? 'minimum_commitment_shortfall' : 'missed_annual_uplift'
      })
    );

    const report = generateExecutiveAuditReport({
      organizationName: 'Acme Audit Co.',
      workspaceName: 'Q1 Revenue Leakage Audit',
      findings
    });

    expect(report.topFindings).toHaveLength(10);
    expect(report.topFindings[0]?.id).toBe('finding_11');
    expect(report.appendixWithCitations).toHaveLength(11);
    expect(report.evidenceAppendix).toHaveLength(11);
    expect(report.exportability).toEqual(expect.objectContaining({
      exportable: true,
      statusEligibleFindingCount: 11,
      includedFindingCount: 11,
      excludedAfterEvidenceReviewCount: 0
    }));
  });
});
