import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    const auth = await requireOrganizationMember(request, organizationId);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data: finding, error: findingError } = await supabase
      .from('leakage_findings')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    if (findingError) throw findingError;
    await assertWorkspaceBelongsToOrganization(organizationId, finding.workspace_id);

    if (!['approved', 'customer_ready', 'recovered'].includes(finding.status)) {
      throw new Error('invalid_status_transition');
    }

    const { data: evidence, error: evidenceError } = await supabase
      .from('evidence_items')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('workspace_id', finding.workspace_id)
      .eq('finding_id', id)
      .order('created_at', { ascending: true });
    if (evidenceError) throw evidenceError;

    await writeAuditEvent(supabase, {
      organizationId,
      actorUserId: auth.userId,
      eventType: 'finding.exported',
      entityType: 'leakage_finding',
      entityId: id,
      metadata: {
        format: 'html'
      }
    });

    return NextResponse.json({ finding, evidence: evidence ?? [], export_status: 'ready' });
  } catch (error) {
    return handleApiError(error);
  }
}
