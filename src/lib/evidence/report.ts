import type { LeakageFinding } from '../leakage/types';
import { customerFacingFindingStatuses, isCustomerFacingFindingStatus } from '../analytics/statuses';

export const REPORT_VERSION = '2026-04-audit-grade-v1';
export const CUSTOMER_FACING_REPORT_STATUSES = customerFacingFindingStatuses satisfies ReadonlyArray<
  LeakageFinding['status']
>;

export type ReportCitation = {
  label: string;
  excerpt?: string;
  sourceType?: string;
  approvalState?: 'suggested' | 'approved' | 'rejected';
};

export type ReportFinding = {
  id: string;
  title: string;
  findingType: LeakageFinding['type'] | string;
  outcomeType: LeakageFinding['outcomeType'];
  status: LeakageFinding['status'];
  amountMinor: number;
  currency: string;
  confidence: number;
  customerName?: string;
  recommendedAction?: string;
  calculation?: Record<string, unknown>;
  reviewerUserId?: string | null;
  reviewedAt?: string | null;
  evidenceCitations?: ReportCitation[];
};

export type CustomerFacingReportFinding = ReportFinding & {
  formula: string;
  inputValues: Record<string, unknown>;
  contractCitation: ReportCitation;
  invoiceUsageCitations: ReportCitation[];
  reviewerStatus: LeakageFinding['status'];
  evidenceCitations: ReportCitation[];
};

export type ExecutiveAuditReport = {
  organizationName: string;
  workspaceName: string;
  generatedBy?: string;
  workspaceId?: string;
  generatedAt: string;
  metadata: {
    generated_at: string;
    generated_by?: string;
    workspace_id?: string;
    report_version: string;
    included_statuses: Array<(typeof CUSTOMER_FACING_REPORT_STATUSES)[number]>;
  };
  currency: string;
  totalPotentialLeakageMinor: number;
  totalApprovedRecoverableMinor: number;
  totalPreventedLeakageMinor: number;
  totalRecoveredMinor: number;
  totalRiskOnlyItems: number;
  includedFindingCount: number;
  findingsByCategory: Record<string, number>;
  findingsByCustomer: Record<string, number>;
  findingsByStatus: Record<string, number>;
  executiveSummary: {
    totalLeakageMinor: number;
    recoverableLeakageMinor: number;
    preventedFutureLeakageMinor: number;
    recoveredAmountMinor: number;
    includedFindingCount: number;
    currency: string;
    summary: string;
  };
  recoverableLeakage: { totalMinor: number; findings: CustomerFacingReportFinding[] };
  preventedFutureLeakage: { totalMinor: number; findings: CustomerFacingReportFinding[] };
  recoveredAmount: { totalMinor: number; findings: CustomerFacingReportFinding[] };
  leakageByCustomer: Record<string, number>;
  leakageByCategory: Record<string, number>;
  topFindings: CustomerFacingReportFinding[];
  methodology: string[];
  methodologyNote: string;
  appendixWithCitations: Array<{ findingId: string; title: string; citations: ReportCitation[] }>;
  evidenceAppendix: Array<{ findingId: string; title: string; citations: ReportCitation[] }>;
};

export function generateExecutiveAuditReport(input: {
  organizationName: string;
  workspaceName: string;
  workspaceId?: string;
  generatedBy?: string;
  findings: ReportFinding[];
  generatedAt?: string;
}): ExecutiveAuditReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const includedFindings = input.findings
    .filter(isCustomerFacingStatus)
    .map(toCustomerFacingFinding)
    .filter((finding): finding is CustomerFacingReportFinding => finding !== null);
  const currency = includedFindings[0]?.currency ?? input.findings[0]?.currency ?? 'USD';
  const topFindings = [...includedFindings].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 10);
  const totalPotentialLeakageMinor = includedFindings.reduce((sum, finding) => sum + finding.amountMinor, 0);
  const totalApprovedRecoverableMinor = sumByOutcome(includedFindings, 'recoverable_leakage');
  const totalPreventedLeakageMinor = sumByOutcome(includedFindings, 'prevented_future_leakage');
  const totalRecoveredMinor = includedFindings
    .filter((finding) => finding.status === 'recovered')
    .reduce((sum, finding) => sum + finding.amountMinor, 0);
  const leakageByCustomer = sumBy(includedFindings, (finding) => finding.customerName ?? 'Unassigned customer');
  const leakageByCategory = sumBy(includedFindings, (finding) => finding.findingType);
  const methodology = [
    'Source documents are ingested as citation-ready chunks and candidate evidence.',
    'Reviewers approve evidence candidates before attached evidence can appear in customer-facing exports.',
    'Deterministic TypeScript performs money calculations in integer minor units; AI extraction does not calculate leakage totals.',
    `External reports include only ${CUSTOMER_FACING_REPORT_STATUSES.join(', ')} findings with approved evidence.`,
    'Dismissed, draft, needs_review, and not_recoverable findings are excluded from customer-facing totals.'
  ];

  return {
    organizationName: input.organizationName,
    workspaceName: input.workspaceName,
    generatedBy: input.generatedBy,
    workspaceId: input.workspaceId,
    generatedAt,
    metadata: {
      generated_at: generatedAt,
      generated_by: input.generatedBy,
      workspace_id: input.workspaceId,
      report_version: REPORT_VERSION,
      included_statuses: [...CUSTOMER_FACING_REPORT_STATUSES]
    },
    currency,
    totalPotentialLeakageMinor,
    totalApprovedRecoverableMinor,
    totalPreventedLeakageMinor,
    totalRecoveredMinor,
    totalRiskOnlyItems: includedFindings.filter((finding) => finding.outcomeType === 'risk_alert').length,
    includedFindingCount: includedFindings.length,
    findingsByCategory: countBy(includedFindings, (finding) => finding.findingType),
    findingsByCustomer: countBy(includedFindings, (finding) => finding.customerName ?? 'Unassigned customer'),
    findingsByStatus: countBy(includedFindings, (finding) => finding.status),
    executiveSummary: {
      totalLeakageMinor: totalPotentialLeakageMinor,
      recoverableLeakageMinor: totalApprovedRecoverableMinor,
      preventedFutureLeakageMinor: totalPreventedLeakageMinor,
      recoveredAmountMinor: totalRecoveredMinor,
      includedFindingCount: includedFindings.length,
      currency,
      summary: `${includedFindings.length} customer-facing findings are supported by approved evidence and included in this audit report.`
    },
    recoverableLeakage: {
      totalMinor: totalApprovedRecoverableMinor,
      findings: includedFindings.filter((finding) => finding.outcomeType === 'recoverable_leakage')
    },
    preventedFutureLeakage: {
      totalMinor: totalPreventedLeakageMinor,
      findings: includedFindings.filter((finding) => finding.outcomeType === 'prevented_future_leakage')
    },
    recoveredAmount: {
      totalMinor: totalRecoveredMinor,
      findings: includedFindings.filter((finding) => finding.status === 'recovered')
    },
    leakageByCustomer,
    leakageByCategory,
    topFindings,
    methodology,
    methodologyNote: methodology.join(' '),
    appendixWithCitations: topFindings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      citations: finding.evidenceCitations
    })),
    evidenceAppendix: topFindings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      citations: finding.evidenceCitations
    }))
  };
}

function sumByOutcome(findings: ReportFinding[], outcomeType: ReportFinding['outcomeType']): number {
  return findings
    .filter((finding) => finding.outcomeType === outcomeType)
    .reduce((sum, finding) => sum + finding.amountMinor, 0);
}

function sumBy<T extends { amountMinor: number }>(items: T[], keyFor: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((sums, item) => {
    const key = keyFor(item);
    sums[key] = (sums[key] ?? 0) + item.amountMinor;
    return sums;
  }, {});
}

function countBy<T>(items: T[], keyFor: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function isCustomerFacingStatus(finding: ReportFinding): boolean {
  return isCustomerFacingFindingStatus(finding.status);
}

function toCustomerFacingFinding(finding: ReportFinding): CustomerFacingReportFinding | null {
  const evidenceCitations = approvedCitations(finding.evidenceCitations ?? []);
  const contractCitation = evidenceCitations.find((citation) => citation.sourceType === 'contract');
  if (!contractCitation || evidenceCitations.length === 0) return null;

  const calculation = normalizeCalculation(finding.calculation);
  return {
    ...finding,
    ...calculation,
    contractCitation,
    invoiceUsageCitations: evidenceCitations.filter((citation) => citation.sourceType === 'invoice' || citation.sourceType === 'usage'),
    reviewerStatus: finding.status,
    evidenceCitations
  };
}

function approvedCitations(citations: ReportCitation[]): ReportCitation[] {
  return citations.filter((citation) => !citation.approvalState || citation.approvalState === 'approved');
}

function normalizeCalculation(calculation: ReportFinding['calculation']): { formula: string; inputValues: Record<string, unknown> } {
  const inputValues = isRecord(calculation) ? { ...calculation } : {};
  const formulaValue = inputValues.formula;
  const formula = typeof formulaValue === 'string' && formulaValue.trim().length > 0 ? formulaValue : 'See approved calculation inputs.';
  delete inputValues.formula;

  return { formula, inputValues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
