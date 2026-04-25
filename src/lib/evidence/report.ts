import type { LeakageFinding } from '../leakage/types';

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
  evidenceCitations?: Array<{ label: string; excerpt?: string; sourceType?: string }>;
};

export type ExecutiveAuditReport = {
  organizationName: string;
  workspaceName: string;
  generatedAt: string;
  currency: string;
  totalPotentialLeakageMinor: number;
  totalApprovedRecoverableMinor: number;
  totalPreventedLeakageMinor: number;
  totalRiskOnlyItems: number;
  findingsByCategory: Record<string, number>;
  findingsByCustomer: Record<string, number>;
  findingsByStatus: Record<string, number>;
  topFindings: ReportFinding[];
  evidenceAppendix: Array<{ findingId: string; title: string; citations: Array<{ label: string; excerpt?: string; sourceType?: string }> }>;
  methodologyNote: string;
};

const CUSTOMER_READY_STATUSES: Array<LeakageFinding['status']> = ['approved', 'customer_ready', 'recovered'];

export function generateExecutiveAuditReport(input: {
  organizationName: string;
  workspaceName: string;
  findings: ReportFinding[];
  generatedAt?: string;
}): ExecutiveAuditReport {
  const approvedFindings = input.findings.filter((finding) => CUSTOMER_READY_STATUSES.includes(finding.status));
  const currency = approvedFindings[0]?.currency ?? input.findings[0]?.currency ?? 'USD';
  const topFindings = [...approvedFindings].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 10);

  return {
    organizationName: input.organizationName,
    workspaceName: input.workspaceName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    currency,
    totalPotentialLeakageMinor: approvedFindings.reduce((sum, finding) => sum + finding.amountMinor, 0),
    totalApprovedRecoverableMinor: sumByOutcome(approvedFindings, 'recoverable_leakage'),
    totalPreventedLeakageMinor: sumByOutcome(approvedFindings, 'prevented_future_leakage'),
    totalRiskOnlyItems: approvedFindings.filter((finding) => finding.outcomeType === 'risk_alert').length,
    findingsByCategory: countBy(approvedFindings, (finding) => finding.findingType),
    findingsByCustomer: countBy(approvedFindings, (finding) => finding.customerName ?? 'Unassigned customer'),
    findingsByStatus: countBy(input.findings, (finding) => finding.status),
    topFindings,
    evidenceAppendix: topFindings.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      citations: finding.evidenceCitations ?? []
    })),
    methodologyNote:
      'Gemini extracts and retrieves source evidence. Deterministic TypeScript calculates financial amounts using integer minor units. Only human-approved findings and approved evidence are included in customer-ready totals.'
  };
}

function sumByOutcome(findings: ReportFinding[], outcomeType: ReportFinding['outcomeType']): number {
  return findings
    .filter((finding) => finding.outcomeType === outcomeType)
    .reduce((sum, finding) => sum + finding.amountMinor, 0);
}

function countBy<T>(items: T[], keyFor: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
