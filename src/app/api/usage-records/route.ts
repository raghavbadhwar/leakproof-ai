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
      .from('usage_records')
      .select('id, period_start, period_end, metric_name, quantity, row_citation, customers(name)')
      .eq('organization_id', query.organization_id)
      .eq('workspace_id', query.workspace_id)
      .order('period_end', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ records: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
