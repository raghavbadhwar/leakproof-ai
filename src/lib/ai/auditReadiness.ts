import { z } from 'zod';
import { isCustomerFacingFindingStatus, isInternalPipelineFindingStatus } from '../analytics/statuses';
import { exportBlockerForFinding, type ExportReadyEvidenceCitation } from '../evidence/exportReadiness';
import type { CopilotDataContext } from '../copilot/context';

export const auditReadinessLabelSchema = z.enum([
  'not_started',
  'needs_data',
  'ready_for_extraction',
  'ready_for_reconciliation',
  'needs_review',
  'ready_for_report',
  'report_ready'
]);

export const missingDataCategorySchema = z.enum([
  'missing_contracts',
  'missing_invoices',
  'missing_usage',
  'unassigned_documents',
  'low_confidence_terms',
  'unapproved_terms',
  'missing_evidence',
  'weak_evidence',
  'report_blockers',
  'no_customer_mapping',
  'missing_service_periods'
]);

export const nextBestActionTypeSchema = z.enum([
  'upload_contracts',
  'upload_invoices',
  'upload_usage',
  'review_terms',
  'run_reconciliation',
  'attach_evidence',
  'approve_findings',
  'generate_report',
  'review_blockers'
]);

const appDeepLinkSchema = z.string().trim().min(1).max(240).regex(/^\/app(?:\/|\?|#|$)/);
const safeEntityIdSchema = z.string().trim().min(1).max(180);
const safeTextSchema = z.string().trim().min(1).max(600);

export const readinessIssueSchema = z
  .object({
    category: missingDataCategorySchema,
    severity: z.enum(['blocker', 'warning']),
    title: z.string().trim().min(1).max(160),
    explanation: safeTextSchema,
    affectedEntityIds: z.array(safeEntityIdSchema).max(100),
    recommendedAction: safeTextSchema,
    deepLink: appDeepLinkSchema
  })
  .strict();

const nextBestActionBaseSchema = z
  .object({
    action: nextBestActionTypeSchema,
    title: z.string().trim().min(1).max(160),
    explanation: safeTextSchema,
    ctaLabel: z.string().trim().min(1).max(80),
    deepLink: appDeepLinkSchema
  })
  .strict();

export const nextBestActionSchema = nextBestActionBaseSchema
  .extend({
    secondaryActions: z.array(nextBestActionBaseSchema).max(5).default([])
  })
  .strict();

export const auditReadinessPayloadSchema = z
  .object({
    readinessScore: z.number().int().min(0).max(100),
    readinessLabel: auditReadinessLabelSchema,
    blockers: z.array(readinessIssueSchema).max(40),
    warnings: z.array(readinessIssueSchema).max(40),
    missingData: z.array(readinessIssueSchema).max(80),
    nextBestAction: nextBestActionSchema,
    generatedAt: z.string().datetime(),
    source: z.literal('deterministic')
  })
  .strict();

export type AuditReadinessLabel = z.infer<typeof auditReadinessLabelSchema>;
export type MissingDataCategory = z.infer<typeof missingDataCategorySchema>;
export type NextBestActionType = z.infer<typeof nextBestActionTypeSchema>;
export type ReadinessIssue = z.infer<typeof readinessIssueSchema>;
export type NextBestAction = z.infer<typeof nextBestActionSchema>;
export type AuditReadinessPayload = z.infer<typeof auditReadinessPayloadSchema>;

export type AuditReadinessDocument = {
  id: string;
  documentType: string;
  customerId?: string | null;
  parseStatus?: string | null;
  chunkingStatus?: string | null;
  embeddingStatus?: string | null;
};

export type AuditReadinessTerm = {
  id: string;
  customerId?: string | null;
  sourceDocumentId?: string | null;
  reviewStatus: string;
  confidence: number;
};

export type AuditReadinessInvoiceRecord = {
  id: string;
  customerId?: string | null;
  sourceDocumentId?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
};

export type AuditReadinessUsageRecord = {
  id: string;
  customerId?: string | null;
  sourceDocumentId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type AuditReadinessFinding = {
  id: string;
  customerId?: string | null;
  status: string;
  outcomeType: 'recoverable_leakage' | 'prevented_future_leakage' | 'risk_alert' | string;
  evidenceCoverageStatus?: string | null;
  calculation?: Record<string, unknown> | null;
};

export type AuditReadinessEvidenceItem = {
  id: string;
  findingId: string;
  evidenceType?: string | null;
  sourceType?: string | null;
  approvalState?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  confidence?: number | null;
};

export type AuditReadinessEvidenceCandidate = {
  id: string;
  findingId?: string | null;
  approvalState?: string | null;
  attachedEvidenceItemId?: string | null;
  retrievalScore?: number | null;
};

export type AuditReadinessEvidencePack = {
  id: string;
  status: string;
};

export type AuditReadinessInput = {
  documents?: AuditReadinessDocument[];
  terms?: AuditReadinessTerm[];
  invoiceRecords?: AuditReadinessInvoiceRecord[];
  usageRecords?: AuditReadinessUsageRecord[];
  findings?: AuditReadinessFinding[];
  evidenceItems?: AuditReadinessEvidenceItem[];
  evidenceCandidates?: AuditReadinessEvidenceCandidate[];
  evidencePacks?: AuditReadinessEvidencePack[];
  generatedAt?: string;
};

const APPROVED_TERM_STATUSES = new Set(['approved', 'edited']);
const CLOSED_FINDING_STATUSES = new Set(['dismissed', 'not_recoverable']);
const LOW_CONFIDENCE_TERM_THRESHOLD = 0.75;
const WEAK_EVIDENCE_THRESHOLD = 0.6;

type ReadinessFacts = ReturnType<typeof collectReadinessFacts>;

export function buildAuditReadiness(input: AuditReadinessInput): AuditReadinessPayload {
  const facts = collectReadinessFacts(input);
  const issues = detectMissingData(input, facts);
  const blockers = issues.filter((issue) => issue.severity === 'blocker');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const readinessLabel = readinessLabelFor(facts, blockers, warnings);
  const readinessScore = readinessScoreFor(facts, blockers, warnings);
  const nextBestAction = nextBestActionFor(facts, issues);

  return auditReadinessPayloadSchema.parse({
    readinessScore,
    readinessLabel,
    blockers,
    warnings,
    missingData: issues,
    nextBestAction,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: 'deterministic'
  });
}

export function buildAuditReadinessFromCopilotContext(context: CopilotDataContext): AuditReadinessPayload {
  return buildAuditReadiness(auditReadinessInputFromCopilotContext(context));
}

export function auditReadinessInputFromCopilotContext(context: CopilotDataContext): AuditReadinessInput {
  return {
    documents: context.documents.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      customerId: document.customerId,
      parseStatus: document.parseStatus,
      chunkingStatus: document.chunkingStatus,
      embeddingStatus: document.embeddingStatus
    })),
    terms: context.terms.map((term) => ({
      id: term.id,
      customerId: term.customerId,
      sourceDocumentId: term.sourceDocumentId,
      reviewStatus: term.reviewStatus,
      confidence: term.confidence
    })),
    invoiceRecords: context.invoiceRecords.map((record) => ({
      id: record.id,
      customerId: record.customerId,
      sourceDocumentId: record.sourceDocumentId,
      servicePeriodStart: record.servicePeriodStart,
      servicePeriodEnd: record.servicePeriodEnd
    })),
    usageRecords: context.usageRecords.map((record) => ({
      id: record.id,
      customerId: record.customerId,
      sourceDocumentId: record.sourceDocumentId,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd
    })),
    findings: context.findings.map((finding) => ({
      id: finding.id,
      customerId: finding.customerId,
      status: finding.status,
      outcomeType: finding.outcomeType,
      evidenceCoverageStatus: finding.evidenceCoverageStatus,
      calculation: finding.calculation
    })),
    evidenceItems: context.evidenceItems.map((item) => ({
      id: item.id,
      findingId: item.findingId,
      evidenceType: item.evidenceType,
      sourceType: item.sourceType,
      approvalState: item.approvalState,
      reviewedBy: item.reviewedBy,
      reviewedAt: item.reviewedAt
    })),
    evidenceCandidates: context.evidenceCandidates.map((candidate) => ({
      id: candidate.id,
      findingId: candidate.findingId,
      approvalState: candidate.approvalState,
      attachedEvidenceItemId: candidate.attachedEvidenceItemId
    })),
    evidencePacks: context.evidencePacks.map((pack) => ({
      id: pack.id,
      status: pack.status
    }))
  };
}

export function detectMissingData(input: AuditReadinessInput, facts = collectReadinessFacts(input)): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];

  if (!facts.hasContractUpload) {
    issues.push(issue(
      'missing_contracts',
      'blocker',
      'Contracts are missing',
      'Upload at least one signed contract or order form before extraction can start.',
      [],
      'Upload contract documents for the workspace.',
      '/app/uploads'
    ));
  }

  if (!facts.hasInvoiceUpload && !facts.hasInvoiceRows) {
    issues.push(issue(
      'missing_invoices',
      'blocker',
      'Invoice data is missing',
      'Upload an invoice CSV so code can compare billed amounts against approved contract terms.',
      [],
      'Upload an invoice CSV and confirm the column mapping.',
      '/app/uploads'
    ));
  } else if (facts.hasInvoiceUpload && !facts.hasInvoiceRows) {
    issues.push(issue(
      'missing_invoices',
      'blocker',
      'Invoice rows are not parsed',
      'An invoice CSV exists, but no normalized invoice rows are available for reconciliation.',
      facts.invoiceDocuments.map((document) => document.id),
      'Review the invoice CSV mapping and upload a parseable file.',
      '/app/uploads'
    ));
  }

  if (!facts.hasUsageUpload && !facts.hasUsageRows) {
    issues.push(issue(
      'missing_usage',
      'blocker',
      'Usage data is missing',
      'Upload usage or seat data before usage overages, seat underbilling, and allowance checks can run.',
      [],
      'Upload a usage CSV and confirm the column mapping.',
      '/app/uploads'
    ));
  } else if (facts.hasUsageUpload && !facts.hasUsageRows) {
    issues.push(issue(
      'missing_usage',
      'blocker',
      'Usage rows are not parsed',
      'A usage CSV exists, but no normalized usage rows are available for reconciliation.',
      facts.usageDocuments.map((document) => document.id),
      'Review the usage CSV mapping and upload a parseable file.',
      '/app/uploads'
    ));
  }

  if (facts.unassignedContractDocuments.length > 0) {
    issues.push(issue(
      'unassigned_documents',
      'blocker',
      'Contracts are not assigned to customers',
      'Contracts without customer assignment cannot be reconciled safely against invoice or usage records.',
      facts.unassignedContractDocuments.map((document) => document.id),
      'Assign each contract to a customer account.',
      '/app/uploads'
    ));
  }

  if (facts.unmappedCustomerEntities.length > 0) {
    issues.push(issue(
      'no_customer_mapping',
      'blocker',
      'Customer mapping is incomplete',
      'Some invoice, usage, term, or finding rows are not linked to a customer, so customer-level reconciliation is blocked.',
      facts.unmappedCustomerEntities,
      'Fix customer identifiers or upload a customer mapping CSV.',
      '/app/uploads'
    ));
  }

  if (facts.recordsMissingServicePeriods.length > 0) {
    issues.push(issue(
      'missing_service_periods',
      'blocker',
      'Service periods are missing',
      'Period-aware reconciliation needs service period start and end dates on billing and usage records.',
      facts.recordsMissingServicePeriods,
      'Map service period fields in the CSV or correct the source data.',
      '/app/revenue-records'
    ));
  }

  if (facts.hasContractUpload && !facts.hasExtractedTerms) {
    issues.push(issue(
      'unapproved_terms',
      'blocker',
      'Contract terms are not extracted',
      'No active contract terms are available for human review and deterministic reconciliation.',
      facts.contractDocuments.map((document) => document.id),
      'Run extraction from the contract terms page, then review the extracted terms.',
      '/app/contracts'
    ));
  } else if (facts.unapprovedTerms.length > 0) {
    issues.push(issue(
      'unapproved_terms',
      'blocker',
      'Contract terms need approval',
      'Only approved or edited terms can feed the deterministic reconciliation engine.',
      facts.unapprovedTerms.map((term) => term.id),
      'Review, edit, approve, or reject the pending terms.',
      '/app/contracts'
    ));
  }

  if (facts.lowConfidenceTerms.length > 0) {
    issues.push(issue(
      'low_confidence_terms',
      'warning',
      'Low-confidence terms need attention',
      'Some extracted terms have low confidence and should be checked before relying on the audit.',
      facts.lowConfidenceTerms.map((term) => term.id),
      'Review the source citation and approve only terms that are supported.',
      '/app/contracts'
    ));
  }

  if (facts.findingsMissingEvidence.length > 0) {
    issues.push(issue(
      'missing_evidence',
      'blocker',
      'Findings need evidence',
      'Findings without approved or candidate evidence cannot become customer-ready.',
      facts.findingsMissingEvidence.map((finding) => finding.id),
      'Search for and attach contract, invoice, usage, or calculation evidence.',
      '/app/evidence'
    ));
  }

  if (facts.weakEvidenceFindings.length > 0) {
    issues.push(issue(
      'weak_evidence',
      'warning',
      'Evidence is weak or still suggested',
      'Some findings have weak, conflicting, suggested, or low-confidence evidence that needs reviewer judgment.',
      facts.weakEvidenceFindings.map((finding) => finding.id),
      'Approve strong evidence or attach better supporting references.',
      '/app/evidence'
    ));
  }

  if (facts.openFindings.length > 0) {
    issues.push(issue(
      'report_blockers',
      'blocker',
      'Findings still need human review',
      'Draft and needs-review findings stay internal and cannot appear in customer-facing reports.',
      facts.openFindings.map((finding) => finding.id),
      'Approve, dismiss, or mark findings customer-ready after checking evidence.',
      '/app/findings'
    ));
  }

  if (facts.reportBlockedFindings.length > 0) {
    issues.push(issue(
      'report_blockers',
      'blocker',
      'Report export is blocked',
      'Customer-facing findings must have approved contract evidence, approved invoice or usage evidence for money findings, and deterministic formula inputs.',
      facts.reportBlockedFindings.map((finding) => finding.id),
      'Resolve report blockers before exporting a customer-facing report.',
      '/app/reports'
    ));
  }

  return readinessIssueSchema.array().parse(dedupeIssues(issues));
}

function collectReadinessFacts(input: AuditReadinessInput) {
  const documents = input.documents ?? [];
  const terms = (input.terms ?? []).filter((term) => term.reviewStatus !== 'rejected');
  const invoiceRecords = input.invoiceRecords ?? [];
  const usageRecords = input.usageRecords ?? [];
  const findings = input.findings ?? [];
  const evidenceItems = input.evidenceItems ?? [];
  const evidenceCandidates = input.evidenceCandidates ?? [];

  const contractDocuments = documents.filter((document) => document.documentType === 'contract');
  const invoiceDocuments = documents.filter((document) => document.documentType === 'invoice_csv');
  const usageDocuments = documents.filter((document) => document.documentType === 'usage_csv');
  const customerDocuments = documents.filter((document) => document.documentType === 'customer_csv');
  const unassignedContractDocuments = contractDocuments.filter((document) => !document.customerId);
  const unapprovedTerms = terms.filter((term) => !APPROVED_TERM_STATUSES.has(term.reviewStatus));
  const approvedTerms = terms.filter((term) => APPROVED_TERM_STATUSES.has(term.reviewStatus));
  const lowConfidenceTerms = terms.filter((term) => term.confidence < LOW_CONFIDENCE_TERM_THRESHOLD);
  const openFindings = findings.filter((finding) => isInternalPipelineFindingStatus(finding.status));
  const customerFacingFindings = findings.filter((finding) => isCustomerFacingFindingStatus(finding.status));
  const activeFindings = findings.filter((finding) => !CLOSED_FINDING_STATUSES.has(finding.status));
  const approvedEvidence = evidenceItems.filter(isHumanApprovedEvidence);
  const approvedEvidenceByFinding = groupBy(approvedEvidence, (item) => item.findingId);
  const candidateByFinding = groupBy(evidenceCandidates.filter((candidate) => Boolean(candidate.findingId)), (candidate) => candidate.findingId as string);

  const findingsMissingEvidence = activeFindings.filter((finding) => {
    const approvedCount = approvedEvidenceByFinding.get(finding.id)?.length ?? 0;
    const candidateCount = candidateByFinding.get(finding.id)?.length ?? 0;
    return approvedCount === 0 && candidateCount === 0;
  });

  const weakEvidenceFindings = activeFindings.filter((finding) => {
    const approved = approvedEvidenceByFinding.get(finding.id) ?? [];
    const candidates = candidateByFinding.get(finding.id) ?? [];
    if (finding.evidenceCoverageStatus === 'weak' || finding.evidenceCoverageStatus === 'conflicting') return true;
    if (approved.length === 0 && candidates.length > 0) return true;
    return approved.some((item) => typeof item.confidence === 'number' && item.confidence < WEAK_EVIDENCE_THRESHOLD);
  });

  const reportBlockedFindings = customerFacingFindings.filter((finding) =>
    Boolean(reportBlockerFor(finding, approvedEvidenceByFinding.get(finding.id) ?? []))
  );
  const exportableFindings = customerFacingFindings.filter((finding) =>
    !reportBlockerFor(finding, approvedEvidenceByFinding.get(finding.id) ?? [])
  );

  const unmappedCustomerEntities = unique([
    ...invoiceRecords.filter((record) => !record.customerId).map((record) => record.id),
    ...usageRecords.filter((record) => !record.customerId).map((record) => record.id),
    ...terms.filter((term) => !term.customerId).map((term) => term.id),
    ...activeFindings.filter((finding) => !finding.customerId).map((finding) => finding.id)
  ]);

  const recordsMissingServicePeriods = unique([
    ...invoiceRecords
      .filter((record) => !record.servicePeriodStart || !record.servicePeriodEnd)
      .map((record) => record.id),
    ...usageRecords
      .filter((record) => !record.periodStart || !record.periodEnd)
      .map((record) => record.id)
  ]);

  return {
    documents,
    contractDocuments,
    invoiceDocuments,
    usageDocuments,
    customerDocuments,
    terms,
    approvedTerms,
    unapprovedTerms,
    lowConfidenceTerms,
    invoiceRecords,
    usageRecords,
    findings,
    openFindings,
    customerFacingFindings,
    activeFindings,
    evidenceItems,
    evidenceCandidates,
    approvedEvidence,
    reportBlockedFindings,
    exportableFindings,
    unassignedContractDocuments,
    unmappedCustomerEntities,
    recordsMissingServicePeriods,
    findingsMissingEvidence,
    weakEvidenceFindings,
    hasAnyInput:
      documents.length > 0 ||
      terms.length > 0 ||
      invoiceRecords.length > 0 ||
      usageRecords.length > 0 ||
      findings.length > 0 ||
      evidenceItems.length > 0,
    hasContractUpload: contractDocuments.length > 0,
    hasInvoiceUpload: invoiceDocuments.length > 0,
    hasUsageUpload: usageDocuments.length > 0,
    hasCustomerUpload: customerDocuments.length > 0,
    hasInvoiceRows: invoiceRecords.length > 0,
    hasUsageRows: usageRecords.length > 0,
    hasExtractedTerms: terms.length > 0,
    hasApprovedTerms: approvedTerms.length > 0,
    hasFindings: findings.length > 0,
    reportReady: exportableFindings.length > 0 && reportBlockedFindings.length === 0
  };
}

function readinessLabelFor(facts: ReadinessFacts, blockers: ReadinessIssue[], warnings: ReadinessIssue[]): AuditReadinessLabel {
  if (!facts.hasAnyInput) return 'needs_data';

  if (hasAnyCategory(blockers, ['missing_contracts', 'missing_invoices', 'missing_usage', 'unassigned_documents', 'no_customer_mapping', 'missing_service_periods'])) {
    return 'needs_data';
  }

  if (!facts.hasExtractedTerms) return 'ready_for_extraction';

  if (hasAnyCategory(blockers, ['unapproved_terms']) || hasAnyCategory(warnings, ['low_confidence_terms'])) {
    return 'needs_review';
  }

  if (!facts.hasFindings) return 'ready_for_reconciliation';

  if (hasAnyCategory(blockers, ['missing_evidence', 'report_blockers']) || hasAnyCategory(warnings, ['weak_evidence'])) {
    return 'needs_review';
  }

  if (facts.reportReady) return 'report_ready';
  if (facts.exportableFindings.length > 0) return 'ready_for_report';
  return 'needs_review';
}

function readinessScoreFor(facts: ReadinessFacts, blockers: ReadinessIssue[], warnings: ReadinessIssue[]): number {
  if (!facts.hasAnyInput) return 0;

  let score = 5;
  if (facts.hasContractUpload) score += 15;
  if (facts.hasInvoiceRows) score += 15;
  else if (facts.hasInvoiceUpload) score += 8;
  if (facts.hasUsageRows) score += 15;
  else if (facts.hasUsageUpload) score += 8;
  if (
    facts.hasContractUpload &&
    facts.hasInvoiceRows &&
    facts.hasUsageRows &&
    facts.unassignedContractDocuments.length === 0 &&
    facts.unmappedCustomerEntities.length === 0
  ) {
    score += 10;
  }
  if (facts.hasExtractedTerms) score += 10;
  if (facts.hasApprovedTerms) score += 10;
  if (facts.hasApprovedTerms && facts.unapprovedTerms.length === 0) score += 5;
  if (facts.hasFindings) score += 10;
  if (facts.evidenceItems.length > 0 || facts.evidenceCandidates.length > 0) score += 5;
  if (facts.reportReady) score += 15;

  score -= Math.max(0, blockers.length - 1) * 3;
  score -= warnings.length * 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function nextBestActionFor(facts: ReadinessFacts, issues: ReadinessIssue[]): NextBestAction {
  const primary =
    issueAction(issues, 'missing_contracts') ??
    issueAction(issues, 'missing_invoices') ??
    issueAction(issues, 'missing_usage') ??
    issueAction(issues, 'unassigned_documents') ??
    issueAction(issues, 'no_customer_mapping') ??
    issueAction(issues, 'missing_service_periods') ??
    issueAction(issues, 'unapproved_terms') ??
    issueAction(issues, 'low_confidence_terms') ??
    (!facts.hasFindings && facts.hasApprovedTerms ? actionDefinition('run_reconciliation') : null) ??
    issueAction(issues, 'missing_evidence') ??
    issueAction(issues, 'weak_evidence') ??
    (facts.openFindings.length > 0 ? actionDefinition('approve_findings') : null) ??
    issueAction(issues, 'report_blockers') ??
    (facts.reportReady ? actionDefinition('generate_report') : null) ??
    actionDefinition('review_blockers');

  const secondaryActions = uniqueActionDefinitions([
    ...issues.map(actionForIssue),
    !facts.hasFindings && facts.hasApprovedTerms ? actionDefinition('run_reconciliation') : null,
    facts.openFindings.length > 0 ? actionDefinition('approve_findings') : null,
    facts.reportReady ? actionDefinition('generate_report') : null
  ])
    .filter((action) => action.action !== primary.action)
    .slice(0, 5);

  return nextBestActionSchema.parse({
    ...primary,
    secondaryActions
  });
}

function issueAction(issues: ReadinessIssue[], category: MissingDataCategory): z.infer<typeof nextBestActionBaseSchema> | null {
  const issue = issues.find((item) => item.category === category);
  return issue ? actionForIssue(issue) : null;
}

function actionForIssue(issue: ReadinessIssue): z.infer<typeof nextBestActionBaseSchema> {
  if (issue.category === 'missing_contracts') return actionDefinition('upload_contracts');
  if (issue.category === 'missing_invoices') return actionDefinition('upload_invoices');
  if (issue.category === 'missing_usage') return actionDefinition('upload_usage');
  if (issue.category === 'unapproved_terms' || issue.category === 'low_confidence_terms') return actionDefinition('review_terms');
  if (issue.category === 'missing_evidence' || issue.category === 'weak_evidence') return actionDefinition('attach_evidence');
  if (issue.category === 'report_blockers') return actionDefinition('review_blockers');
  return actionDefinition('review_blockers');
}

function actionDefinition(action: NextBestActionType): z.infer<typeof nextBestActionBaseSchema> {
  const definitions: Record<NextBestActionType, z.infer<typeof nextBestActionBaseSchema>> = {
    upload_contracts: {
      action,
      title: 'Upload contracts',
      explanation: 'Start with signed contracts or order forms so LeakProof can extract commercial terms.',
      ctaLabel: 'Upload contracts',
      deepLink: '/app/uploads'
    },
    upload_invoices: {
      action,
      title: 'Upload invoice data',
      explanation: 'Invoice rows are needed before code can compare billed amounts with approved contract terms.',
      ctaLabel: 'Upload invoices',
      deepLink: '/app/uploads'
    },
    upload_usage: {
      action,
      title: 'Upload usage data',
      explanation: 'Usage or seat rows are needed for overage, allowance, and seat-count checks.',
      ctaLabel: 'Upload usage',
      deepLink: '/app/uploads'
    },
    review_terms: {
      action,
      title: 'Review contract terms',
      explanation: 'Run extraction if needed, then approve or edit supported terms before reconciliation.',
      ctaLabel: 'Review terms',
      deepLink: '/app/contracts'
    },
    run_reconciliation: {
      action,
      title: 'Run reconciliation',
      explanation: 'Required uploads and approved terms are ready for deterministic reconciliation.',
      ctaLabel: 'Run reconciliation',
      deepLink: '/app/findings'
    },
    attach_evidence: {
      action,
      title: 'Attach evidence',
      explanation: 'Findings need approved contract and billing evidence before they can become customer-ready.',
      ctaLabel: 'Fix evidence',
      deepLink: '/app/evidence'
    },
    approve_findings: {
      action,
      title: 'Review findings',
      explanation: 'A human reviewer must approve, dismiss, or mark findings customer-ready.',
      ctaLabel: 'Review findings',
      deepLink: '/app/findings'
    },
    generate_report: {
      action,
      title: 'Generate report',
      explanation: 'At least one customer-facing finding has approved evidence and deterministic formula inputs.',
      ctaLabel: 'Generate report',
      deepLink: '/app/reports'
    },
    review_blockers: {
      action,
      title: 'Review blockers',
      explanation: 'Resolve the remaining blockers before the audit can move forward.',
      ctaLabel: 'Review blockers',
      deepLink: '/app/uploads'
    }
  };

  return definitions[action];
}

function reportBlockerFor(finding: AuditReadinessFinding, evidenceItems: AuditReadinessEvidenceItem[]) {
  const evidenceCitations: ExportReadyEvidenceCitation[] = evidenceItems.map((item) => ({
    sourceType: item.sourceType,
    evidenceType: item.evidenceType,
    approvalState: item.approvalState
  }));

  return exportBlockerForFinding({
    status: finding.status,
    outcomeType: finding.outcomeType,
    calculation: finding.calculation,
    evidenceCitations
  });
}

function isHumanApprovedEvidence(item: AuditReadinessEvidenceItem): boolean {
  return item.approvalState === 'approved' && Boolean(item.reviewedBy) && Boolean(item.reviewedAt);
}

function issue(
  category: MissingDataCategory,
  severity: ReadinessIssue['severity'],
  title: string,
  explanation: string,
  affectedEntityIds: string[],
  recommendedAction: string,
  deepLink: string
): ReadinessIssue {
  return {
    category,
    severity,
    title,
    explanation,
    affectedEntityIds: unique(affectedEntityIds).slice(0, 100),
    recommendedAction,
    deepLink
  };
}

function hasAnyCategory(issues: ReadinessIssue[], categories: MissingDataCategory[]): boolean {
  const categorySet = new Set(categories);
  return issues.some((issue) => categorySet.has(issue.category));
}

function dedupeIssues(issues: ReadinessIssue[]): ReadinessIssue[] {
  const seen = new Set<string>();
  const deduped: ReadinessIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.category}:${issue.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }
  return deduped;
}

function unique<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueActionDefinitions(actions: Array<z.infer<typeof nextBestActionBaseSchema> | null>): Array<z.infer<typeof nextBestActionBaseSchema>> {
  const seen = new Set<NextBestActionType>();
  const uniqueActions: Array<z.infer<typeof nextBestActionBaseSchema>> = [];
  for (const action of actions) {
    if (!action || seen.has(action.action)) continue;
    seen.add(action.action);
    uniqueActions.push(action);
  }
  return uniqueActions;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return grouped;
}
