import { NextResponse } from 'next/server';
import { updateTermSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = updateTermSchema.parse(await request.json());
    const auth = await requireOrganizationMember(request, body.organization_id);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data: currentTerm, error: currentTermError } = await supabase
      .from('contract_terms')
      .select('workspace_id')
      .eq('id', id)
      .eq('organization_id', body.organization_id)
      .eq('is_active', true)
      .single();
    if (currentTermError) throw currentTermError;
    await assertWorkspaceBelongsToOrganization(body.organization_id, currentTerm.workspace_id);

    const update: Record<string, unknown> = {
      review_status: body.review_status,
      reviewer_user_id: auth.userId,
      reviewer_note: body.reviewer_note,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (body.term_value !== undefined) {
      update.term_value = body.term_value;
      update.review_status = body.review_status === 'approved' ? 'edited' : body.review_status;
    }

    const { data, error } = await supabase
      .from('contract_terms')
      .update(update)
      .eq('id', id)
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', currentTerm.workspace_id)
      .eq('is_active', true)
      .select('*')
      .single();

    if (error) throw error;
    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: termAuditEvent(String(update.review_status)),
      entityType: 'contract_term',
      entityId: id,
      metadata: {
        review_status: update.review_status,
        has_note: Boolean(body.reviewer_note),
        edited_value: body.term_value !== undefined
      }
    });

    return NextResponse.json({ term: data });
  } catch (error) {
    return handleApiError(error);
  }
}

function termAuditEvent(status: string): 'term.approved' | 'term.edited' | 'term.rejected' | 'term.needs_review' {
  if (status === 'edited') return 'term.edited';
  if (status === 'rejected') return 'term.rejected';
  if (status === 'needs_review') return 'term.needs_review';
  return 'term.approved';
}
