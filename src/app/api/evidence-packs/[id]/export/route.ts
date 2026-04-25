import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

const exportReportSchema = z.object({
  organization_id: uuidSchema,
  format: z.enum(['print_pdf', 'json', 'clipboard'])
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const evidencePackId = uuidSchema.parse(id);
    const body = exportReportSchema.parse(await request.json());
    const supabase = createSupabaseServiceClient();

    const { data: pack, error: packError } = await supabase
      .from('evidence_packs')
      .select('id, workspace_id, selected_finding_ids')
      .eq('id', evidencePackId)
      .eq('organization_id', body.organization_id)
      .single();
    if (packError) throw packError;
    const auth = await requireWorkspaceRole(request, body.organization_id, pack.workspace_id, REVIEWER_WRITE_ROLES);

    const { error } = await supabase
      .from('evidence_packs')
      .update({ status: 'exported', updated_at: new Date().toISOString() })
      .eq('id', evidencePackId)
      .eq('organization_id', body.organization_id);
    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'report.exported',
      entityType: 'evidence_pack',
      entityId: evidencePackId,
      metadata: {
        format: body.format,
        finding_count: Array.isArray(pack.selected_finding_ids) ? pack.selected_finding_ids.length : 0
      }
    });

    return NextResponse.json({ status: 'exported' });
  } catch (error) {
    return handleApiError(error);
  }
}
