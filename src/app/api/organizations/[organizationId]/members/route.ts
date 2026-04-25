import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { requireOrganizationMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await context.params;
    const parsedOrganizationId = uuidSchema.parse(organizationId);
    await requireOrganizationMember(request, parsedOrganizationId);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('organization_members')
      .select('id, user_id, role, created_at')
      .eq('organization_id', parsedOrganizationId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ members: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
