import { isCustomerFacingFindingStatus, isInternalPipelineFindingStatus } from './statuses';

export type GuidedAuditDocument = {
  id: string;
  customer_id?: string | null;
  document_type: string;
  file_name?: string | null;
  parse_status?: string | null;
  chunking_status?: string | null;
  embedding_status?: string | null;
  created_at?: string | null;
};

export type GuidedAuditTerm = {
  id: string;
  source_document_id?: string | null;
  customer_id?: string | null;
  term_type: string;
  confidence: number;
  review_status: string;
  updated_at?: string | null;
};

export type GuidedAuditFinding = {
  id: string;
  customer_id?: string | null;
  finding_type: string;
  title: string;
  summary?: string | null;
  estimated_amount_minor: number;
  currency: string;
  confidence: number;
  status: string;
  severity?: string | null;
  evidence_coverage_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type GuidedAuditEvidenceCandidate = {
  id: string;
  finding_id?: string | null;
  retrieval_score: number;
  approval_state: string;
  created_at?: string | null;
  document_chunk?: {
    source_label?: string | null;
  } | null;
};

export type GuidedAuditReadinessIssue = {
  category: string;
  severity: 'blocker' | 'warning' | string;
  title: string;
  explanation?: string;
  recommendedAction?: string;
  affectedEntityIds?: string[];
  deepLink?: string;
};

export type GuidedAuditSummary = {
  customerFacingApprovedMinor: number;
  internalUnapprovedExposureMinor: number;
  customerFacingFindingCount: number;
  internalFindingCount: number;
  readyToReportCount: number;
  topCustomerFacingFindings: GuidedAuditFinding[];
  topInternalFindings: GuidedAuditFinding[];
  topBlockers: GuidedAuditReadinessIssue[];
};

export type ReviewQueueItemKind =
  | 'term_review'
  | 'finding_review'
  | 'evidence_approval'
  | 'report_blocker'
  | 'low_confidence_term'
  | 'unassigned_document';

export type ReviewQueueItem = {
  id: string;
  kind: ReviewQueueItemKind;
  title: string;
  detail: string;
  status: string;
  actionLabel: string;
  actionHref: string;
  amountMinor: number;
  currency?: string;
  evidenceStrength: number;
  falsePositiveRisk: number;
  ageDays: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
};

export type GuidedAuditInput = {
  documents?: GuidedAuditDocument[];
  terms?: GuidedAuditTerm[];
  findings?: GuidedAuditFinding[];
  evidenceCandidates?: GuidedAuditEvidenceCandidate[];
  readinessIssues?: GuidedAuditReadinessIssue[];
  now?: Date;
};

const LOW_CONFIDENCE_TERM_THRESHOLD = 0.75;

export function buildGuidedAuditSummary(input: GuidedAuditInput): GuidedAuditSummary {
  const findings = input.findings ?? [];
  const readinessIssues = input.readinessIssues ?? [];
  const customerFacingFindings = findings.filter((finding) => isCustomerFacingFindingStatus(finding.status));
  const internalFindings = findings.filter((finding) => isInternalPipelineFindingStatus(finding.status));
  const reportBlockedIds = new Set(
    readinessIssues
      .filter((issue) => issue.category === 'report_blockers')
      .flatMap((issue) => issue.affectedEntityIds ?? [])
  );

  return {
    customerFacingApprovedMinor: sumAmounts(customerFacingFindings),
    internalUnapprovedExposureMinor: sumAmounts(internalFindings),
    customerFacingFindingCount: customerFacingFindings.length,
    internalFindingCount: internalFindings.length,
    readyToReportCount: customerFacingFindings.filter((finding) => !reportBlockedIds.has(finding.id)).length,
    topCustomerFacingFindings: sortByAmount(customerFacingFindings).slice(0, 3),
    topInternalFindings: sortByAmount(internalFindings).slice(0, 3),
    topBlockers: readinessIssues
      .slice()
      .sort((a, b) => issueSeverityRank(b) - issueSeverityRank(a))
      .slice(0, 4)
  };
}

export function buildReviewQueue(input: GuidedAuditInput): ReviewQueueItem[] {
  const now = input.now ?? new Date();
  const documents = input.documents ?? [];
  const terms = input.terms ?? [];
  const findings = input.findings ?? [];
  const candidates = input.evidenceCandidates ?? [];
  const readinessIssues = input.readinessIssues ?? [];
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const items: ReviewQueueItem[] = [];

  for (const document of documents) {
    if (document.customer_id || document.document_type === 'customer_csv') continue;
    items.push({
      id: `document:${document.id}`,
      kind: 'unassigned_document',
      title: document.file_name ?? 'Unassigned document',
      detail: 'Customer matching is required before this source can safely feed reconciliation.',
      status: document.parse_status ?? 'uploaded',
      actionLabel: 'Assign customer',
      actionHref: '/app/uploads',
      amountMinor: 0,
      evidenceStrength: document.parse_status === 'parsed' ? 0.7 : 0.3,
      falsePositiveRisk: 0.8,
      ageDays: ageDays(document.created_at, now),
      priority: document.document_type === 'contract' ? 'high' : 'medium'
    });
  }

  for (const term of terms) {
    const isApproved = ['approved', 'edited'].includes(term.review_status);
    if (term.confidence < LOW_CONFIDENCE_TERM_THRESHOLD) {
      items.push({
        id: `low-term:${term.id}`,
        kind: 'low_confidence_term',
        title: labelize(term.term_type),
        detail: 'The extracted term has low confidence. Check the source citation before approving or using it.',
        status: term.review_status,
        actionLabel: 'Review term',
        actionHref: '/app/contracts',
        amountMinor: 0,
        evidenceStrength: clamp01(term.confidence),
        falsePositiveRisk: clamp01(1 - term.confidence),
        ageDays: ageDays(term.updated_at, now),
        priority: 'high'
      });
      continue;
    }

    if (!isApproved && term.review_status !== 'rejected') {
      items.push({
        id: `term:${term.id}`,
        kind: 'term_review',
        title: labelize(term.term_type),
        detail: 'A human needs to approve, edit, or reject this term before reconciliation can rely on it.',
        status: term.review_status,
        actionLabel: 'Review term',
        actionHref: '/app/contracts',
        amountMinor: 0,
        evidenceStrength: clamp01(term.confidence),
        falsePositiveRisk: clamp01(1 - term.confidence),
        ageDays: ageDays(term.updated_at, now),
        priority: 'medium'
      });
    }
  }

  for (const finding of findings) {
    if (!isInternalPipelineFindingStatus(finding.status)) continue;
    items.push({
      id: `finding:${finding.id}`,
      kind: 'finding_review',
      title: finding.title,
      detail: finding.summary ?? 'Review the deterministic amount, evidence, and false-positive risk.',
      status: finding.status,
      actionLabel: 'Review finding',
      actionHref: `/app/findings/${finding.id}`,
      amountMinor: safeAmount(finding.estimated_amount_minor),
      currency: finding.currency,
      evidenceStrength: evidenceStrengthForFinding(finding),
      falsePositiveRisk: clamp01(1 - finding.confidence),
      ageDays: ageDays(finding.updated_at ?? finding.created_at, now),
      priority: priorityForFinding(finding)
    });
  }

  for (const candidate of candidates) {
    if (!['suggested', 'pending', 'needs_review'].includes(candidate.approval_state)) continue;
    const finding = candidate.finding_id ? findingsById.get(candidate.finding_id) : undefined;
    items.push({
      id: `evidence:${candidate.id}`,
      kind: 'evidence_approval',
      title: finding?.title ?? candidate.document_chunk?.source_label ?? 'Evidence candidate',
      detail: 'Suggested evidence needs human approval before it can support a customer-facing finding.',
      status: candidate.approval_state,
      actionLabel: 'Approve evidence',
      actionHref: finding ? `/app/findings/${finding.id}` : '/app/evidence',
      amountMinor: finding ? safeAmount(finding.estimated_amount_minor) : 0,
      currency: finding?.currency,
      evidenceStrength: clamp01(candidate.retrieval_score),
      falsePositiveRisk: clamp01(1 - candidate.retrieval_score),
      ageDays: ageDays(candidate.created_at, now),
      priority: finding ? priorityForFinding(finding) : 'medium'
    });
  }

  for (const issue of readinessIssues.filter((item) => item.category === 'report_blockers')) {
    const affectedFindings = (issue.affectedEntityIds ?? [])
      .map((id) => findingsById.get(id))
      .filter((finding): finding is GuidedAuditFinding => Boolean(finding));
    const primaryFinding = affectedFindings[0];

    items.push({
      id: `report:${issue.title}`,
      kind: 'report_blocker',
      title: issue.title,
      detail: issue.recommendedAction ?? issue.explanation ?? 'Resolve this blocker before generating a customer-facing report.',
      status: issue.severity,
      actionLabel: 'Fix report blocker',
      actionHref: issue.deepLink ?? '/app/reports',
      amountMinor: sumAmounts(affectedFindings),
      currency: primaryFinding?.currency,
      evidenceStrength: 0,
      falsePositiveRisk: 1,
      ageDays: 0,
      priority: issue.severity === 'blocker' ? 'critical' : 'high'
    });
  }

  return sortReviewQueue(items);
}

export function reviewQueueKindLabel(kind: ReviewQueueItemKind): string {
  const labels: Record<ReviewQueueItemKind, string> = {
    term_review: 'Term review',
    finding_review: 'Finding review',
    evidence_approval: 'Evidence approval',
    report_blocker: 'Report blocker',
    low_confidence_term: 'Low confidence term',
    unassigned_document: 'Unassigned document'
  };
  return labels[kind];
}

function sortReviewQueue(items: ReviewQueueItem[]): ReviewQueueItem[] {
  return items.slice().sort((a, b) =>
    b.amountMinor - a.amountMinor ||
    a.evidenceStrength - b.evidenceStrength ||
    b.falsePositiveRisk - a.falsePositiveRisk ||
    b.ageDays - a.ageDays ||
    priorityRank(b.priority) - priorityRank(a.priority)
  );
}

function priorityForFinding(finding: GuidedAuditFinding): ReviewQueueItem['priority'] {
  if (finding.severity === 'critical') return 'critical';
  if (finding.severity === 'high') return 'high';
  if (finding.severity === 'low') return 'low';
  return 'medium';
}

function evidenceStrengthForFinding(finding: GuidedAuditFinding): number {
  if (finding.evidence_coverage_status === 'complete') return 0.9;
  if (finding.evidence_coverage_status === 'weak') return 0.35;
  if (finding.evidence_coverage_status === 'conflicting') return 0.2;
  if (finding.evidence_coverage_status === 'missing') return 0.1;
  return clamp01(finding.confidence);
}

function issueSeverityRank(issue: GuidedAuditReadinessIssue): number {
  return issue.severity === 'blocker' ? 2 : 1;
}

function priorityRank(priority: ReviewQueueItem['priority']): number {
  if (priority === 'critical') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function sumAmounts(findings: GuidedAuditFinding[]): number {
  return findings.reduce((sum, finding) => sum + safeAmount(finding.estimated_amount_minor), 0);
}

function safeAmount(amountMinor: number): number {
  return Number.isSafeInteger(amountMinor) ? amountMinor : 0;
}

function sortByAmount(findings: GuidedAuditFinding[]): GuidedAuditFinding[] {
  return findings.slice().sort((a, b) => safeAmount(b.estimated_amount_minor) - safeAmount(a.estimated_amount_minor));
}

function ageDays(value: string | null | undefined, now: Date): number {
  if (!value) return 0;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return 0;
  return Math.max(0, Math.floor((now.getTime() - date) / (1000 * 60 * 60 * 24)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function labelize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
