import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { loadCopilotContext, type CopilotSupabaseClient } from '@/lib/copilot/context';
import { buildAuditReadinessFromCopilotContext } from '@/lib/ai/auditReadiness';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));

    await requireWorkspaceMember(request, organizationId, workspaceId);

    const supabase = createSupabaseServiceClient();
    const dataContext = await loadCopilotContext(supabase as unknown as CopilotSupabaseClient, {
      organizationId,
      workspaceId
    });
    const readiness = buildAuditReadinessFromCopilotContext(dataContext);

    return NextResponse.json({ readiness });
  } catch (error) {
    return handleApiError(error);
  }
}
