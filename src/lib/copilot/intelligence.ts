import { buildWorkspaceAnalytics, isInternalPipelineFindingStatus } from '../analytics/workspaceAnalytics';
import { redactSafeText } from './redaction';
import { safeFindingLabel, toWorkspaceAnalyticsInput, type CopilotDataContext, type CopilotEvidenceItem, type CopilotFinding } from './context';
import {
  cfoSummarySchema,
  evidenceQualityReviewSchema,
  falsePositiveRiskCheckSchema,
  getFindingDetailInputSchema,
  reviewerChecklistSchema,
  recoveryNoteDraftSchema,
  type CfoSummary,
  type CopilotToolBaseInput,
  type EvidenceQualityReview,
  type FalsePositiveRiskCheck,
  type GetFindingDetailInput,
  type ReviewerChecklist,
  type RecoveryNoteDraft
} from './schema';

export function evidenceQualityReview(context: CopilotDataContext, input: GetFindingDetailInput): EvidenceQualityReview {
  const { finding, evidence } = findingIntelligenceScope(context, input);
  const approvedEvidence = evidence.filter(isApprovedEvidence);
  const strongEvidence = approvedEvidence.map((item) => evidenceStrengthLabel(item));
  const weakEvidence: string[] = [];
  const conflictingEvidence: string[] = [];
  const needsMoreEvidence: string[] = [];
  const signal = findingSignal(finding);

  if (evidence.length === 0) {
    weakEvidence.push('No evidence references are attached to this finding.');
  }
  if (evidence.some((item) => !isApprovedEvidence(item))) {
    weakEvidence.push('Some evidence references are not approved and reviewed.');
  }
  if (finding.confidence < 0.75) {
    weakEvidence.push('Finding confidence is below the normal review threshold.');
  }
  if (finding.evidenceCoverageStatus && finding.evidenceCoverageStatus !== 'complete') {
    weakEvidence.push(`Evidence coverage is ${finding.evidenceCoverageStatus}.`);
  }
  if (evidence.some((item) => item.approvalState === 'rejected')) {
    conflictingEvidence.push('At least one attached evidence reference is rejected.');
  }
  if (hasAnySignal(signal, ['amendment', 'addendum', 'conflict', 'superseded', 'override'])) {
    conflictingEvidence.push('Finding context references a possible amendment or conflicting term.');
  }
  if (hasAnySignal(signal, ['credit note', 'credit memo', 'refund', 'offset'])) {
    conflictingEvidence.push('Finding context references a possible credit, refund, or offset.');
  }

  if (isMoneyFinding(finding) && !hasContractEvidence(approvedEvidence)) {
    needsMoreEvidence.push('Approved contract evidence is required for money findings.');
  }
  if (isMoneyFinding(finding) && !hasInvoiceOrUsageEvidence(approvedEvidence)) {
    needsMoreEvidence.push('Approved invoice or usage evidence is required to support the calculated amount.');
  }
  if (formulaNeedsUsage(finding) && !hasUsageEvidence(approvedEvidence)) {
    needsMoreEvidence.push('Usage-based formula requires approved usage evidence.');
  }
  if (formulaNeedsInvoice(finding) && !hasInvoiceEvidence(approvedEvidence)) {
    needsMoreEvidence.push('Billing formula requires approved invoice evidence.');
  }

  const overall = conflictingEvidence.length > 0
    ? 'conflicting_evidence'
    : needsMoreEvidence.length > 0
      ? 'needs_more_evidence'
      : weakEvidence.length > 0
        ? 'weak_evidence'
        : 'strong_evidence';

  return evidenceQualityReviewSchema.parse({
    finding_id: finding.id,
    strong_evidence: unique(strongEvidence),
    weak_evidence: unique(weakEvidence),
    conflicting_evidence: unique(conflictingEvidence),
    needs_more_evidence: unique(needsMoreEvidence),
    overall,
    advisory_only: true
  });
}

export function falsePositiveRiskCheck(context: CopilotDataContext, input: GetFindingDetailInput): FalsePositiveRiskCheck {
  const { finding, evidence } = findingIntelligenceScope(context, input);
  const signal = findingSignal(finding);
  const quality = evidenceQualityReview(context, input);
  const reasons: string[] = [];

  if (hasAnySignal(signal, ['amendment', 'addendum', 'conflict', 'superseded', 'override'])) {
    reasons.push('Possible amendment conflict or superseded term needs reviewer validation.');
  }
  if (!hasInvoiceEvidence(evidence.filter(isApprovedEvidence))) {
    reasons.push('Missing approved invoice-period evidence.');
  }
  if (hasAnySignal(signal, ['credit note', 'credit memo', 'refund', 'offset'])) {
    reasons.push('Possible credit note, refund, or offset could reduce the apparent leakage.');
  }
  if (hasAnySignal(signal, ['discount extension', 'extended discount', 'promo extension'])) {
    reasons.push('Possible discount extension should be checked before approval.');
  }
  if (hasAnySignal(signal, ['billing cycle', 'billing period', 'proration', 'pro-rated', 'prorated'])) {
    reasons.push('Possible billing-cycle mismatch could explain the variance.');
  }
  if (hasAnySignal(signal, ['true-up', 'true up', 'annual adjustment', 'annual reconciliation'])) {
    reasons.push('Annual true-up terms may resolve the variance later.');
  }
  if (formulaNeedsUsage(finding) && !hasInvoiceEvidence(evidence.filter(isApprovedEvidence))) {
    reasons.push('Usage may have been billed later than the usage period in scope.');
  }
  if (hasAnySignal(signal, ['one-time', 'one time', 'recurring', 'non-recurring'])) {
    reasons.push('One-time versus recurring charge classification needs review.');
  }
  if (hasAnySignal(signal, ['exception', 'waiver', 'customer-specific', 'customer specific'])) {
    reasons.push('Possible customer-specific exception should be validated.');
  }
  if (quality.needs_more_evidence.length > 0) {
    reasons.push('Required evidence is missing or not approved.');
  }

  const riskLevel = reasons.some((reason) => /amendment|missing|required evidence/i.test(reason))
    ? 'high'
    : reasons.length >= 2
      ? 'medium'
      : 'low';

  return falsePositiveRiskCheckSchema.parse({
    finding_id: finding.id,
    riskLevel,
    reasons: unique(reasons),
    reviewer_checklist: reviewerChecklist(context, input).verify_before_approving,
    recommended_next_step: riskLevel === 'low'
      ? 'Reviewer can proceed with normal formula and evidence review.'
      : 'Resolve the flagged evidence and exception checks before approval or customer-ready status.',
    advisory_only: true
  });
}

export function reviewerChecklist(context: CopilotDataContext, input: GetFindingDetailInput): ReviewerChecklist {
  const { finding } = findingIntelligenceScope(context, input);
  const quality = evidenceQualityReview(context, input);
  const verifyBeforeApproving = [
    'Verify the formula uses the stored deterministic calculation amount.',
    'Verify the contract term applies to the audited period and customer.',
    'Verify invoice or usage records match the same customer and period.'
  ];
  if (formulaNeedsUsage(finding)) verifyBeforeApproving.push('Verify usage quantity, allowance, and overage pricing.');
  if (formulaNeedsInvoice(finding)) verifyBeforeApproving.push('Verify invoice period, billed amount, credits, and billing cycle.');
  if (finding.status === 'draft') verifyBeforeApproving.push('Move the finding through finance review before approval.');

  const requiredEvidence = [
    'Approved contract evidence for the obligation or pricing term.',
    ...(isMoneyFinding(finding) ? ['Approved invoice or usage evidence supporting the amount.'] : []),
    'Calculation evidence or formula inputs matching the finding detail.'
  ];

  const blocksCustomerReady = [
    ...quality.needs_more_evidence,
    ...quality.conflicting_evidence,
    ...(isInternalPipelineFindingStatus(finding.status) ? [`Current status is ${finding.status}; human approval is required first.`] : [])
  ];

  return reviewerChecklistSchema.parse({
    finding_id: finding.id,
    verify_before_approving: unique(verifyBeforeApproving),
    required_evidence: unique(requiredEvidence),
    blocks_customer_ready: unique(blocksCustomerReady),
    advisory_only: true
  });
}

export function prepareCfoSummary(context: CopilotDataContext, input: CopilotToolBaseInput): CfoSummary {
  validateWorkspaceScope(context, input);
  const analytics = buildWorkspaceAnalytics(toWorkspaceAnalyticsInput(context));

  return cfoSummarySchema.parse({
    workspace_id: context.workspace.id,
    currency: analytics.currency,
    customer_facing: {
      total_leakage_minor: analytics.customerFacing.totalLeakageMinor,
      recoverable_leakage_minor: analytics.customerFacing.recoverableLeakageMinor,
      prevented_leakage_minor: analytics.customerFacing.preventedLeakageMinor,
      recovered_amount_minor: analytics.customerFacing.recoveredLeakageMinor
    },
    internal_pipeline: {
      unapproved_exposure_minor: analytics.internalPipeline.unapprovedExposureMinor,
      needs_review_count: analytics.internalPipeline.needsReviewCount,
      finding_count: analytics.internalPipeline.findingCount
    },
    top_categories: analytics.customerFacing.byCategory.slice(0, 5),
    top_customers: analytics.customerFacing.byCustomer.slice(0, 5),
    readiness_warnings: workspaceReadinessWarnings(context),
    advisory_only: true
  });
}

export function prepareRecoveryNote(context: CopilotDataContext, input: GetFindingDetailInput): RecoveryNoteDraft {
  const { finding } = findingIntelligenceScope(context, input);
  const quality = evidenceQualityReview(context, input);
  const checklist = reviewerChecklist(context, input);
  const findingLabel = safeFindingLabel(finding);
  const contractBasis = quality.strong_evidence.some((item) => /contract/i.test(item))
    ? 'Approved contract evidence supports the obligation or pricing basis.'
    : 'Contract basis still needs approved evidence before customer use.';
  const invoiceUsageBasis = quality.strong_evidence.some((item) => /invoice|usage/i.test(item))
    ? 'Approved invoice or usage evidence supports the billing comparison.'
    : 'Invoice or usage basis still needs approved evidence before customer use.';

  return recoveryNoteDraftSchema.parse({
    finding_id: finding.id,
    internal_note: redactSafeText(
      `Draft recovery note for ${findingLabel}: review ${finding.currency} ${finding.amountMinor} minor units against approved evidence. ${checklist.blocks_customer_ready.length > 0 ? `Resolve blockers: ${checklist.blocks_customer_ready.join(' ')}` : 'No current advisory blockers were identified by Copilot.'}`
    ),
    customer_facing_draft: redactSafeText(
      `We identified a billing variance related to ${finding.findingType.replaceAll('_', ' ')}. Based on the reviewed contract and billing evidence, the calculated variance is ${finding.currency} ${finding.amountMinor} minor units. Please review the attached evidence references and confirm the appropriate recovery or correction path.`
    ),
    contract_basis: contractBasis,
    invoice_usage_basis: invoiceUsageBasis,
    calculation_summary: `Calculation uses stored formula only: ${formulaLabel(finding)}. Copilot did not change the amount.`,
    human_review_disclaimer: 'Draft only. A human reviewer must verify evidence, tone, and customer context before any external use.',
    auto_send: false,
    advisory_only: true
  });
}

function findingIntelligenceScope(context: CopilotDataContext, input: GetFindingDetailInput) {
  const scoped = getFindingDetailInputSchema.parse(input);
  validateWorkspaceScope(context, scoped);
  const finding = context.findings.find((item) => item.id === scoped.finding_id && item.workspaceId === scoped.workspace_id);
  if (!finding) throw new Error('forbidden');
  return {
    finding,
    evidence: context.evidenceItems.filter((item) => item.findingId === finding.id && item.workspaceId === scoped.workspace_id)
  };
}

function validateWorkspaceScope(context: CopilotDataContext, input: CopilotToolBaseInput): void {
  if (input.organization_id !== context.organization.id || input.workspace_id !== context.workspace.id) {
    throw new Error('forbidden');
  }
}

function isMoneyFinding(finding: CopilotFinding): boolean {
  return finding.amountMinor > 0 && finding.outcomeType !== 'risk_alert';
}

function isApprovedEvidence(item: CopilotEvidenceItem): boolean {
  return item.approvalState === 'approved' && Boolean(item.reviewedBy) && Boolean(item.reviewedAt);
}

function hasContractEvidence(evidence: CopilotEvidenceItem[]): boolean {
  return evidence.some((item) => item.sourceType === 'contract' || item.evidenceType === 'contract_term');
}

function hasInvoiceEvidence(evidence: CopilotEvidenceItem[]): boolean {
  return evidence.some((item) => item.sourceType === 'invoice' || item.evidenceType === 'invoice_row');
}

function hasUsageEvidence(evidence: CopilotEvidenceItem[]): boolean {
  return evidence.some((item) => item.sourceType === 'usage' || item.evidenceType === 'usage_row');
}

function hasInvoiceOrUsageEvidence(evidence: CopilotEvidenceItem[]): boolean {
  return hasInvoiceEvidence(evidence) || hasUsageEvidence(evidence);
}

function formulaNeedsUsage(finding: CopilotFinding): boolean {
  return hasAnySignal(findingSignal(finding), ['usage', 'overage', 'quantity', 'meter']);
}

function formulaNeedsInvoice(finding: CopilotFinding): boolean {
  return hasAnySignal(findingSignal(finding), ['invoice', 'billed', 'billing', 'minimum', 'discount', 'uplift']);
}

function evidenceStrengthLabel(item: CopilotEvidenceItem): string {
  const source = item.sourceType ?? 'source';
  return `${item.evidenceType.replaceAll('_', ' ')} evidence from ${source} reference ${item.id.slice(0, 8)}.`;
}

function formulaLabel(finding: CopilotFinding): string {
  return typeof finding.calculation.formula === 'string' && finding.calculation.formula.trim()
    ? finding.calculation.formula
    : 'stored calculation object';
}

function findingSignal(finding: CopilotFinding): string {
  return [
    finding.findingType,
    finding.title,
    finding.summary,
    finding.reviewNote,
    formulaLabel(finding),
    ...Object.keys(finding.calculation)
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasAnySignal(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function workspaceReadinessWarnings(context: CopilotDataContext): string[] {
  const documents = context.documents.filter((document) => document.workspaceId === context.workspace.id);
  const warnings: string[] = [];
  if (!documents.some((document) => document.documentType === 'contract')) warnings.push('No contract document is uploaded.');
  if (!documents.some((document) => document.documentType === 'invoice_csv')) warnings.push('No invoice CSV is uploaded.');
  if (!documents.some((document) => document.documentType === 'usage_csv')) warnings.push('No usage CSV is uploaded.');
  if (context.terms.some((term) => ['extracted', 'needs_review'].includes(term.reviewStatus))) {
    warnings.push('Some extracted terms still need finance review.');
  }
  if (context.findings.some((finding) => isInternalPipelineFindingStatus(finding.status))) {
    warnings.push('Internal pipeline findings still need review before customer-facing use.');
  }
  return warnings;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => redactSafeText(value, '').trim()).filter(Boolean)));
}
