import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    await requireOrganizationMember(request, organizationId);
    const supabase = createSupabaseServiceClient();

    const { data: finding, error: findingError } = await supabase
      .from('leakage_findings')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (findingError) throw findingError;
    await assertWorkspaceBelongsToOrganization(organizationId, finding.workspace_id);

    const [{ data: evidence, error: evidenceError }, { data: candidates, error: candidatesError }, { data: statusHistory, error: historyError }] =
      await Promise.all([
        supabase
          .from('evidence_items')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('workspace_id', finding.workspace_id)
          .eq('finding_id', id)
          .eq('approval_state', 'approved')
          .order('created_at', { ascending: true }),
        supabase
          .from('evidence_candidates')
          .select('id, retrieval_score, relevance_explanation, approval_state, attached_evidence_item_id, review_note, created_at, document_chunks(source_label, source_locator, content, source_documents(file_name))')
          .eq('organization_id', organizationId)
          .eq('workspace_id', finding.workspace_id)
          .eq('finding_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('audit_events')
          .select('event_type, metadata, created_at')
          .eq('organization_id', organizationId)
          .eq('entity_id', id)
          .order('created_at', { ascending: true })
      ]);

    if (evidenceError) throw evidenceError;
    if (candidatesError) throw candidatesError;
    if (historyError) throw historyError;

    return NextResponse.json({ finding, evidence: evidence ?? [], candidates: candidates ?? [], status_history: statusHistory ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
