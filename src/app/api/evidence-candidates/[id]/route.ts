import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { citationForEvidenceCandidate, evidenceTypeForSourceDocument } from '@/lib/evidence/candidates';

export const runtime = 'nodejs';

const updateCandidateSchema = z.object({
  organization_id: uuidSchema,
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const candidateId = uuidSchema.parse(id);
    const body = updateCandidateSchema.parse(await request.json());
    const supabase = createSupabaseServiceClient();
    const candidate = await getCandidate(supabase, body.organization_id, candidateId);
    const auth = await requireWorkspaceRole(request, body.organization_id, candidate.workspace_id, REVIEWER_WRITE_ROLES);
    const reviewedAt = new Date().toISOString();
    const approvalState = body.action === 'approve' ? 'approved' : 'rejected';
    const evidenceItemId =
      body.action === 'approve'
        ? candidate.attached_evidence_item_id ?? (await createApprovedEvidenceItem(supabase, body.organization_id, candidate, auth.userId, reviewedAt))
        : candidate.attached_evidence_item_id;

    const { data, error } = await supabase
      .from('evidence_candidates')
      .update({
        approval_state: approvalState,
        attached_evidence_item_id: evidenceItemId,
        reviewed_by: auth.userId,
        review_note: body.note,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt
      })
      .eq('id', candidateId)
      .eq('organization_id', body.organization_id)
      .select('id, finding_id, approval_state, attached_evidence_item_id')
      .single();
    if (error) throw error;

	    if (body.action === 'reject' && evidenceItemId) {
	      const { error: evidenceError } = await supabase
	        .from('evidence_items')
	        .update({ approval_state: 'rejected', reviewed_by: auth.userId, reviewed_at: reviewedAt })
	        .eq('id', evidenceItemId)
	        .eq('organization_id', body.organization_id);
	      if (evidenceError) throw evidenceError;
	    }

	    if (body.action === 'approve') {
	      const { error: findingError } = await supabase
	        .from('leakage_findings')
	        .update({ evidence_coverage_status: 'complete', updated_at: reviewedAt })
	        .eq('id', candidate.finding_id)
	        .eq('organization_id', body.organization_id)
	        .eq('workspace_id', candidate.workspace_id);
	      if (findingError) throw findingError;
	    }

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: body.action === 'approve' ? 'evidence_candidate.approved' : 'evidence_candidate.rejected',
      entityType: 'evidence_candidate',
      entityId: candidateId,
      metadata: {
        finding_id: candidate.finding_id,
        has_note: Boolean(body.note)
      }
    });

    return NextResponse.json({ candidate: data });
  } catch (error) {
    return handleApiError(error);
  }
}

async function createApprovedEvidenceItem(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  candidate: CandidateWithChunk,
  reviewerUserId: string,
  reviewedAt: string
): Promise<string> {
  const { data, error } = await supabase
    .from('evidence_items')
	    .insert({
	      organization_id: organizationId,
	      workspace_id: candidate.workspace_id,
	      finding_id: candidate.finding_id,
	      document_chunk_id: candidate.document_chunk_id,
	      evidence_type: evidenceTypeForSourceDocument(documentTypeForCandidate(candidate)),
	      citation: citationForEvidenceCandidate({
	        documentType: documentTypeForCandidate(candidate),
	        chunkId: candidate.document_chunk_id,
	        sourceLabel: candidate.document_chunks?.source_label ?? 'Evidence candidate',
	        content: candidate.document_chunks?.content ?? ''
	      }),
	      excerpt: candidate.document_chunks?.content?.slice(0, 1200),
      relevance_explanation: candidate.relevance_explanation,
      retrieval_score: candidate.retrieval_score,
      approval_state: 'approved',
      reviewed_by: reviewerUserId,
      reviewed_at: reviewedAt
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

type CandidateWithChunk = {
  id: string;
  workspace_id: string;
  finding_id: string;
  document_chunk_id: string;
  retrieval_score: number;
  relevance_explanation: string | null;
  attached_evidence_item_id: string | null;
	  document_chunks?: {
	    source_label?: string;
	    content?: string;
	    source_documents?: { document_type?: string } | Array<{ document_type?: string }>;
	  };
};

async function getCandidate(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  candidateId: string
): Promise<CandidateWithChunk> {
  const { data, error } = await supabase
    .from('evidence_candidates')
	    .select('id, workspace_id, finding_id, document_chunk_id, retrieval_score, relevance_explanation, attached_evidence_item_id, document_chunks(source_label, content, source_documents(document_type))')
    .eq('id', candidateId)
    .eq('organization_id', organizationId)
    .single();
  if (error) throw error;
	  return data as CandidateWithChunk;
	}

function documentTypeForCandidate(candidate: CandidateWithChunk): string {
  const relation = candidate.document_chunks?.source_documents;
  if (Array.isArray(relation)) return relation[0]?.document_type ?? 'other';
  return relation?.document_type ?? 'other';
}
