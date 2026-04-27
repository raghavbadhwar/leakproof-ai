import {
  classifyRootCauseDeterministic,
  operationalOwnerFor,
  preventionRecommendationFor,
  rootCauseLabel
} from '../ai/rootCause';
import type { RootCauseCategory } from '../ai/rootCauseSchema';
import {
  customerFacingFindingStatuses,
  internalPipelineFindingStatuses,
  isCustomerFacingFindingStatus,
  isInternalPipelineFindingStatus,
  type FindingStatus
} from './statuses';
import type { AnalyticsPoint } from './workspaceAnalytics';

export type RootCauseAnalyticsFinding = {
  id: string;
  title: string;
  findingType: string;
  outcomeType: 'recoverable_leakage' | 'prevented_future_leakage' | 'risk_alert' | string;
  status: FindingStatus;
  amountMinor: number;
  currency: string;
  confidence: number;
  summary?: string | null;
  evidenceCoverageStatus?: string | null;
  calculation?: Record<string, unknown> | null;
};

export type RootCausePriority = {
  rootCause: RootCauseCategory;
  label: string;
  priorityScore: number;
  findingCount: number;
  leakageAmountMinor: number;
  preventionRecommendation: string;
  operationalOwnerSuggestion: string;
};

export type RootCauseRecurringPattern = {
  rootCause: RootCauseCategory;
  label: string;
  findingCount: number;
  customerFacingCount: number;
  internalPipelineCount: number;
  customerFacingLeakageMinor: number;
  internalPipelineExposureMinor: number;
};

export type RootCauseOperationalFix = {
  rootCause: RootCauseCategory;
  label: string;
  operationalOwnerSuggestion: string;
  preventionRecommendation: string;
  customerFacingLeakageMinor: number;
  internalPipelineExposureMinor: number;
  findingCount: number;
  priorityScore: number;
};

export type RootCauseAnalyticsSlice = {
  label: string;
  description: string;
  statuses: readonly string[];
  rootCausesByCount: AnalyticsPoint[];
  rootCausesByLeakageAmount: AnalyticsPoint[];
  preventionPriority: RootCausePriority[];
};

export type RootCauseAnalyticsPayload = {
  currency: string;
  generatedAt: string;
  customerFacing: RootCauseAnalyticsSlice;
  internalPipeline: RootCauseAnalyticsSlice;
  recurringPatterns: RootCauseRecurringPattern[];
  topOperationalFixes: RootCauseOperationalFix[];
};

type ClassifiedFinding = RootCauseAnalyticsFinding & {
  rootCause: RootCauseCategory;
  rootCauseLabel: string;
};

export function buildRootCauseAnalytics(input: {
  findings: RootCauseAnalyticsFinding[];
  generatedAt?: string;
}): RootCauseAnalyticsPayload {
  const classified = input.findings.map((finding) => ({
    ...finding,
    rootCause: classifyRootCauseDeterministic({
      finding: {
        id: finding.id,
        type: finding.findingType,
        outcomeType: finding.outcomeType,
        title: finding.title,
        summary: finding.summary ?? '',
        status: finding.status,
        estimatedAmountMinor: finding.amountMinor,
        currency: finding.currency,
        confidence: finding.confidence,
        evidenceCoverageStatus: finding.evidenceCoverageStatus,
        calculation: finding.calculation
      },
      approvedEvidence: []
    }).primaryRootCause
  })).map((finding) => ({
    ...finding,
    rootCauseLabel: rootCauseLabel(finding.rootCause)
  }));
  const customerFacing = classified.filter((finding) => isCustomerFacingFindingStatus(finding.status));
  const internalPipeline = classified.filter((finding) => isInternalPipelineFindingStatus(finding.status));
  const currency = customerFacing[0]?.currency ?? classified[0]?.currency ?? 'USD';

  return {
    currency,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    customerFacing: {
      label: 'Customer-facing root causes',
      description: 'Amounts include only approved, customer_ready, and recovered findings.',
      statuses: customerFacingFindingStatuses,
      rootCausesByCount: groupCount(customerFacing),
      rootCausesByLeakageAmount: groupAmount(customerFacing),
      preventionPriority: preventionPriority(customerFacing)
    },
    internalPipeline: {
      label: 'Internal root-cause pipeline',
      description: 'Draft and needs-review amounts are internal exposure, not customer-facing leakage.',
      statuses: internalPipelineFindingStatuses,
      rootCausesByCount: groupCount(internalPipeline),
      rootCausesByLeakageAmount: groupAmount(internalPipeline),
      preventionPriority: preventionPriority(internalPipeline)
    },
    recurringPatterns: recurringPatterns(classified),
    topOperationalFixes: topOperationalFixes(classified)
  };
}

function groupCount(findings: ClassifiedFinding[]): AnalyticsPoint[] {
  const grouped = new Map<string, { label: string; count: number; amountMinor: number }>();
  for (const finding of findings) {
    const key = finding.rootCause;
    const current = grouped.get(key) ?? { label: finding.rootCauseLabel, count: 0, amountMinor: 0 };
    current.count += 1;
    current.amountMinor += finding.amountMinor;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({ label: item.label, value: item.count, count: item.count, amountMinor: item.amountMinor }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function groupAmount(findings: ClassifiedFinding[]): AnalyticsPoint[] {
  const grouped = new Map<string, { label: string; count: number; amountMinor: number }>();
  for (const finding of findings) {
    const key = finding.rootCause;
    const current = grouped.get(key) ?? { label: finding.rootCauseLabel, count: 0, amountMinor: 0 };
    current.count += 1;
    current.amountMinor += finding.amountMinor;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({ label: item.label, value: item.amountMinor, count: item.count, amountMinor: item.amountMinor }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function preventionPriority(findings: ClassifiedFinding[]): RootCausePriority[] {
  const grouped = groupByRootCause(findings);
  return Array.from(grouped.entries())
    .map(([rootCause, rows]) => {
      const leakageAmountMinor = sumAmount(rows);
      return {
        rootCause,
        label: rootCauseLabel(rootCause),
        priorityScore: priorityScore(rows, leakageAmountMinor),
        findingCount: rows.length,
        leakageAmountMinor,
        preventionRecommendation: preventionRecommendationFor(rootCause),
        operationalOwnerSuggestion: operationalOwnerFor(rootCause)
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.leakageAmountMinor - a.leakageAmountMinor)
    .slice(0, 8);
}

function recurringPatterns(findings: ClassifiedFinding[]): RootCauseRecurringPattern[] {
  const grouped = groupByRootCause(findings);
  return Array.from(grouped.entries())
    .map(([rootCause, rows]) => {
      const customerFacingRows = rows.filter((row) => isCustomerFacingFindingStatus(row.status));
      const internalPipelineRows = rows.filter((row) => isInternalPipelineFindingStatus(row.status));
      return {
        rootCause,
        label: rootCauseLabel(rootCause),
        findingCount: rows.length,
        customerFacingCount: customerFacingRows.length,
        internalPipelineCount: internalPipelineRows.length,
        customerFacingLeakageMinor: sumAmount(customerFacingRows),
        internalPipelineExposureMinor: sumAmount(internalPipelineRows)
      };
    })
    .sort((a, b) =>
      b.findingCount - a.findingCount ||
      b.customerFacingLeakageMinor - a.customerFacingLeakageMinor ||
      a.label.localeCompare(b.label)
    )
    .slice(0, 10);
}

function topOperationalFixes(findings: ClassifiedFinding[]): RootCauseOperationalFix[] {
  const grouped = groupByRootCause(findings);
  return Array.from(grouped.entries())
    .map(([rootCause, rows]) => {
      const customerFacingRows = rows.filter((row) => isCustomerFacingFindingStatus(row.status));
      const internalPipelineRows = rows.filter((row) => isInternalPipelineFindingStatus(row.status));
      const customerFacingLeakageMinor = sumAmount(customerFacingRows);
      const internalPipelineExposureMinor = sumAmount(internalPipelineRows);
      return {
        rootCause,
        label: rootCauseLabel(rootCause),
        operationalOwnerSuggestion: operationalOwnerFor(rootCause),
        preventionRecommendation: preventionRecommendationFor(rootCause),
        customerFacingLeakageMinor,
        internalPipelineExposureMinor,
        findingCount: rows.length,
        priorityScore: priorityScore(rows, customerFacingLeakageMinor + internalPipelineExposureMinor)
      };
    })
    .sort((a, b) =>
      b.priorityScore - a.priorityScore ||
      b.customerFacingLeakageMinor - a.customerFacingLeakageMinor ||
      a.label.localeCompare(b.label)
    )
    .slice(0, 6);
}

function groupByRootCause(findings: ClassifiedFinding[]): Map<RootCauseCategory, ClassifiedFinding[]> {
  const grouped = new Map<RootCauseCategory, ClassifiedFinding[]>();
  for (const finding of findings) {
    grouped.set(finding.rootCause, [...(grouped.get(finding.rootCause) ?? []), finding]);
  }
  return grouped;
}

function sumAmount(findings: ClassifiedFinding[]): number {
  return findings.reduce((sum, finding) => sum + finding.amountMinor, 0);
}

function priorityScore(findings: ClassifiedFinding[], amountMinor: number): number {
  const highConfidenceCount = findings.filter((finding) => finding.confidence >= 0.85).length;
  const severityWeight = findings.length * 10 + highConfidenceCount * 5;
  return Math.round((amountMinor / 10_000) + severityWeight);
}
