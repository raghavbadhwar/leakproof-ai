import type { LeakageFinding } from '../leakage/types';
import { customerFacingFindingStatuses, isCustomerFacingFindingStatus } from '../analytics/statuses';
import {
  approvedEvidenceCitations,
  EVIDENCE_APPROVAL_RULE,
  evidenceSourceType,
  exportBlockerForFinding,
  isContractEvidence,
  isInvoiceOrUsageEvidence,
  normalizeExportCalculation
} from './exportReadiness';

export const REPORT_VERSION = '2026-04-audit-grade-v1';
export const CUSTOMER_FACING_REPORT_STATUSES = customerFacingFindingStatuses satisfies ReadonlyArray<
  LeakageFinding['status']
>;
export const REPORT_DISPLAY_LABELS = {
  customerFacingLeakage: 'Customer-facing leakage',
  approvedEvidenceOnly: 'Approved evidence only',
  humanReviewed: 'Human reviewed',
  generatedAt: 'Generated at',
  includedStatuses: 'Included statuses'
} as const;

export type ReportEmptyStateKey = 'no_approved_findings' | 'missing_approved_evidence' | 'report_not_exportable_yet';

export type ReportCitation = {
  label: string;
  excerpt?: string;
  sourceType?: string;
  approvalState?: 'draft' | 'suggested' | 'approved' | 'rejected';
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
  riskOnly: boolean;
  riskLabel?: 'Risk-only';
};

export type ReportBreakdown = {
  label: string;
  amountMinor: number;
  findingCount: number;
};

export type ExecutiveAuditReport = {
  organizationName: string;
  workspaceName: string;
  generatedBy?: string;
  workspaceId?: string;
  generatedAt: string;
  displayLabels: typeof REPORT_DISPLAY_LABELS;
  metadata: {
    generated_at: string;
    generated_by?: string;
    workspace_id?: string;
    report_version: string;
    included_statuses: Array<(typeof CUSTOMER_FACING_REPORT_STATUSES)[number]>;
    evidence_policy: 'approved_evidence_only';
    review_policy: 'human_reviewed';
    status_eligible_finding_count: number;
    excluded_after_evidence_review_count: number;
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
  includedFindings: CustomerFacingReportFinding[];
  recoverableLeakage: { totalMinor: number; findings: CustomerFacingReportFinding[] };
  preventedFutureLeakage: { totalMinor: number; findings: CustomerFacingReportFinding[] };
  recoveredAmount: { totalMinor: number; findings: CustomerFacingReportFinding[] };
  riskOnlyItems: { totalItems: number; findings: CustomerFacingReportFinding[] };
  leakageByCustomer: Record<string, number>;
  leakageByCategory: Record<string, number>;
  customerBreakdown: ReportBreakdown[];
  categoryBreakdown: ReportBreakdown[];
  topFindings: CustomerFacingReportFinding[];
  methodology: string[];
  methodologyNote: string;
  appendixWithCitations: Array<{ findingId: string; title: string; citations: ReportCitation[] }>;
  evidenceAppendix: Array<{ findingId: string; title: string; citations: ReportCitation[] }>;
  exportability: {
    exportable: boolean;
    blockers: ReportEmptyStateKey[];
    statusEligibleFindingCount: number;
    includedFindingCount: number;
    excludedAfterEvidenceReviewCount: number;
    emptyStates: Record<ReportEmptyStateKey, { title: string; detail: string }>;
  };
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
  const statusEligibleFindings = input.findings.filter(isCustomerFacingStatus);
  const includedFindings = statusEligibleFindings
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
  const riskOnlyFindings = includedFindings.filter((finding) => finding.outcomeType === 'risk_alert');
  const leakageByCustomer = sumBy(includedFindings, (finding) => finding.customerName ?? 'Unassigned customer');
  const leakageByCategory = sumBy(includedFindings, (finding) => finding.findingType);
  const excludedAfterEvidenceReviewCount = statusEligibleFindings.length - includedFindings.length;
  const methodology = [
    `Report boundary: only ${CUSTOMER_FACING_REPORT_STATUSES.join(', ')} findings are included in customer-facing totals.`,
    `Evidence boundary: ${EVIDENCE_APPROVAL_RULE}`,
    'Human review: included findings have a reviewer-approved customer-facing status and approved evidence.',
    'Deterministic TypeScript performs money calculations in integer minor units; AI extraction does not calculate leakage totals.',
    'Money findings require approved contract evidence, approved invoice or usage evidence, and formula inputs before export.',
    'Risk-only findings may export with approved contract evidence, but they are counted separately from recoverable actions.',
    'Dismissed, draft, needs_review, and not_recoverable findings are excluded from customer-facing totals.'
  ];
  const blockers: ReportEmptyStateKey[] = [];
  if (statusEligibleFindings.length === 0) blockers.push('no_approved_findings');
  if (excludedAfterEvidenceReviewCount > 0) blockers.push('missing_approved_evidence');
  if (includedFindings.length === 0) blockers.push('report_not_exportable_yet');

  return {
    organizationName: input.organizationName,
    workspaceName: input.workspaceName,
    generatedBy: input.generatedBy,
    workspaceId: input.workspaceId,
    generatedAt,
    displayLabels: REPORT_DISPLAY_LABELS,
    metadata: {
      generated_at: generatedAt,
      generated_by: input.generatedBy,
      workspace_id: input.workspaceId,
      report_version: REPORT_VERSION,
      included_statuses: [...CUSTOMER_FACING_REPORT_STATUSES],
      evidence_policy: 'approved_evidence_only',
      review_policy: 'human_reviewed',
      status_eligible_finding_count: statusEligibleFindings.length,
      excluded_after_evidence_review_count: excludedAfterEvidenceReviewCount
    },
    currency,
    totalPotentialLeakageMinor,
    totalApprovedRecoverableMinor,
    totalPreventedLeakageMinor,
    totalRecoveredMinor,
    totalRiskOnlyItems: riskOnlyFindings.length,
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
      summary:
        includedFindings.length > 0
          ? `${includedFindings.length} customer-facing findings are backed by approved evidence. The pilot audit shows ${formatMinor(totalPotentialLeakageMinor, currency)} in customer-facing leakage, including ${formatMinor(totalApprovedRecoverableMinor, currency)} recoverable, ${formatMinor(totalPreventedLeakageMinor, currency)} prevented future leakage, and ${formatMinor(totalRecoveredMinor, currency)} already marked recovered.`
          : 'No customer-facing findings are exportable yet. Approve findings and evidence before sending this pilot audit report internally.'
    },
    includedFindings,
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
    riskOnlyItems: {
      totalItems: riskOnlyFindings.length,
      findings: riskOnlyFindings
    },
    leakageByCustomer,
    leakageByCategory,
    customerBreakdown: breakdownBy(includedFindings, (finding) => finding.customerName ?? 'Unassigned customer'),
    categoryBreakdown: breakdownBy(includedFindings, (finding) => finding.findingType),
    topFindings,
    methodology,
    methodologyNote: methodology.join(' '),
    appendixWithCitations: includedFindings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      citations: finding.evidenceCitations
    })),
    evidenceAppendix: includedFindings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      citations: finding.evidenceCitations
    })),
    exportability: {
      exportable: includedFindings.length > 0,
      blockers,
      statusEligibleFindingCount: statusEligibleFindings.length,
      includedFindingCount: includedFindings.length,
      excludedAfterEvidenceReviewCount,
      emptyStates: {
        no_approved_findings: {
          title: 'No approved findings',
          detail: 'Approve at least one finding as approved, customer_ready, or recovered before creating a customer-facing report.'
        },
        missing_approved_evidence: {
          title: 'Missing approved evidence',
          detail: 'Some customer-facing findings were excluded because they do not yet have approved contract evidence and, for money findings, approved invoice or usage evidence.'
        },
        report_not_exportable_yet: {
          title: 'Report not exportable yet',
          detail: 'The report shell can be reviewed internally, but export is blocked until at least one finding passes the approved evidence rules.'
        }
      }
    }
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

function breakdownBy<T extends { amountMinor: number }>(items: T[], keyFor: (item: T) => string): ReportBreakdown[] {
  const amountByKey = sumBy(items, keyFor);
  const countByKey = countBy(items, keyFor);
  return Object.entries(amountByKey)
    .map(([label, amountMinor]) => ({
      label,
      amountMinor,
      findingCount: countByKey[label] ?? 0
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.label.localeCompare(b.label));
}

function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amountMinor / 100);
}

function isCustomerFacingStatus(finding: ReportFinding): boolean {
  return isCustomerFacingFindingStatus(finding.status);
}

function toCustomerFacingFinding(finding: ReportFinding): CustomerFacingReportFinding | null {
  const blocker = exportBlockerForFinding({
    status: finding.status,
    outcomeType: finding.outcomeType,
    calculation: finding.calculation,
    evidenceCitations: finding.evidenceCitations ?? []
  });
  if (blocker) return null;

  const evidenceCitations = approvedEvidenceCitations(finding.evidenceCitations ?? []).map((citation) => ({
    ...citation,
    sourceType: evidenceSourceType(citation)
  }));
  const contractCitation = evidenceCitations.find(isContractEvidence);
  if (!contractCitation) return null;

  const calculation =
    normalizeExportCalculation(finding.calculation) ??
    ({
      formula: 'Risk-only finding; no recoverable amount calculation is exported.',
      inputValues: {}
    } satisfies { formula: string; inputValues: Record<string, unknown> });

  const riskOnly = finding.outcomeType === 'risk_alert';
  return {
    ...finding,
    ...calculation,
    contractCitation,
    invoiceUsageCitations: evidenceCitations.filter(isInvoiceOrUsageEvidence),
    reviewerStatus: finding.status,
    evidenceCitations,
    riskOnly,
    riskLabel: riskOnly ? 'Risk-only' : undefined
  };
}
