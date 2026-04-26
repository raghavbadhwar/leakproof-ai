import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFinding } from '@/lib/analytics/workspaceAnalytics';
import { filterByAnalyticsPeriod, parseAnalyticsDateFilter } from '@/lib/analytics/period';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    const periodStart = parseAnalyticsDateFilter(url.searchParams.get('period_start'));
    const periodEnd = parseAnalyticsDateFilter(url.searchParams.get('period_end'));
    const periodFilter = { periodStart, periodEnd };
    await requireWorkspaceMember(request, organizationId, workspaceId);
    const supabase = createSupabaseServiceClient();

    const [
      { data: findingRows, error: findingsError },
      { data: documentRows, error: documentsError },
      { data: termRows, error: termsError },
      { data: usageRows, error: usageError },
      { data: eventRows, error: eventsError }
    ] = await Promise.all([
      supabase
        .from('leakage_findings')
        .select(
          'id, customer_id, finding_type, outcome_type, severity, title, estimated_amount_minor, currency, confidence, status, evidence_coverage_status, reviewer_user_id, reviewed_at, created_at, updated_at, customers(id, name, segment, billing_model, contract_type, owner_label, renewal_date)'
        )
        .eq('organization_id', organizationId)
        .eq('workspace_id', workspaceId)
        .eq('is_active', true),
      supabase
        .from('source_documents')
        .select('id, document_type, parse_status, chunking_status, embedding_status')
        .eq('organization_id', organizationId)
        .eq('workspace_id', workspaceId),
      supabase
        .from('contract_terms')
        .select('id, term_type, review_status, confidence')
        .eq('organization_id', organizationId)
        .eq('workspace_id', workspaceId)
        .eq('is_active', true),
      supabase
        .from('usage_records')
        .select('id, metric_name, quantity, product_label, team_label, period_start, period_end, customers(name)')
        .eq('organization_id', organizationId)
        .eq('workspace_id', workspaceId),
      supabase
        .from('audit_events')
        .select('event_type, entity_id, created_at, metadata')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })
    ]);

    if (findingsError) throw findingsError;
    if (documentsError) throw documentsError;
    if (termsError) throw termsError;
    if (usageError) throw usageError;
    if (eventsError) throw eventsError;

    const findings = filterByAnalyticsPeriod(
      (findingRows ?? []).map((row): WorkspaceAnalyticsFinding => {
        const customer = singleRelation<{
          id?: string;
          name?: string;
          segment?: string | null;
          billing_model?: string | null;
          contract_type?: string | null;
          renewal_date?: string | null;
        }>(row.customers);

        return {
          id: row.id,
          title: row.title,
          findingType: row.finding_type,
          outcomeType: row.outcome_type,
          severity: row.severity,
          status: row.status,
          amountMinor: Number(row.estimated_amount_minor),
          currency: row.currency,
          confidence: Number(row.confidence),
          customerId: row.customer_id,
          customerName: customer?.name ?? null,
          customerSegment: customer?.segment ?? null,
          billingModel: customer?.billing_model ?? null,
          contractType: customer?.contract_type ?? null,
          customerRenewalDate: customer?.renewal_date ?? null,
          reviewerId: row.reviewer_user_id,
          reviewedAt: row.reviewed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          evidenceCoverageStatus: row.evidence_coverage_status
        };
      }),
      periodFilter,
      (finding) => finding.updatedAt ?? finding.createdAt
    );

    const usage = filterByAnalyticsPeriod(
      (usageRows ?? []).map((row) => {
        const customer = singleRelation<{ name?: string }>(row.customers);
        return {
          id: row.id,
          metricName: row.metric_name,
          quantity: Number(row.quantity),
          productLabel: row.product_label,
          teamLabel: row.team_label,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          customerName: customer?.name ?? null
        };
      }),
      periodFilter,
      (row) => row.periodEnd ?? row.periodStart
    );

    const analytics = buildWorkspaceAnalytics({
      findings,
      documents: (documentRows ?? []).map((row) => ({
        id: row.id,
        documentType: row.document_type,
        parseStatus: row.parse_status,
        chunkingStatus: row.chunking_status,
        embeddingStatus: row.embedding_status
      })),
      terms: (termRows ?? []).map((row) => ({
        id: row.id,
        termType: row.term_type,
        reviewStatus: row.review_status,
        confidence: Number(row.confidence)
      })),
      usage,
      auditEvents: (eventRows ?? []).map((row) => ({
        eventType: row.event_type,
        entityId: row.entity_id,
        createdAt: row.created_at,
        metadata: row.metadata as Record<string, unknown> | null
      }))
    });

    return NextResponse.json({ analytics });
  } catch (error) {
    return handleApiError(error);
  }
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
