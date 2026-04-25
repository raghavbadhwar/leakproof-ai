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
      .from('invoice_records')
      .select('id, invoice_id, invoice_date, line_item, quantity, unit_price_minor, amount_minor, currency, row_citation, customers(name)')
      .eq('organization_id', query.organization_id)
      .eq('workspace_id', query.workspace_id)
      .order('invoice_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ records: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
