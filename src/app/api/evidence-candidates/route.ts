import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workspaceQuery, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

const createCandidateSchema = z.object({
  organization_id: uuidSchema,
  workspace_id: uuidSchema,
  finding_id: uuidSchema,
  document_chunk_id: uuidSchema,
  retrieval_score: z.number().min(0).max(1),
  relevance_explanation: z.string().trim().max(1000).optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = workspaceQuery(url.searchParams);
    await requireWorkspaceMember(request, query.organization_id, query.workspace_id);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('evidence_candidates')
      .select('id, finding_id, document_chunk_id, retrieval_score, relevance_explanation, approval_state, attached_evidence_item_id, created_at, document_chunks(source_label, content)')
      .eq('organization_id', query.organization_id)
      .eq('workspace_id', query.workspace_id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      candidates: (data ?? []).map((row) => ({
        ...row,
        document_chunk: Array.isArray(row.document_chunks) ? row.document_chunks[0] : row.document_chunks
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
	    const body = createCandidateSchema.parse(await request.json());
	    const auth = await requireWorkspaceRole(request, body.organization_id, body.workspace_id, REVIEWER_WRITE_ROLES);
	    const supabase = createSupabaseServiceClient();
	    await assertFindingAndChunkBelongToWorkspace(supabase, body);

	    const { data, error } = await supabase
      .from('evidence_candidates')
      .insert({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        finding_id: body.finding_id,
        document_chunk_id: body.document_chunk_id,
        retrieval_score: body.retrieval_score,
        relevance_explanation: body.relevance_explanation
      })
      .select('id, finding_id, document_chunk_id, retrieval_score, relevance_explanation, approval_state, created_at')
      .single();
    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'evidence_candidate.attached',
      entityType: 'evidence_candidate',
      entityId: data.id,
      metadata: {
        finding_id: body.finding_id,
        document_chunk_id: body.document_chunk_id
      }
    });

    return NextResponse.json({ candidate: data });
  } catch (error) {
    return handleApiError(error);
	  }
	}

async function assertFindingAndChunkBelongToWorkspace(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: { organization_id: string; workspace_id: string; finding_id: string; document_chunk_id: string }
) {
  const [finding, chunk] = await Promise.all([
    supabase
      .from('leakage_findings')
      .select('id')
      .eq('id', input.finding_id)
      .eq('organization_id', input.organization_id)
      .eq('workspace_id', input.workspace_id)
      .maybeSingle(),
    supabase
      .from('document_chunks')
      .select('id')
      .eq('id', input.document_chunk_id)
      .eq('organization_id', input.organization_id)
      .eq('workspace_id', input.workspace_id)
      .maybeSingle()
  ]);

  if (finding.error || !finding.data || chunk.error || !chunk.data) {
    throw new Error('forbidden');
  }
}
