import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { organizationScopedBodySchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import {
  classifyFindingRootCause,
  fingerprintRootCauseInput,
  type RootCauseFindingContext
} from '@/lib/ai/rootCause';
import { generateGeminiJson } from '@/lib/ai/geminiClient';
import { aiTaskCompletedEvent } from '@/lib/audit/aiEvents';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { z } from 'zod';

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
  citation?: { label?: string; sourceType?: string } | null;
};

const findingParamsSchema = z.object({
  id: uuidSchema
});

export async function POST(request: Request, context: { params: Promise<unknown> }) {
  try {
    const { id: findingId } = findingParamsSchema.parse(await context.params);
    const body = organizationScopedBodySchema.parse(await request.json());
    const auth = await requireOrganizationMember(request, body.organization_id);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);

    await enforceRateLimit({
      key: `finding-root-cause:${auth.userId}:${body.organization_id}:${findingId}`,
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
      .select('id, evidence_type, citation')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', findingRow.workspace_id)
      .eq('finding_id', findingId)
      .eq('approval_state', 'approved')
      .not('reviewed_by', 'is', null)
      .not('reviewed_at', 'is', null)
      .order('created_at', { ascending: true });
    if (evidenceError) throw evidenceError;

    const rootCauseContext: RootCauseFindingContext = {
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
      approvedEvidence: ((evidenceRows ?? []) as EvidenceRow[]).map((item) => ({
        evidenceId: item.id,
        evidenceType: item.evidence_type,
        sourceType: item.citation?.sourceType,
        label: item.citation?.label,
        approvalState: 'approved'
      }))
    };

    let modelName: string | null = null;
    const classification = await classifyFindingRootCause(rootCauseContext, async ({ prompt, systemInstruction, promptVersion }) => {
      const result = await generateGeminiJson<unknown>({
        prompt,
        systemInstruction,
        promptVersion
      });
      modelName = result.provenance.model;
      return result.data;
    });
    const inputFingerprint = fingerprintRootCauseInput(rootCauseContext);

    const auditEvent = aiTaskCompletedEvent({
      organizationId: body.organization_id,
      workspaceId: findingRow.workspace_id,
      taskType: 'root_cause_classification',
      entityReferences: [{ type: 'finding', id: findingId, label: findingRow.title }],
      safeSummary: `Root cause classified as ${classification.rootCause.primaryRootCause}.`,
      modelName,
      safetyFlags: [
        'schema_validated',
        'human_approval_required',
        'code_calculates_money',
        'advisory_only',
        'no_external_action'
      ]
    });
    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      ...auditEvent,
      entityId: findingId
    });

    return NextResponse.json({
      ...classification.rootCause,
      classificationSource: classification.classificationSource,
      inputFingerprint,
      promptVersion: classification.promptVersion,
      model: modelName
    });
  } catch (error) {
    return handleApiError(error);
  }
}
