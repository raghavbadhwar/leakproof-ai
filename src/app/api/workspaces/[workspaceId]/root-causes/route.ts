import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { filterByAnalyticsPeriod, parseAnalyticsDateFilter } from '@/lib/analytics/period';
import { buildRootCauseAnalytics, type RootCauseAnalyticsFinding } from '@/lib/analytics/rootCauseAnalytics';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { z } from 'zod';

export const runtime = 'nodejs';

const workspaceParamsSchema = z.object({
  workspaceId: uuidSchema
});

export async function GET(request: Request, context: { params: Promise<unknown> }) {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(await context.params);
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    const periodStart = parseAnalyticsDateFilter(url.searchParams.get('period_start'));
    const periodEnd = parseAnalyticsDateFilter(url.searchParams.get('period_end'));
    await requireWorkspaceMember(request, organizationId, workspaceId);

    const supabase = createSupabaseServiceClient();
    const { data: findingRows, error: findingsError } = await supabase
      .from('leakage_findings')
      .select('id, finding_type, outcome_type, title, summary, estimated_amount_minor, currency, confidence, status, evidence_coverage_status, calculation, created_at, updated_at')
      .eq('organization_id', organizationId)
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);
    if (findingsError) throw findingsError;

    const findings = filterByAnalyticsPeriod(
      (findingRows ?? []).map((row): RootCauseAnalyticsFinding & { updatedAt?: string | null; createdAt?: string | null } => ({
        id: row.id,
        title: row.title,
        findingType: row.finding_type,
        outcomeType: row.outcome_type,
        status: row.status,
        amountMinor: Number(row.estimated_amount_minor),
        currency: row.currency,
        confidence: Number(row.confidence),
        summary: row.summary,
        evidenceCoverageStatus: row.evidence_coverage_status,
        calculation: (row.calculation as Record<string, unknown>) ?? {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      { periodStart, periodEnd },
      (finding) => finding.updatedAt ?? finding.createdAt
    );

    return NextResponse.json({
      rootCauses: buildRootCauseAnalytics({ findings })
    });
  } catch (error) {
    return handleApiError(error);
  }
}
