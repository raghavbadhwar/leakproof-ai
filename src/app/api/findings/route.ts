import { NextResponse } from 'next/server';
import { workspaceQuery } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = workspaceQuery(url.searchParams);
    await requireWorkspaceMember(request, query.organization_id, query.workspace_id);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('leakage_findings')
      .select('*')
      .eq('organization_id', query.organization_id)
      .eq('workspace_id', query.workspace_id)
      .eq('is_active', true)
      .order('estimated_amount_minor', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ findings: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
