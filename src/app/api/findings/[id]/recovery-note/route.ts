import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { organizationScopedBodySchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { generateGeminiJson, type GeminiProvenance } from '@/lib/ai/geminiClient';
import {
  buildRecoveryNoteDraft,
  buildRecoveryNotePrompt,
  RECOVERY_NOTE_PROMPT_VERSION,
  recoveryNoteOutputSchema,
  recoveryNoteSystemInstruction,
  type RecoveryNoteContext,
  type RecoveryNoteOutput
} from '@/lib/ai/recoveryNoteSchema';
import { customerFacingFindingStatuses, isCustomerFacingFindingStatus, isInternalPipelineFindingStatus } from '@/lib/analytics/statuses';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { isEvidenceCandidateExportReady } from '@/lib/evidence/candidates';
import { exportBlockerForFinding, exportCitationForEvidenceRow } from '@/lib/evidence/exportReadiness';

export const runtime = 'nodejs';

const recoveryNoteRequestSchema = organizationScopedBodySchema.extend({
  include_customer_facing_draft: z.boolean().optional().default(true)
});

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
  calculation?: Record<string, unknown> | null;
  recommended_action?: string | null;
  customers?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type EvidenceRow = {
  id: string;
  finding_id: string;
  evidence_type: string;
  citation?: { label?: string; excerpt?: string; sourceType?: string } | null;
  excerpt?: string | null;
  approval_state?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

type EvidenceCandidateRow = {
  approval_state?: string | null;
  attached_evidence_item_id?: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const findingId = uuidSchema.parse(id);
    const body = recoveryNoteRequestSchema.parse(await request.json());
    const auth = await requireOrganizationMember(request, body.organization_id);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    await enforceRateLimit({
      key: `recovery-note:${auth.userId}:${body.organization_id}:${findingId}`,
      limit: 8,
      windowMs: 10 * 60 * 1000
    });
    const supabase = createSupabaseServiceClient();

    const { data: finding, error: findingError } = await supabase
      .from('leakage_findings')
      .select('id, workspace_id, finding_type, outcome_type, title, summary, estimated_amount_minor, currency, confidence, status, calculation, recommended_action, customers(name)')
      .eq('id', findingId)
      .eq('organization_id', body.organization_id)
      .eq('is_active', true)
      .single();
    if (findingError) throw findingError;
    const findingRow = finding as FindingRow;
    await assertWorkspaceBelongsToOrganization(body.organization_id, findingRow.workspace_id);

    const [{ data: evidenceRows, error: evidenceError }, { data: candidateRows, error: candidateError }] = await Promise.all([
      supabase
        .from('evidence_items')
        .select('id, finding_id, evidence_type, citation, excerpt, approval_state, reviewed_by, reviewed_at')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', findingRow.workspace_id)
        .eq('finding_id', findingId)
        .eq('approval_state', 'approved')
        .not('reviewed_by', 'is', null)
        .not('reviewed_at', 'is', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('evidence_candidates')
        .select('approval_state, attached_evidence_item_id')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', findingRow.workspace_id)
        .eq('finding_id', findingId)
    ]);
    if (evidenceError) throw evidenceError;
    if (candidateError) throw candidateError;

    const approvedEvidence = exportReadyEvidenceRows((evidenceRows ?? []) as EvidenceRow[], candidateRows ?? []);
    let includeCustomerFacingDraft = body.include_customer_facing_draft;
    const routeWarnings: string[] = [];

    if (includeCustomerFacingDraft && !isCustomerFacingFindingStatus(findingRow.status)) {
      if (isInternalPipelineFindingStatus(findingRow.status)) {
        includeCustomerFacingDraft = false;
        routeWarnings.push('Finding is still draft or needs review, so only an internal recovery note was drafted.');
      } else {
        throw new Error('invalid_status_transition');
      }
    }

    if (includeCustomerFacingDraft) {
      const blocker = exportBlockerForFinding({
        status: findingRow.status,
        outcomeType: findingRow.outcome_type,
        calculation: findingRow.calculation ?? {},
        evidenceCitations: approvedEvidence.map(exportCitationForEvidenceRow)
      });
      if (blocker) throw new Error(blocker);
    }

    const noteContext: RecoveryNoteContext = {
      finding: {
        id: findingRow.id,
        workspaceId: findingRow.workspace_id,
        type: findingRow.finding_type,
        outcomeType: findingRow.outcome_type,
        title: findingRow.title,
        summary: findingRow.summary,
        status: findingRow.status,
        estimatedAmountMinor: Number(findingRow.estimated_amount_minor),
        currency: findingRow.currency,
        confidence: Number(findingRow.confidence),
        calculation: findingRow.calculation ?? {},
        recommendedAction: findingRow.recommended_action
      },
      approvedEvidence: approvedEvidence.map((item) => ({
        id: item.id,
        evidenceType: item.evidence_type,
        sourceType: item.citation?.sourceType ?? sourceTypeFromEvidenceType(item.evidence_type),
        label: item.citation?.label ?? 'Approved evidence',
        excerpt: item.excerpt ?? item.citation?.excerpt
      })),
      includeCustomerFacingDraft,
      customerName: singleRelation(findingRow.customers)?.name ?? null
    };

    const { draft, provenance } = await generateRecoveryNote(noteContext, routeWarnings);
    const { draftId, persisted } = await maybePersistRecoveryNoteDraft(supabase, {
      organizationId: body.organization_id,
      workspaceId: findingRow.workspace_id,
      findingId,
      draft,
      authUserId: auth.userId,
      provenance
    });

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'finding.recovery_note_drafted',
      entityType: 'leakage_finding',
      entityId: findingId,
      metadata: {
        included_customer_facing_draft: includeCustomerFacingDraft,
        customer_facing_statuses: [...customerFacingFindingStatuses],
        persisted,
        prompt_version: provenance?.promptVersion ?? RECOVERY_NOTE_PROMPT_VERSION,
        model: provenance?.model ?? 'deterministic_fallback'
      }
    });

    return NextResponse.json({
      recovery_note: draft,
      draft_id: draftId,
      persisted,
      customer_facing_enabled: includeCustomerFacingDraft,
      external_actions: {
        email_sent: false,
        invoice_created: false,
        report_exported: false
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function generateRecoveryNote(
  context: RecoveryNoteContext,
  routeWarnings: string[]
): Promise<{ draft: RecoveryNoteOutput; provenance: GeminiProvenance | null }> {
  try {
    const result = await generateGeminiJson<unknown>({
      promptVersion: RECOVERY_NOTE_PROMPT_VERSION,
      systemInstruction: recoveryNoteSystemInstruction(),
      prompt: buildRecoveryNotePrompt(context)
    });
    const draft = buildRecoveryNoteDraft(context, result.data);
    return {
      draft: withWarnings(draft, routeWarnings),
      provenance: result.provenance
    };
  } catch {
    const draft = buildRecoveryNoteDraft(context);
    return {
      draft: withWarnings(draft, [
        'Gemini was unavailable or returned invalid recovery-note output, so a deterministic safe draft was used.',
        ...routeWarnings
      ]),
      provenance: null
    };
  }
}

function withWarnings(draft: RecoveryNoteOutput, warnings: string[]): RecoveryNoteOutput {
  return recoveryNoteOutputSchema.parse({
    ...draft,
    warnings: Array.from(new Set([...warnings, ...draft.warnings])).slice(0, 12)
  });
}

function exportReadyEvidenceRows(evidenceRows: EvidenceRow[], candidateRows: unknown[]): EvidenceRow[] {
  const candidateEvidenceIds = new Set(
    candidateRows
      .filter(isEvidenceCandidateRow)
      .filter((candidate) => candidate.attached_evidence_item_id)
      .map((candidate) => candidate.attached_evidence_item_id as string)
  );
  const approvedCandidateEvidenceIds = new Set(
    candidateRows
      .filter(isEvidenceCandidateRow)
      .filter(isEvidenceCandidateExportReady)
      .map((candidate) => candidate.attached_evidence_item_id as string)
  );
  return evidenceRows.filter((item) => !candidateEvidenceIds.has(item.id) || approvedCandidateEvidenceIds.has(item.id));
}

async function maybePersistRecoveryNoteDraft(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    organizationId: string;
    workspaceId: string;
    findingId: string;
    draft: RecoveryNoteOutput;
    authUserId: string;
    provenance: GeminiProvenance | null;
  }
): Promise<{ draftId: string | null; persisted: boolean }> {
  const { data, error } = await supabase
    .from('recovery_note_drafts')
    .insert({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      finding_id: input.findingId,
      draft_json: input.draft,
      generated_by: input.authUserId,
      provider: input.provenance?.provider ?? 'deterministic',
      model: input.provenance?.model ?? 'deterministic_fallback',
      model_version: input.provenance?.modelVersion ?? null,
      prompt_version: input.provenance?.promptVersion ?? RECOVERY_NOTE_PROMPT_VERSION
    })
    .select('id')
    .single();

  if (!error) {
    return { draftId: typeof data?.id === 'string' ? data.id : null, persisted: true };
  }

  if (isMissingOptionalDraftTable(error)) {
    return { draftId: null, persisted: false };
  }

  throw error;
}

function isMissingOptionalDraftTable(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  return code === '42P01' || code === 'PGRST205' || /recovery_note_drafts|does not exist|schema cache/i.test(message);
}

function sourceTypeFromEvidenceType(evidenceType: string): string | undefined {
  if (evidenceType === 'contract_term') return 'contract';
  if (evidenceType === 'invoice_row') return 'invoice';
  if (evidenceType === 'usage_row') return 'usage';
  if (evidenceType === 'calculation') return 'calculation';
  return undefined;
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEvidenceCandidateRow(value: unknown): value is EvidenceCandidateRow {
  return isRecord(value);
}
