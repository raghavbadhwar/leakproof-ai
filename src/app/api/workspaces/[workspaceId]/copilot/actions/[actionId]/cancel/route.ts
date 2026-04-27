import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { actionCardFromRecord, cancelPendingCopilotAction, loadAssistantAction } from '@/lib/copilot/actions';
import { copilotActionTransitionRequestSchema } from '@/lib/copilot/schema';
import type { CopilotSupabaseClient } from '@/lib/copilot/context';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; actionId: string }> }
) {
  try {
    const { workspaceId, actionId } = await context.params;
    const body = copilotActionTransitionRequestSchema.parse(await request.json());
    const auth = await requireWorkspaceMember(request, body.organization_id, workspaceId);
    const serviceClient = createSupabaseServiceClient();
    const supabase = serviceClient as unknown as CopilotSupabaseClient;
    const action = await loadAssistantAction(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      actionId
    });
    const cancelled = await cancelPendingCopilotAction(supabase, {
      action,
      actorUserId: auth.userId,
      actorRole: auth.role
    });

    await writeAuditEvent(serviceClient, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'copilot.action_cancelled',
      entityType: 'assistant_action',
      entityId: cancelled.id,
      metadata: {
        action_type: cancelled.action_type,
        risk_level: cancelled.risk_level,
        required_role: cancelled.required_role,
        execution_deferred: true
      }
    });

    return NextResponse.json({
      action: actionCardFromRecord(cancelled),
      message: 'Action cancelled.'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
