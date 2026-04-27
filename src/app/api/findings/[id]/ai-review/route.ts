import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { generateGeminiJson } from '@/lib/ai/geminiClient';
import {
  evidenceQualityReviewSchema,
  type EvidenceQualityReview
} from '@/lib/ai/evidenceQualitySchema';
import { falsePositiveReviewSchema, type FalsePositiveReview } from '@/lib/ai/falsePositiveSchema';
import { assertNoSecrets, truncateSafeExcerpt } from '@/lib/ai/safety';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import {
  applyEvidenceQualityGuardrails,
  applyFalsePositiveGuardrails,
  evaluateEvidenceQuality,
  evaluateFalsePositiveRisk,
  type EvidenceAiReviewContext,
  type EvidenceAiReviewType
} from '@/lib/evidence/aiReview';

export const runtime = 'nodejs';

const FINDING_AI_REVIEW_PROMPT_VERSION = 'finding-ai-review-v1';

const findingAiReviewRequestSchema = z
  .object({
    organization_id: uuidSchema,
    workspace_id: uuidSchema,
    review_type: z.enum(['evidence_quality', 'false_positive', 'both']).default('both')
  })
  .strict();

const findingAiReviewOutputSchema = z
  .object({
    evidenceQuality: evidenceQualityReviewSchema.optional(),
    falsePositive: falsePositiveReviewSchema.optional()
  })
  .strict();

type FindingRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  customer_id?: string | null;
  finding_type: string;
  outcome_type: string;
  title: string;
  summary: string;
  estimated_amount_minor: number | string | null;
  currency: string | null;
  confidence: number | string | null;
  status: string;
  evidence_coverage_status?: string | null;
  calculation?: Record<string, unknown> | null;
  review_note?: string | null;
};

type EvidenceRow = {
  id: string;
  evidence_type: string;
  citation?: { label?: string; excerpt?: string; sourceType?: string } | null;
  excerpt?: string | null;
  approval_state?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

type CandidateRow = {
  id: string;
  retrieval_score?: number | string | null;
  relevance_explanation?: string | null;
  approval_state?: string | null;
  review_note?: string | null;
  document_chunks?: {
    source_label?: string | null;
    content?: string | null;
  } | null;
};

type RelatedTermRow = {
  id: string;
  term_type: string;
  review_status: string;
  confidence?: number | string | null;
  citation?: { label?: string; excerpt?: string } | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const findingId = uuidSchema.parse(id);
    const body = findingAiReviewRequestSchema.parse(await request.json());
    const auth = await requireOrganizationMember(request, body.organization_id);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    await assertWorkspaceBelongsToOrganization(body.organization_id, body.workspace_id);
    await enforceRateLimit({
      key: `finding-ai-review:${auth.userId}:${body.organization_id}:${body.workspace_id}:${findingId}`,
      limit: 8,
      windowMs: 10 * 60 * 1000
    });

    const supabase = createSupabaseServiceClient();
    const { data: finding, error: findingError } = await supabase
      .from('leakage_findings')
      .select('id, organization_id, workspace_id, customer_id, finding_type, outcome_type, title, summary, estimated_amount_minor, currency, confidence, status, evidence_coverage_status, calculation, review_note')
      .eq('id', findingId)
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', body.workspace_id)
      .eq('is_active', true)
      .single();
    if (findingError) throw findingError;

    const findingRow = finding as FindingRow;
    const [evidenceResult, candidateResult, relatedTermResult] = await Promise.all([
      supabase
        .from('evidence_items')
        .select('id, evidence_type, citation, excerpt, approval_state, reviewed_by, reviewed_at')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', body.workspace_id)
        .eq('finding_id', findingId)
        .order('created_at', { ascending: true }),
      supabase
        .from('evidence_candidates')
        .select('id, retrieval_score, relevance_explanation, approval_state, review_note, document_chunks(source_label, content)')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', body.workspace_id)
        .eq('finding_id', findingId)
        .order('created_at', { ascending: false })
        .limit(12),
      relatedTermsQuery(supabase, body.organization_id, body.workspace_id, findingRow.customer_id ?? null)
    ]);

    if (evidenceResult.error) throw evidenceResult.error;
    if (candidateResult.error) throw candidateResult.error;
    if (relatedTermResult.error) throw relatedTermResult.error;

    const reviewContext = buildReviewContext({
      finding: findingRow,
      evidenceRows: (evidenceResult.data ?? []) as EvidenceRow[],
      candidateRows: (candidateResult.data ?? []) as CandidateRow[],
      relatedTermRows: (relatedTermResult.data ?? []) as RelatedTermRow[]
    });
    assertNoSecrets(reviewContext);

    const baselineEvidence = evaluateEvidenceQuality(reviewContext);
    const baselineFalsePositive = evaluateFalsePositiveRisk(reviewContext);
    const includesEvidenceQuality = body.review_type === 'evidence_quality' || body.review_type === 'both';
    const includesFalsePositive = body.review_type === 'false_positive' || body.review_type === 'both';
    let evidenceQuality: EvidenceQualityReview | null = includesEvidenceQuality ? baselineEvidence : null;
    let falsePositive: FalsePositiveReview | null = includesFalsePositive ? baselineFalsePositive : null;
    let geminiProvenance: {
      provider: string;
      model: string;
      modelVersion: string | null;
      promptVersion: string;
    } = {
      provider: 'deterministic',
      model: 'local-guardrails',
      modelVersion: null as string | null,
      promptVersion: FINDING_AI_REVIEW_PROMPT_VERSION
    };
    let fallbackReason: string | null = null;

    try {
      const geminiResult = await generateGeminiJson<unknown>({
        promptVersion: FINDING_AI_REVIEW_PROMPT_VERSION,
        systemInstruction: findingAiReviewSystemInstruction(body.review_type),
        prompt: buildFindingAiReviewPrompt(reviewContext, body.review_type)
      });
      const parsed = findingAiReviewOutputSchema.parse(geminiResult.data);
      if (includesEvidenceQuality && parsed.evidenceQuality) {
        evidenceQuality = applyEvidenceQualityGuardrails(parsed.evidenceQuality, reviewContext);
      }
      if (includesFalsePositive && parsed.falsePositive) {
        falsePositive = applyFalsePositiveGuardrails(parsed.falsePositive, reviewContext);
      }
      geminiProvenance = {
        provider: geminiResult.provenance.provider,
        model: geminiResult.provenance.model,
        modelVersion: geminiResult.provenance.modelVersion ?? null,
        promptVersion: geminiResult.provenance.promptVersion
      };
    } catch {
      fallbackReason = 'invalid_or_unavailable_gemini_output';
    }

    const reviewJson = redactContextSnippetsFromStoredReview(buildStoredReviewJson({
      reviewType: body.review_type,
      evidenceQuality,
      falsePositive,
      fallbackReason
    }), reviewContext);
    assertNoSecrets(reviewJson);

    const { data: insertedReview, error: insertError } = await supabase
      .from('finding_ai_critiques')
      .insert({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        finding_id: findingId,
        recommendation_status: recommendationStatusForStorage(evidenceQuality, falsePositive),
        evidence_score: evidenceQuality?.score ?? scoreForFalsePositive(falsePositive),
        critique_json: reviewJson,
        input_fingerprint: fingerprintSafeReviewInput(reviewContext),
        provider: geminiProvenance.provider,
        model: geminiProvenance.model,
        model_version: geminiProvenance.modelVersion,
        prompt_version: geminiProvenance.promptVersion,
        generated_by: auth.userId
      })
      .select('*')
      .single();
    if (insertError) throw insertError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'finding.ai_review_generated',
      entityType: 'finding_ai_critique',
      entityId: insertedReview.id,
      metadata: {
        finding_id: findingId,
        review_type: body.review_type,
        recommendation_status: recommendationStatusForStorage(evidenceQuality, falsePositive),
        evidence_score: evidenceQuality?.score ?? scoreForFalsePositive(falsePositive),
        false_positive_risk_level: falsePositive?.riskLevel ?? null,
        prompt_version: geminiProvenance.promptVersion,
        model: geminiProvenance.model,
        fallback: Boolean(fallbackReason)
      }
    });

    return NextResponse.json({ review: insertedReview });
  } catch (error) {
    return handleApiError(error);
  }
}

function relatedTermsQuery(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  workspaceId: string,
  customerId: string | null
) {
  let query = supabase
    .from('contract_terms')
    .select('id, term_type, review_status, confidence, citation')
    .eq('organization_id', organizationId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .in('review_status', ['approved', 'edited', 'needs_review'])
    .order('created_at', { ascending: false })
    .limit(16);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  return query;
}

function buildReviewContext(input: {
  finding: FindingRow;
  evidenceRows: EvidenceRow[];
  candidateRows: CandidateRow[];
  relatedTermRows: RelatedTermRow[];
}): EvidenceAiReviewContext {
  return {
    finding: {
      id: input.finding.id,
      type: input.finding.finding_type,
      outcomeType: input.finding.outcome_type,
      title: truncateSafeExcerpt(input.finding.title, 220),
      summary: truncateSafeExcerpt(input.finding.summary, 500),
      status: input.finding.status,
      amountMinor: Number(input.finding.estimated_amount_minor ?? 0),
      currency: input.finding.currency ?? 'USD',
      confidence: Number(input.finding.confidence ?? 0),
      evidenceCoverageStatus: input.finding.evidence_coverage_status,
      calculation: safeCalculation(input.finding.calculation ?? {}),
      reviewNote: truncateSafeExcerpt(input.finding.review_note, 240)
    },
    evidence: input.evidenceRows.map((row) => ({
      id: row.id,
      evidenceType: row.evidence_type,
      sourceType: row.citation?.sourceType,
      approvalState: row.approval_state,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      label: truncateSafeExcerpt(row.citation?.label, 180),
      snippet: truncateSafeExcerpt(row.excerpt ?? row.citation?.excerpt, 320)
    })),
    candidates: input.candidateRows.map((row) => ({
      id: row.id,
      approvalState: row.approval_state,
      retrievalScore: Number(row.retrieval_score ?? 0),
      label: truncateSafeExcerpt(row.document_chunks?.source_label, 180),
      snippet: truncateSafeExcerpt(row.document_chunks?.content ?? row.relevance_explanation, 320),
      reviewNote: truncateSafeExcerpt(row.review_note, 220)
    })),
    relatedTerms: input.relatedTermRows.map((row) => ({
      id: row.id,
      termType: row.term_type,
      reviewStatus: row.review_status,
      confidence: Number(row.confidence ?? 0),
      label: truncateSafeExcerpt(row.citation?.label, 180),
      snippet: truncateSafeExcerpt(row.citation?.excerpt, 260)
    }))
  };
}

function buildFindingAiReviewPrompt(context: EvidenceAiReviewContext, reviewType: EvidenceAiReviewType): string {
  return [
    'Review this LeakProof finding as an evidence quality scorer and false-positive critic.',
    'Use only the safe finding fields, deterministic calculation keys, evidence references, candidate snippets, and related term references below.',
    'Do not calculate or change money. Do not approve evidence. Do not approve, reject, mark customer-ready, export, email, or invoice.',
    'Return strict JSON. Include only the requested review sections.',
    '',
    JSON.stringify({
      reviewType,
      expectedOutput: {
        evidenceQuality: reviewType === 'false_positive' ? undefined : 'EvidenceQualityReview schema',
        falsePositive: reviewType === 'evidence_quality' ? undefined : 'FalsePositiveReview schema'
      },
      context
    })
  ].join('\n');
}

function findingAiReviewSystemInstruction(reviewType: EvidenceAiReviewType): string {
  return [
    'You are an advisory LeakProof AI reviewer.',
    'Global rule: LLM explains and suggests. Code calculates. Human approves.',
    `Requested review_type: ${reviewType}.`,
    'For evidenceQuality, output quality, score, booleans, missingEvidence, conflictingSignals, reviewerChecklist, and recommendation.',
    'For falsePositive, check amendment conflict, missing invoice period, possible credit note, discount extension, annual true-up, usage billed later, wrong billing period, wrong customer match, missing usage data, duplicate invoice, currency mismatch, and one-time vs recurring confusion.',
    'Never claim the finding is approved or customer-ready.',
    'Return only JSON.'
  ].join(' ');
}

function buildStoredReviewJson(input: {
  reviewType: EvidenceAiReviewType;
  evidenceQuality: EvidenceQualityReview | null;
  falsePositive: FalsePositiveReview | null;
  fallbackReason: string | null;
}) {
  const reviewerChecklist = Array.from(new Set([
    ...(input.evidenceQuality?.reviewerChecklist ?? []),
    ...(input.falsePositive?.suggestedChecks ?? [])
  ])).slice(0, 12);

  return {
    schemaVersion: 'finding-ai-review-v1',
    reviewType: input.reviewType,
    evidenceQuality: input.evidenceQuality,
    falsePositive: input.falsePositive,
    reviewerChecklist,
    recommendation: combinedRecommendation(input.evidenceQuality, input.falsePositive),
    fallbackReason: input.fallbackReason,
    safety: {
      canApproveEvidence: false,
      canApproveFinding: false,
      canChangeFindingAmount: false,
      canChangeFindingStatus: false,
      canMarkCustomerReady: false,
      canExportReports: false,
      canSendEmails: false,
      canCreateInvoices: false
    }
  };
}

function recommendationStatusForStorage(
  evidenceQuality: EvidenceQualityReview | null,
  falsePositive: FalsePositiveReview | null
): 'strong_evidence' | 'weak_evidence' | 'conflicting_evidence' | 'needs_more_evidence' {
  if (evidenceQuality?.quality === 'conflicting_evidence' || falsePositive?.riskLevel === 'critical') return 'conflicting_evidence';
  if (evidenceQuality?.quality === 'needs_more_evidence' || falsePositive?.riskLevel === 'high') return 'needs_more_evidence';
  if (evidenceQuality?.quality === 'weak_evidence' || evidenceQuality?.quality === 'medium_evidence' || falsePositive?.riskLevel === 'medium') {
    return 'weak_evidence';
  }
  return 'strong_evidence';
}

function scoreForFalsePositive(falsePositive: FalsePositiveReview | null): number {
  if (!falsePositive) return 50;
  if (falsePositive.riskLevel === 'critical') return 25;
  if (falsePositive.riskLevel === 'high') return 45;
  if (falsePositive.riskLevel === 'medium') return 70;
  return 90;
}

function combinedRecommendation(
  evidenceQuality: EvidenceQualityReview | null,
  falsePositive: FalsePositiveReview | null
): string {
  if (falsePositive?.recommendation === 'do_not_approve_yet' || evidenceQuality?.recommendation === 'do_not_approve_yet') {
    return 'do_not_approve_yet';
  }
  if (falsePositive?.recommendation === 'needs_more_evidence' || evidenceQuality?.recommendation === 'needs_more_evidence') {
    return 'needs_more_evidence';
  }
  return 'ready_for_review';
}

function safeCalculation(calculation: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(calculation)
      .filter(([key]) => !/raw|prompt|text|content|secret|token|api[_-]?key/i.test(key))
      .map(([key, value]) => [key, safeCalculationValue(value)])
  );
}

function safeCalculationValue(value: unknown): unknown {
  if (typeof value === 'string') return truncateSafeExcerpt(value, 180);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(safeCalculationValue);
  if (value && typeof value === 'object') return safeCalculation(value as Record<string, unknown>);
  return undefined;
}

function fingerprintSafeReviewInput(context: EvidenceAiReviewContext): string {
  const finding = context.finding;
  return [
    finding.id,
    finding.type,
    finding.status,
    finding.amountMinor,
    context.evidence.map((item) => `${item.id}:${item.approvalState}:${item.reviewedAt ?? ''}`).join('|'),
    context.candidates.map((item) => `${item.id}:${item.approvalState ?? ''}`).join('|'),
    context.relatedTerms.map((item) => `${item.id}:${item.reviewStatus}`).join('|')
  ].join('::');
}

function redactContextSnippetsFromStoredReview<T>(value: T, context: EvidenceAiReviewContext): T {
  const snippets = [
    ...context.evidence.map((item) => item.snippet),
    ...context.candidates.map((item) => item.snippet),
    ...context.relatedTerms.map((item) => item.snippet)
  ]
    .map((snippet) => snippet?.replace(/\s+/g, ' ').trim())
    .filter((snippet): snippet is string => Boolean(snippet && snippet.length >= 24));

  return visitReviewValue(value, (entry) => {
    if (typeof entry !== 'string') return entry;
    return snippets.reduce(
      (current, snippet) => current.replaceAll(snippet, '[source reference redacted]'),
      entry
    );
  }) as T;
}

function visitReviewValue(value: unknown, visitor: (value: unknown) => unknown): unknown {
  const visited = visitor(value);
  if (visited !== value) return visited;

  if (Array.isArray(value)) {
    return value.map((item) => visitReviewValue(item, visitor));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visitReviewValue(entry, visitor)]));
  }

  return value;
}
