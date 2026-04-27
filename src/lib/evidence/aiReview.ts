import {
  evidenceQualityReviewSchema,
  type EvidenceQualityLevel,
  type EvidenceQualityRecommendation,
  type EvidenceQualityReview
} from '../ai/evidenceQualitySchema';
import { falsePositiveReviewSchema, type FalsePositiveReview, type FalsePositiveRiskLevel } from '../ai/falsePositiveSchema';
import { normalizeExportCalculation } from './exportReadiness';

export type EvidenceAiReviewType = 'evidence_quality' | 'false_positive' | 'both';

export type EvidenceAiReviewFinding = {
  id: string;
  type: string;
  outcomeType: string;
  title: string;
  summary: string;
  status: string;
  amountMinor: number;
  currency: string;
  confidence: number;
  evidenceCoverageStatus?: string | null;
  calculation: Record<string, unknown>;
  reviewNote?: string | null;
};

export type EvidenceAiReviewReference = {
  id: string;
  evidenceType?: string | null;
  sourceType?: string | null;
  approvalState?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  label?: string | null;
  snippet?: string | null;
};

export type EvidenceAiReviewCandidate = {
  id: string;
  approvalState?: string | null;
  retrievalScore?: number | null;
  label?: string | null;
  snippet?: string | null;
  reviewNote?: string | null;
};

export type EvidenceAiReviewRelatedTerm = {
  id: string;
  termType: string;
  reviewStatus: string;
  confidence: number;
  label?: string | null;
  snippet?: string | null;
};

export type EvidenceAiReviewContext = {
  finding: EvidenceAiReviewFinding;
  evidence: EvidenceAiReviewReference[];
  candidates: EvidenceAiReviewCandidate[];
  relatedTerms: EvidenceAiReviewRelatedTerm[];
};

const qualityRank: Record<EvidenceQualityLevel, number> = {
  strong_evidence: 0,
  medium_evidence: 1,
  weak_evidence: 2,
  needs_more_evidence: 3,
  conflicting_evidence: 4
};

const recommendationRank: Record<EvidenceQualityRecommendation, number> = {
  ready_for_review: 0,
  needs_more_evidence: 1,
  do_not_approve_yet: 2
};

const riskRank: Record<FalsePositiveRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

export function evaluateEvidenceQuality(context: EvidenceAiReviewContext): EvidenceQualityReview {
  const approvedEvidence = context.evidence.filter(isHumanApprovedEvidence);
  const contractEvidencePresent = approvedEvidence.some(isContractEvidence);
  const invoiceOrUsageEvidencePresent = approvedEvidence.some(isInvoiceOrUsageEvidence);
  const moneyFinding = isMoneyFinding(context.finding);
  const formulaSupported = formulaIsSupported(context.finding);
  const missingEvidence: string[] = [];
  const conflictingSignals = detectConflictingSignals(context);
  const reviewerChecklist = [
    'Verify the deterministic calculation amount and formula inputs before any status change.',
    'Confirm the approved contract evidence applies to this customer and audited period.',
    ...(moneyFinding ? ['Confirm approved invoice or usage evidence matches the same customer and billing period.'] : []),
    'Confirm no amendment, credit, billing-cycle, or customer-match exception explains the finding.'
  ];

  if (!contractEvidencePresent) {
    missingEvidence.push('Approved contract evidence is required before reviewer approval.');
  }
  if (moneyFinding && !invoiceOrUsageEvidencePresent) {
    missingEvidence.push('Approved invoice or usage evidence is required for recoverable money findings.');
  }
  if (moneyFinding && !formulaSupported) {
    missingEvidence.push('A stored deterministic formula with inputs is required for recoverable money findings.');
  }
  if (context.evidence.length === 0 && context.candidates.length === 0) {
    missingEvidence.push('No evidence references or candidate snippets are attached to this finding.');
  }

  const requiredEvidencePresent = missingEvidence.length === 0;
  const weakSignals = [
    context.finding.confidence < 0.75 ? 'Finding confidence is below the normal reviewer threshold.' : null,
    context.evidence.some((item) => item.approvalState === 'suggested') ? 'Some evidence is still suggested rather than human-approved.' : null,
    context.relatedTerms.some((term) => ['extracted', 'needs_review'].includes(term.reviewStatus))
      ? 'Related contract terms still need human review.'
      : null
  ].filter((signal): signal is string => Boolean(signal));

  const quality: EvidenceQualityLevel = conflictingSignals.length > 0
    ? 'conflicting_evidence'
    : !requiredEvidencePresent
      ? 'needs_more_evidence'
      : weakSignals.length > 0
        ? 'medium_evidence'
        : 'strong_evidence';
  const score = scoreForQuality(quality, context.finding.confidence, weakSignals.length);
  const recommendation = recommendationForQuality(quality);

  return evidenceQualityReviewSchema.parse({
    quality,
    score,
    requiredEvidencePresent,
    contractEvidencePresent,
    invoiceOrUsageEvidencePresent,
    formulaSupported,
    missingEvidence: unique(missingEvidence),
    conflictingSignals: unique(conflictingSignals),
    reviewerChecklist: unique(reviewerChecklist),
    recommendation
  });
}

export function evaluateFalsePositiveRisk(context: EvidenceAiReviewContext): FalsePositiveReview {
  const text = reviewSignalText(context);
  const quality = evaluateEvidenceQuality(context);
  const riskReasons: string[] = [];
  const suggestedChecks: string[] = [
    'Confirm the finding customer, contract evidence, and billing evidence all refer to the same account.',
    'Confirm the billing period in the calculation matches the cited invoice or usage period.',
    'Confirm the amount was not resolved by a credit, true-up, later invoice, waiver, or amendment.'
  ];
  const blockingIssues: string[] = [];

  if (hasAnySignal(text, ['amendment', 'addendum', 'superseded', 'override', 'conflict'])) {
    riskReasons.push('Possible amendment conflict or superseded term could change the entitlement.');
    suggestedChecks.push('Check amendments, order forms, and special billing notes before approving.');
    blockingIssues.push('Resolve amendment or superseded-term conflict before approval.');
  }
  if (isMoneyFinding(context.finding) && !quality.invoiceOrUsageEvidencePresent) {
    riskReasons.push('Missing approved invoice-period or usage evidence for a money finding.');
    suggestedChecks.push('Attach the invoice, credit memo, usage, or billing-system reference for the audited period.');
    blockingIssues.push('Approved invoice or usage evidence is missing.');
  }
  if (hasAnySignal(text, ['credit note', 'credit memo', 'refund', 'offset', 'write-off', 'write off'])) {
    riskReasons.push('Possible credit note, refund, offset, or write-off could explain the apparent leakage.');
    suggestedChecks.push('Check credit notes and refunds before making this customer-facing.');
  }
  if (hasAnySignal(text, ['discount extension', 'extended discount', 'promo extension', 'waiver'])) {
    riskReasons.push('Possible discount extension or waiver could make the variance valid.');
    suggestedChecks.push('Check approved discount extensions, waivers, and customer-specific exceptions.');
  }
  if (hasAnySignal(text, ['true-up', 'true up', 'annual adjustment', 'annual reconciliation'])) {
    riskReasons.push('Annual true-up language may allow the variance to be billed later.');
    suggestedChecks.push('Check true-up timing before treating the current period as leakage.');
  }
  if (hasAnySignal(text, ['usage billed later', 'billed later', 'arrears', 'next invoice'])) {
    riskReasons.push('Usage may be contractually billed after the usage period.');
    suggestedChecks.push('Check whether usage is billed in arrears on a later invoice.');
  }
  if (hasAnySignal(text, ['wrong billing period', 'billing period', 'service period', 'proration', 'prorated', 'pro-rated'])) {
    riskReasons.push('Wrong billing period or proration could explain the variance.');
    suggestedChecks.push('Match service period, billing cycle, invoice date, and usage period.');
  }
  if (hasAnySignal(text, ['wrong customer', 'customer mismatch', 'account mismatch', 'unassigned'])) {
    riskReasons.push('Wrong customer match could attach the finding to the wrong account.');
    suggestedChecks.push('Verify customer identifiers across contract, invoice, usage, and finding records.');
    blockingIssues.push('Customer match needs reviewer confirmation.');
  }
  if (formulaNeedsUsage(context.finding) && !approvedEvidence(context).some(isUsageEvidence)) {
    riskReasons.push('Missing usage data for a usage-sensitive calculation.');
    suggestedChecks.push('Attach approved usage evidence for the same metric and period.');
    blockingIssues.push('Usage evidence is missing for a usage-sensitive finding.');
  }
  if (hasAnySignal(text, ['duplicate invoice', 'duplicate billing', 'same invoice twice'])) {
    riskReasons.push('Duplicate invoice records could distort the deterministic comparison.');
    suggestedChecks.push('Check invoice IDs and imported rows for duplicates.');
  }
  if (hasAnySignal(text, ['currency mismatch', 'fx', 'foreign exchange', 'multi-currency'])) {
    riskReasons.push('Currency mismatch or FX conversion could explain the variance.');
    suggestedChecks.push('Verify all source records use the same currency or approved FX treatment.');
    blockingIssues.push('Currency mismatch needs reviewer resolution.');
  }
  if (hasAnySignal(text, ['one-time', 'one time', 'recurring', 'non-recurring', 'non recurring'])) {
    riskReasons.push('One-time versus recurring charge classification could be confused.');
    suggestedChecks.push('Confirm the charge is recurring before treating it as repeated leakage.');
  }
  if (quality.conflictingSignals.length > 0) {
    riskReasons.push('Evidence quality review found conflicting evidence signals.');
    blockingIssues.push('Resolve conflicting evidence before approval.');
  }

  const riskLevel = riskLevelFor(riskReasons, blockingIssues);
  const recommendation: EvidenceQualityRecommendation = riskLevel === 'critical' || riskLevel === 'high'
    ? 'do_not_approve_yet'
    : quality.recommendation === 'needs_more_evidence'
      ? 'needs_more_evidence'
      : 'ready_for_review';

  return falsePositiveReviewSchema.parse({
    riskLevel,
    riskReasons: unique(riskReasons),
    suggestedChecks: unique(suggestedChecks),
    blockingIssues: unique(blockingIssues),
    recommendation
  });
}

export function applyEvidenceQualityGuardrails(
  aiOutput: EvidenceQualityReview,
  context: EvidenceAiReviewContext
): EvidenceQualityReview {
  const deterministic = evaluateEvidenceQuality(context);
  const quality = stricterQuality(aiOutput.quality, deterministic.quality);

  return evidenceQualityReviewSchema.parse({
    quality,
    score: Math.min(aiOutput.score, deterministic.score),
    requiredEvidencePresent: deterministic.requiredEvidencePresent && aiOutput.requiredEvidencePresent,
    contractEvidencePresent: deterministic.contractEvidencePresent || aiOutput.contractEvidencePresent,
    invoiceOrUsageEvidencePresent: deterministic.invoiceOrUsageEvidencePresent || aiOutput.invoiceOrUsageEvidencePresent,
    formulaSupported: deterministic.formulaSupported && aiOutput.formulaSupported,
    missingEvidence: unique([...deterministic.missingEvidence, ...aiOutput.missingEvidence]),
    conflictingSignals: unique([...deterministic.conflictingSignals, ...aiOutput.conflictingSignals]),
    reviewerChecklist: unique([...deterministic.reviewerChecklist, ...aiOutput.reviewerChecklist]),
    recommendation: stricterRecommendation(aiOutput.recommendation, deterministic.recommendation)
  });
}

export function applyFalsePositiveGuardrails(
  aiOutput: FalsePositiveReview,
  context: EvidenceAiReviewContext
): FalsePositiveReview {
  const deterministic = evaluateFalsePositiveRisk(context);
  const riskLevel = stricterRisk(aiOutput.riskLevel, deterministic.riskLevel);

  return falsePositiveReviewSchema.parse({
    riskLevel,
    riskReasons: unique([...deterministic.riskReasons, ...aiOutput.riskReasons]),
    suggestedChecks: unique([...deterministic.suggestedChecks, ...aiOutput.suggestedChecks]),
    blockingIssues: unique([...deterministic.blockingIssues, ...aiOutput.blockingIssues]),
    recommendation: stricterRecommendation(aiOutput.recommendation, deterministic.recommendation)
  });
}

function isMoneyFinding(finding: EvidenceAiReviewFinding): boolean {
  return finding.amountMinor > 0 && finding.outcomeType !== 'risk_alert';
}

function isHumanApprovedEvidence(item: EvidenceAiReviewReference): boolean {
  return item.approvalState === 'approved' && Boolean(item.reviewedBy) && Boolean(item.reviewedAt);
}

function approvedEvidence(context: EvidenceAiReviewContext): EvidenceAiReviewReference[] {
  return context.evidence.filter(isHumanApprovedEvidence);
}

function isContractEvidence(item: EvidenceAiReviewReference): boolean {
  return sourceTypeForEvidence(item) === 'contract';
}

function isInvoiceOrUsageEvidence(item: EvidenceAiReviewReference): boolean {
  const sourceType = sourceTypeForEvidence(item);
  return sourceType === 'invoice' || sourceType === 'usage';
}

function isUsageEvidence(item: EvidenceAiReviewReference): boolean {
  return sourceTypeForEvidence(item) === 'usage';
}

function sourceTypeForEvidence(item: EvidenceAiReviewReference): string | undefined {
  if (item.sourceType) return item.sourceType;
  if (item.evidenceType === 'contract_term') return 'contract';
  if (item.evidenceType === 'invoice_row') return 'invoice';
  if (item.evidenceType === 'usage_row') return 'usage';
  if (item.evidenceType === 'calculation') return 'calculation';
  return undefined;
}

function formulaIsSupported(finding: EvidenceAiReviewFinding): boolean {
  if (finding.outcomeType === 'risk_alert') {
    return isRecord(finding.calculation);
  }

  return Boolean(normalizeExportCalculation(finding.calculation));
}

function formulaNeedsUsage(finding: EvidenceAiReviewFinding): boolean {
  return hasAnySignal(findingSignalText(finding), ['usage', 'overage', 'quantity', 'meter']);
}

function detectConflictingSignals(context: EvidenceAiReviewContext): string[] {
  const text = reviewSignalText(context);
  const signals: string[] = [];

  if (context.finding.evidenceCoverageStatus === 'conflicting') {
    signals.push('Finding evidence coverage is marked conflicting.');
  }
  if (hasAnySignal(text, ['amendment conflict', 'conflicting evidence', 'superseded', 'override conflict'])) {
    signals.push('Potential amendment, superseded term, or source conflict detected.');
  }
  if (context.evidence.some((item) => item.approvalState === 'rejected')) {
    signals.push('At least one attached evidence item was rejected.');
  }

  return unique(signals);
}

function scoreForQuality(quality: EvidenceQualityLevel, confidence: number, weakSignalCount: number): number {
  const boundedConfidence = Math.max(0, Math.min(1, confidence || 0));
  const base = quality === 'strong_evidence'
    ? 92
    : quality === 'medium_evidence'
      ? 78
      : quality === 'weak_evidence'
        ? 58
        : quality === 'needs_more_evidence'
          ? 52
          : 38;

  return Math.max(0, Math.min(100, Math.round(base + (boundedConfidence - 0.8) * 10 - weakSignalCount * 5)));
}

function recommendationForQuality(quality: EvidenceQualityLevel): EvidenceQualityRecommendation {
  if (quality === 'strong_evidence' || quality === 'medium_evidence') return 'ready_for_review';
  if (quality === 'needs_more_evidence' || quality === 'weak_evidence') return 'needs_more_evidence';
  return 'do_not_approve_yet';
}

function riskLevelFor(riskReasons: string[], blockingIssues: string[]): FalsePositiveRiskLevel {
  if (blockingIssues.some((issue) => /currency|customer match/i.test(issue))) return 'critical';
  if (blockingIssues.length > 0) return 'high';
  if (riskReasons.length >= 2) return 'medium';
  if (riskReasons.length === 1) return 'medium';
  return 'low';
}

function stricterQuality(left: EvidenceQualityLevel, right: EvidenceQualityLevel): EvidenceQualityLevel {
  return qualityRank[right] > qualityRank[left] ? right : left;
}

function stricterRecommendation(
  left: EvidenceQualityRecommendation,
  right: EvidenceQualityRecommendation
): EvidenceQualityRecommendation {
  return recommendationRank[right] > recommendationRank[left] ? right : left;
}

function stricterRisk(left: FalsePositiveRiskLevel, right: FalsePositiveRiskLevel): FalsePositiveRiskLevel {
  return riskRank[right] > riskRank[left] ? right : left;
}

function reviewSignalText(context: EvidenceAiReviewContext): string {
  return [
    findingSignalText(context.finding),
    ...context.evidence.flatMap((item) => [item.evidenceType, item.sourceType, item.label, item.snippet]),
    ...context.candidates.flatMap((item) => [item.approvalState, item.label, item.snippet, item.reviewNote]),
    ...context.relatedTerms.flatMap((term) => [term.termType, term.reviewStatus, term.label, term.snippet])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function findingSignalText(finding: EvidenceAiReviewFinding): string {
  return [
    finding.type,
    finding.title,
    finding.summary,
    finding.reviewNote,
    ...Object.keys(finding.calculation),
    ...Object.values(finding.calculation).map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : ''))
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasAnySignal(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 12);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
