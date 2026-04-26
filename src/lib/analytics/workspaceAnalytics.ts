export const customerFacingFindingStatuses = ['approved', 'customer_ready', 'recovered'] as const;
export const internalPipelineFindingStatuses = ['draft', 'needs_review'] as const;
export const closedReviewFindingStatuses = ['dismissed', 'not_recoverable'] as const;

export type FindingStatus =
  | 'draft'
  | 'needs_review'
  | 'approved'
  | 'dismissed'
  | 'customer_ready'
  | 'recovered'
  | 'not_recoverable'
  | string;

export type WorkspaceAnalyticsFinding = {
  id: string;
  title: string;
  findingType: string;
  outcomeType: 'recoverable_leakage' | 'prevented_future_leakage' | 'risk_alert' | string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string | null;
  status: FindingStatus;
  amountMinor: number;
  currency: string;
  confidence: number;
  customerId?: string | null;
  customerName?: string | null;
  customerSegment?: string | null;
  billingModel?: string | null;
  contractType?: string | null;
  reviewerId?: string | null;
  reviewedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  evidenceCoverageStatus?: string | null;
};

export type WorkspaceAnalyticsDocument = {
  id: string;
  documentType: string;
  parseStatus?: string | null;
  chunkingStatus?: string | null;
  embeddingStatus?: string | null;
};

export type WorkspaceAnalyticsTerm = {
  id: string;
  termType: string;
  reviewStatus: string;
  confidence: number;
};

export type WorkspaceAnalyticsUsage = {
  id: string;
  metricName: string;
  quantity: number;
  productLabel?: string | null;
  teamLabel?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  customerName?: string | null;
};

export type WorkspaceAnalyticsAuditEvent = {
  eventType: string;
  entityId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

export type AnalyticsPoint = {
  label: string;
  value: number;
  amountMinor?: number;
  count?: number;
};

export type AnalyticsTrendPoint = {
  period: string;
  identifiedMinor: number;
  approvedMinor: number;
  recoveredMinor: number;
  preventedMinor: number;
  internalPipelineMinor: number;
};

export type WorkspaceAnalyticsPayload = {
  currency: string;
  generatedAt: string;
  customerFacing: {
    label: 'Customer-facing leakage';
    description: string;
    statuses: readonly string[];
    totalLeakageMinor: number;
    recoverableLeakageMinor: number;
    preventedLeakageMinor: number;
    recoveredLeakageMinor: number;
    findingCount: number;
    byCategory: AnalyticsPoint[];
    byCustomer: AnalyticsPoint[];
    bySegment: AnalyticsPoint[];
    byBillingModel: AnalyticsPoint[];
    trend: AnalyticsTrendPoint[];
    recoveryPerformance: AnalyticsTrendPoint[];
    concentrationRisk: AnalyticsPoint[];
  };
  internalPipeline: {
    label: 'Internal pipeline';
    description: string;
    statuses: readonly string[];
    unapprovedExposureMinor: number;
    findingCount: number;
    needsReviewCount: number;
    byCategory: AnalyticsPoint[];
    byStatus: AnalyticsPoint[];
    byContractType: AnalyticsPoint[];
    trend: AnalyticsTrendPoint[];
    topUnapproved: AnalyticsPoint[];
  };
  reviewBurden: {
    label: 'Needs finance review';
    description: string;
    allStatuses: AnalyticsPoint[];
    confidenceDistribution: AnalyticsPoint[];
    evidenceCoverage: AnalyticsPoint[];
    reviewerWorkload: AnalyticsPoint[];
    averageReviewTurnaroundHours: number | null;
  };
  operations: {
    documentPipeline: AnalyticsPoint[];
    contractHealth: AnalyticsPoint[];
    usageVariance: AnalyticsPoint[];
    renewalCalendar: AnalyticsPoint[];
    recurringPatterns: AnalyticsPoint[];
  };
};

export function isCustomerFacingStatus(status: string): boolean {
  return customerFacingFindingStatuses.includes(status as (typeof customerFacingFindingStatuses)[number]);
}

export function isInternalPipelineStatus(status: string): boolean {
  return internalPipelineFindingStatuses.includes(status as (typeof internalPipelineFindingStatuses)[number]);
}

export function buildWorkspaceAnalytics(input: {
  findings: WorkspaceAnalyticsFinding[];
  documents?: WorkspaceAnalyticsDocument[];
  terms?: WorkspaceAnalyticsTerm[];
  usage?: WorkspaceAnalyticsUsage[];
  auditEvents?: WorkspaceAnalyticsAuditEvent[];
  generatedAt?: string;
}): WorkspaceAnalyticsPayload {
  const findings = input.findings;
  const customerFacing = findings.filter((finding) => isCustomerFacingStatus(finding.status));
  const internalPipeline = findings.filter((finding) => isInternalPipelineStatus(finding.status));
  const reviewable = findings.filter((finding) => isInternalPipelineStatus(finding.status) || closedReviewFindingStatuses.includes(finding.status as never));
  const currency = customerFacing[0]?.currency ?? findings[0]?.currency ?? 'USD';

  return {
    currency,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    customerFacing: {
      label: 'Customer-facing leakage',
      description: 'Only approved, customer-ready, and recovered findings are included. Draft and needs-review findings are excluded.',
      statuses: customerFacingFindingStatuses,
      totalLeakageMinor: sumAmount(customerFacing),
      recoverableLeakageMinor: sumAmount(customerFacing.filter((finding) => finding.outcomeType === 'recoverable_leakage')),
      preventedLeakageMinor: sumAmount(customerFacing.filter((finding) => finding.outcomeType === 'prevented_future_leakage')),
      recoveredLeakageMinor: sumAmount(customerFacing.filter((finding) => finding.status === 'recovered')),
      findingCount: customerFacing.length,
      byCategory: groupAmount(customerFacing, (finding) => labelize(finding.findingType)),
      byCustomer: groupAmount(customerFacing, (finding) => finding.customerName ?? 'Unassigned customer'),
      bySegment: groupAmount(customerFacing, (finding) => finding.customerSegment ?? 'Unsegmented'),
      byBillingModel: groupAmount(customerFacing, (finding) => finding.billingModel ?? 'Unknown billing model'),
      trend: buildTrend(findings),
      recoveryPerformance: buildTrend(findings),
      concentrationRisk: groupAmount(customerFacing, (finding) => finding.customerName ?? 'Unassigned customer').slice(0, 10)
    },
    internalPipeline: {
      label: 'Internal pipeline',
      description: 'Draft and needs-review findings are unapproved exposure for finance review, not customer-facing leakage.',
      statuses: internalPipelineFindingStatuses,
      unapprovedExposureMinor: sumAmount(internalPipeline),
      findingCount: internalPipeline.length,
      needsReviewCount: internalPipeline.filter((finding) => finding.status === 'needs_review').length,
      byCategory: groupAmount(internalPipeline, (finding) => labelize(finding.findingType)),
      byStatus: groupCount(internalPipeline, (finding) => labelize(finding.status)),
      byContractType: groupAmount(internalPipeline, (finding) => finding.contractType ?? 'Unknown contract type'),
      trend: buildTrend(findings),
      topUnapproved: internalPipeline
        .slice()
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .slice(0, 10)
        .map((finding) => ({ label: finding.title, value: finding.amountMinor, amountMinor: finding.amountMinor, count: 1 }))
    },
    reviewBurden: {
      label: 'Needs finance review',
      description: 'Includes draft, needs-review, dismissed, and not-recoverable workflow outcomes for internal audit operations.',
      allStatuses: groupCount(findings, (finding) => labelize(finding.status)),
      confidenceDistribution: confidenceBuckets(reviewable.length > 0 ? reviewable : findings),
      evidenceCoverage: groupCount(findings, (finding) => labelize(finding.evidenceCoverageStatus ?? 'pending')),
      reviewerWorkload: groupCount(
        findings.filter((finding) => Boolean(finding.reviewerId)),
        (finding) => finding.reviewerId ?? 'Unassigned'
      ),
      averageReviewTurnaroundHours: averageReviewTurnaroundHours(findings)
    },
    operations: {
      documentPipeline: documentPipeline(input.documents ?? []),
      contractHealth: contractHealth(input.terms ?? []),
      usageVariance: usageVariance(input.usage ?? []),
      renewalCalendar: renewalCalendar(input.terms ?? []),
      recurringPatterns: groupCount(findings, (finding) => labelize(finding.findingType)).slice(0, 10)
    }
  };
}

function sumAmount(findings: WorkspaceAnalyticsFinding[]): number {
  return findings.reduce((sum, finding) => sum + finding.amountMinor, 0);
}

function groupAmount(items: WorkspaceAnalyticsFinding[], keyFor: (item: WorkspaceAnalyticsFinding) => string): AnalyticsPoint[] {
  const grouped = new Map<string, { amountMinor: number; count: number }>();
  for (const item of items) {
    const key = keyFor(item);
    const current = grouped.get(key) ?? { amountMinor: 0, count: 0 };
    current.amountMinor += item.amountMinor;
    current.count += 1;
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([label, value]) => ({ label, value: value.amountMinor, amountMinor: value.amountMinor, count: value.count }))
    .sort((a, b) => b.value - a.value);
}

function groupCount<T>(items: T[], keyFor: (item: T) => string): AnalyticsPoint[] {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .map(([label, value]) => ({ label, value, count: value }))
    .sort((a, b) => b.value - a.value);
}

function buildTrend(findings: WorkspaceAnalyticsFinding[]): AnalyticsTrendPoint[] {
  const grouped = new Map<string, AnalyticsTrendPoint>();

  for (const finding of findings) {
    const period = monthKey(finding.updatedAt ?? finding.reviewedAt ?? finding.createdAt);
    const current = grouped.get(period) ?? {
      period,
      identifiedMinor: 0,
      approvedMinor: 0,
      recoveredMinor: 0,
      preventedMinor: 0,
      internalPipelineMinor: 0
    };

    if (isCustomerFacingStatus(finding.status)) {
      current.identifiedMinor += finding.amountMinor;
      current.approvedMinor += finding.amountMinor;
      if (finding.status === 'recovered') current.recoveredMinor += finding.amountMinor;
      if (finding.outcomeType === 'prevented_future_leakage') current.preventedMinor += finding.amountMinor;
    } else if (isInternalPipelineStatus(finding.status)) {
      current.internalPipelineMinor += finding.amountMinor;
    }

    grouped.set(period, current);
  }

  return Array.from(grouped.values()).sort((a, b) => a.period.localeCompare(b.period));
}

function confidenceBuckets(findings: WorkspaceAnalyticsFinding[]): AnalyticsPoint[] {
  const buckets = [
    { label: 'High confidence', min: 0.85, max: 1.01 },
    { label: 'Medium confidence', min: 0.65, max: 0.85 },
    { label: 'Low confidence', min: 0, max: 0.65 }
  ];

  return buckets.map((bucket) => {
    const matches = findings.filter((finding) => finding.confidence >= bucket.min && finding.confidence < bucket.max);
    return { label: bucket.label, value: matches.length, count: matches.length, amountMinor: sumAmount(matches) };
  });
}

function documentPipeline(documents: WorkspaceAnalyticsDocument[]): AnalyticsPoint[] {
  const uploaded = documents.length;
  const parsed = documents.filter((document) => document.parseStatus === 'parsed').length;
  const chunked = documents.filter((document) => document.chunkingStatus === 'chunked').length;
  const embedded = documents.filter((document) => document.embeddingStatus === 'embedded').length;

  return [
    { label: 'Uploaded', value: uploaded, count: uploaded },
    { label: 'Parsed', value: parsed, count: parsed },
    { label: 'Chunked', value: chunked, count: chunked },
    { label: 'Embedded', value: embedded, count: embedded }
  ];
}

function contractHealth(terms: WorkspaceAnalyticsTerm[]): AnalyticsPoint[] {
  const approved = terms.filter((term) => ['approved', 'edited'].includes(term.reviewStatus)).length;
  const pending = terms.filter((term) => ['extracted', 'needs_review'].includes(term.reviewStatus)).length;
  const rejected = terms.filter((term) => term.reviewStatus === 'rejected').length;
  const lowConfidence = terms.filter((term) => term.confidence < 0.65).length;
  const renewalTerms = terms.filter((term) => /renewal|notice|contract_end/i.test(term.termType)).length;

  return [
    { label: 'Terms approved', value: approved, count: approved },
    { label: 'Pending review', value: pending, count: pending },
    { label: 'Rejected terms', value: rejected, count: rejected },
    { label: 'Low confidence', value: lowConfidence, count: lowConfidence },
    { label: 'Renewal clauses', value: renewalTerms, count: renewalTerms }
  ];
}

function usageVariance(usage: WorkspaceAnalyticsUsage[]): AnalyticsPoint[] {
  return groupUsage(usage, (row) => row.productLabel ?? row.teamLabel ?? row.metricName).slice(0, 12);
}

function renewalCalendar(terms: WorkspaceAnalyticsTerm[]): AnalyticsPoint[] {
  const renewalTerms = terms.filter((term) => /renewal|notice|contract_end/i.test(term.termType));
  return groupCount(renewalTerms, (term) => labelize(term.termType));
}

function groupUsage(items: WorkspaceAnalyticsUsage[], keyFor: (item: WorkspaceAnalyticsUsage) => string): AnalyticsPoint[] {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, (grouped.get(key) ?? 0) + item.quantity);
  }

  return Array.from(grouped.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function averageReviewTurnaroundHours(findings: WorkspaceAnalyticsFinding[]): number | null {
  const durations = findings
    .map((finding) => {
      if (!finding.createdAt || !finding.reviewedAt) return null;
      const created = Date.parse(finding.createdAt);
      const reviewed = Date.parse(finding.reviewedAt);
      if (!Number.isFinite(created) || !Number.isFinite(reviewed) || reviewed < created) return null;
      return (reviewed - created) / (1000 * 60 * 60);
    })
    .filter((value): value is number => value !== null);

  if (durations.length === 0) return null;
  return Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10;
}

function monthKey(value: string | null | undefined): string {
  if (!value) return 'Unscheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function labelize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
