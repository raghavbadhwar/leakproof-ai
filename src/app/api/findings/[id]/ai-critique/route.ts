import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { organizationScopedBodySchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { generateGeminiJson } from '@/lib/ai/geminiClient';
import {
  applyFindingCritiqueGuardrails,
  buildFindingCritiquePrompt,
  FINDING_AI_CRITIQUE_PROMPT_VERSION,
  findingCritiqueSystemInstruction,
  fingerprintFindingCritiqueInput,
  normalizeEvidenceSnippet,
  parseFindingCritiqueOutput,
  type FindingCritiqueContext
} from '@/lib/ai/findingCritique';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

type FindingRow = {
  id: string;
  workspace_id: string;
  finding_type: string;
  outcome_type: string;
  title: string;
  summary: string;
  estimated_amount_minor: number;
  currency: string;
  confidence: number;
  status: string;
  evidence_coverage_status?: string | null;
  calculation?: Record<string, unknown> | null;
};

type EvidenceRow = {
  id: string;
  evidence_type: string;
  citation?: { label?: string; excerpt?: string; sourceType?: string } | null;
  excerpt?: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const findingId = uuidSchema.parse(id);
    const body = organizationScopedBodySchema.parse(await request.json());
    const auth = await requireOrganizationMember(request, body.organization_id);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    await enforceRateLimit({
      key: `finding-ai-critique:${auth.userId}:${body.organization_id}:${findingId}`,
      limit: 8,
      windowMs: 10 * 60 * 1000
    });
    const supabase = createSupabaseServiceClient();

    const { data: finding, error: findingError } = await supabase
      .from('leakage_findings')
      .select('id, workspace_id, finding_type, outcome_type, title, summary, estimated_amount_minor, currency, confidence, status, evidence_coverage_status, calculation')
      .eq('id', findingId)
      .eq('organization_id', body.organization_id)
      .eq('is_active', true)
      .single();
    if (findingError) throw findingError;
    const findingRow = finding as FindingRow;
    await assertWorkspaceBelongsToOrganization(body.organization_id, findingRow.workspace_id);

    const { data: evidenceRows, error: evidenceError } = await supabase
      .from('evidence_items')
      .select('id, evidence_type, citation, excerpt')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', findingRow.workspace_id)
      .eq('finding_id', findingId)
      .eq('approval_state', 'approved')
      .not('reviewed_by', 'is', null)
      .not('reviewed_at', 'is', null)
      .order('created_at', { ascending: true });
    if (evidenceError) throw evidenceError;

    const evidence = (evidenceRows ?? []) as EvidenceRow[];
    const critiqueContext: FindingCritiqueContext = {
      finding: {
        id: findingRow.id,
        type: findingRow.finding_type,
        outcomeType: findingRow.outcome_type,
        title: findingRow.title,
        summary: findingRow.summary,
        status: findingRow.status,
        estimatedAmountMinor: findingRow.estimated_amount_minor,
        currency: findingRow.currency,
        confidence: Number(findingRow.confidence),
        evidenceCoverageStatus: findingRow.evidence_coverage_status,
        calculation: findingRow.calculation ?? {}
      },
      citations: evidence.map((item) => item.citation ?? {}),
      approvedEvidence: evidence.map((item) =>
        normalizeEvidenceSnippet({
          evidenceId: item.id,
          evidenceType: item.evidence_type,
          citation: item.citation,
          excerpt: item.excerpt
        })
      )
    };

    const geminiResult = await generateGeminiJson<unknown>({
      promptVersion: FINDING_AI_CRITIQUE_PROMPT_VERSION,
      systemInstruction: findingCritiqueSystemInstruction(),
      prompt: buildFindingCritiquePrompt(critiqueContext)
    });
    const critique = applyFindingCritiqueGuardrails(parseFindingCritiqueOutput(geminiResult.data), critiqueContext);
    const inputFingerprint = fingerprintFindingCritiqueInput(critiqueContext);

    const { data: insertedCritique, error: insertError } = await supabase
      .from('finding_ai_critiques')
      .insert({
        organization_id: body.organization_id,
        workspace_id: findingRow.workspace_id,
        finding_id: findingId,
        recommendation_status: critique.recommendation,
        evidence_score: critique.evidenceQuality.score,
        critique_json: critique,
        input_fingerprint: inputFingerprint,
        provider: geminiResult.provenance.provider,
        model: geminiResult.provenance.model,
        model_version: geminiResult.provenance.modelVersion,
        prompt_version: geminiResult.provenance.promptVersion,
        generated_by: auth.userId
      })
      .select('*')
      .single();
    if (insertError) throw insertError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'finding.ai_critique_generated',
      entityType: 'finding_ai_critique',
      entityId: insertedCritique.id,
      metadata: {
        finding_id: findingId,
        recommendation_status: critique.recommendation,
        evidence_score: critique.evidenceQuality.score,
        prompt_version: geminiResult.provenance.promptVersion,
        model: geminiResult.provenance.model
      }
    });

    return NextResponse.json({ critique: insertedCritique });
  } catch (error) {
    return handleApiError(error);
  }
}
