import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FINDING_AI_CRITIQUE_PROMPT_VERSION = 'finding-evidence-critic-v1';

export const findingAiRecommendationSchema = z.enum([
  'strong_evidence',
  'weak_evidence',
  'conflicting_evidence',
  'needs_more_evidence'
]);

const shortTextSchema = z.string().trim().min(1).max(1200);
const optionalShortTextSchema = z.string().trim().max(1200).optional();

export const findingCritiqueRiskSchema = z.object({
  risk: shortTextSchema,
  severity: z.enum(['low', 'medium', 'high']),
  evidenceReference: optionalShortTextSchema,
  reviewerAction: shortTextSchema
}).strict();

export const findingCritiqueOutputSchema = z.object({
  evidenceQuality: z.object({
    score: z.number().int().min(0).max(100),
    summary: shortTextSchema,
    strengths: z.array(shortTextSchema).max(8).default([]),
    gaps: z.array(shortTextSchema).max(8).default([])
  }).strict(),
  falsePositiveRisks: z.array(findingCritiqueRiskSchema).max(12).default([]),
  reviewerChecklist: z.array(shortTextSchema).min(1).max(12),
  recommendation: findingAiRecommendationSchema,
  recommendationRationale: shortTextSchema,
  safety: z.object({
    canApproveFinding: z.literal(false),
    canChangeFindingAmount: z.literal(false),
    canChangeFindingStatus: z.literal(false)
  }).strict()
}).strict();

export type FindingAiRecommendation = z.infer<typeof findingAiRecommendationSchema>;
export type FindingCritiqueOutput = z.infer<typeof findingCritiqueOutputSchema>;

export type FindingCritiqueEvidenceSnippet = {
  evidenceId: string;
  evidenceType: string;
  sourceType?: string;
  label: string;
  snippet?: string;
  approvalState: 'approved';
};

export type FindingCritiqueContext = {
  finding: {
    id: string;
    type: string;
    outcomeType: string;
    title: string;
    summary: string;
    status: string;
    estimatedAmountMinor: number;
    currency: string;
    confidence: number;
    evidenceCoverageStatus?: string | null;
    calculation: Record<string, unknown>;
  };
  citations: Array<{
    sourceType?: string;
    label?: string;
    excerpt?: string;
  }>;
  approvedEvidence: FindingCritiqueEvidenceSnippet[];
};

export function parseFindingCritiqueOutput(output: unknown): FindingCritiqueOutput {
  return findingCritiqueOutputSchema.parse(output);
}

export function applyFindingCritiqueGuardrails(
  critique: FindingCritiqueOutput,
  context: FindingCritiqueContext
): FindingCritiqueOutput {
  const guardrails = deriveFindingCritiqueGuardrails(context);
  if (guardrails.risks.length === 0 && guardrails.checklist.length === 0 && !guardrails.recommendation) {
    return critique;
  }

  const risks = [...guardrails.risks, ...critique.falsePositiveRisks].slice(0, 12);
  const checklist = Array.from(new Set([...guardrails.checklist, ...critique.reviewerChecklist])).slice(0, 12);
  const recommendation = stricterRecommendation(critique.recommendation, guardrails.recommendation);
  const evidenceScore = Math.min(critique.evidenceQuality.score, guardrails.maxEvidenceScore ?? 100);

  return {
    ...critique,
    evidenceQuality: {
      ...critique.evidenceQuality,
      score: evidenceScore,
      gaps: Array.from(new Set([...guardrails.gaps, ...critique.evidenceQuality.gaps])).slice(0, 8)
    },
    falsePositiveRisks: risks,
    reviewerChecklist: checklist.length > 0 ? checklist : critique.reviewerChecklist,
    recommendation,
    safety: {
      canApproveFinding: false,
      canChangeFindingAmount: false,
      canChangeFindingStatus: false
    }
  };
}

export function deriveFindingCritiqueGuardrails(context: FindingCritiqueContext): {
  risks: FindingCritiqueOutput['falsePositiveRisks'];
  checklist: string[];
  gaps: string[];
  recommendation?: FindingAiRecommendation;
  maxEvidenceScore?: number;
} {
  const approvedEvidence = context.approvedEvidence;
  const sourceTypes = new Set(approvedEvidence.map((item) => normalizeSourceType(item.sourceType, item.evidenceType)).filter(Boolean));
  const risks: FindingCritiqueOutput['falsePositiveRisks'] = [];
  const checklist: string[] = [];
  const gaps: string[] = [];
  let recommendation: FindingAiRecommendation | undefined;
  let maxEvidenceScore: number | undefined;

  if (!sourceTypes.has('contract')) {
    risks.push({
      risk: 'No approved contract evidence is attached to this finding.',
      severity: 'high',
      reviewerAction: 'Attach and approve the contract clause that supports the entitlement before customer use.'
    });
    checklist.push('Confirm the approved contract clause supports the finding type and amount basis.');
    gaps.push('Approved contract evidence is missing.');
    recommendation = 'needs_more_evidence';
    maxEvidenceScore = Math.min(maxEvidenceScore ?? 100, 60);
  }

  if (context.finding.outcomeType !== 'risk_alert' && !sourceTypes.has('invoice') && !sourceTypes.has('usage')) {
    risks.push({
      risk: 'No approved invoice or usage evidence is attached to this recoverable money finding.',
      severity: 'high',
      reviewerAction: 'Approve the invoice row, usage row, or billing source that proves the deterministic calculation inputs.'
    });
    checklist.push('Match the calculation inputs to approved invoice or usage evidence.');
    gaps.push('Approved invoice or usage evidence is missing.');
    recommendation = 'needs_more_evidence';
    maxEvidenceScore = Math.min(maxEvidenceScore ?? 100, 60);
  }

  if (context.finding.evidenceCoverageStatus === 'conflicting') {
    risks.push({
      risk: 'Conflicting evidence warning: approved or attached evidence is marked as conflicting.',
      severity: 'high',
      reviewerAction: 'Resolve the conflicting source references before marking the finding customer-ready.'
    });
    checklist.push('Compare the conflicting source references and decide which source governs the billing period.');
    gaps.push('Evidence coverage is conflicting.');
    recommendation = 'conflicting_evidence';
    maxEvidenceScore = Math.min(maxEvidenceScore ?? 100, 50);
  }

  return { risks, checklist, gaps, recommendation, maxEvidenceScore };
}

export function buildFindingCritiquePrompt(context: FindingCritiqueContext): string {
  return [
    'Review this LeakProof revenue leakage finding as an evidence quality critic.',
    'Use only the provided finding, deterministic calculation, citations, approved evidence, and source snippets.',
    'Do not calculate or change money. Do not approve, reject, or change the finding status.',
    'Return strict JSON matching the requested schema.',
    '',
    JSON.stringify({
      finding: context.finding,
      citations: context.citations.map((citation) => ({
        sourceType: citation.sourceType,
        label: citation.label,
        excerpt: truncate(citation.excerpt, 500)
      })),
      approvedEvidence: context.approvedEvidence.map((item) => ({
        evidenceId: item.evidenceId,
        evidenceType: item.evidenceType,
        sourceType: item.sourceType,
        label: item.label,
        snippet: truncate(item.snippet, 500),
        approvalState: item.approvalState
      }))
    })
  ].join('\n');
}

export function findingCritiqueSystemInstruction(): string {
  return [
    'You are the AI Evidence Quality Scorer and False Positive Critic for LeakProof AI.',
    'Your role is advisory. LLM critiques and explains. Code calculates. Human approves.',
    'You must identify evidence gaps, conflicting evidence, false-positive risks, and reviewer checks.',
    'You must never claim the finding is approved or customer-ready.',
    'You must set safety.canApproveFinding=false, safety.canChangeFindingAmount=false, and safety.canChangeFindingStatus=false.',
    'recommendation must be one of strong_evidence, weak_evidence, conflicting_evidence, needs_more_evidence.',
    'If invoice or usage evidence is missing for a money finding, recommend needs_more_evidence.',
    'If evidence is conflicting, recommend conflicting_evidence.',
    'Return only JSON.'
  ].join(' ');
}

export function fingerprintFindingCritiqueInput(context: FindingCritiqueContext): string {
  return createHash('sha256').update(stableStringify(context)).digest('hex');
}

export function normalizeEvidenceSnippet(input: {
  evidenceId: string;
  evidenceType: string;
  citation?: { label?: string; excerpt?: string; sourceType?: string } | null;
  excerpt?: string | null;
}): FindingCritiqueEvidenceSnippet {
  return {
    evidenceId: input.evidenceId,
    evidenceType: input.evidenceType,
    sourceType: normalizeSourceType(input.citation?.sourceType, input.evidenceType),
    label: input.citation?.label ?? 'Approved evidence',
    snippet: truncate(input.excerpt ?? input.citation?.excerpt, 500),
    approvalState: 'approved'
  };
}

function normalizeSourceType(sourceType: string | undefined, evidenceType: string): string | undefined {
  if (sourceType) return sourceType;
  if (evidenceType === 'contract_term') return 'contract';
  if (evidenceType === 'invoice_row') return 'invoice';
  if (evidenceType === 'usage_row') return 'usage';
  if (evidenceType === 'calculation') return 'calculation';
  return undefined;
}

function stricterRecommendation(
  current: FindingAiRecommendation,
  guardrailRecommendation: FindingAiRecommendation | undefined
): FindingAiRecommendation {
  if (!guardrailRecommendation) return current;
  const rank: Record<FindingAiRecommendation, number> = {
    strong_evidence: 0,
    weak_evidence: 1,
    needs_more_evidence: 2,
    conflicting_evidence: 3
  };
  return rank[guardrailRecommendation] > rank[current] ? guardrailRecommendation : current;
}

function truncate(value: string | undefined | null, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
