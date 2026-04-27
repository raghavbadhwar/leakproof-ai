import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { uuidSchema, workspaceScopedBodySchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFinding } from '@/lib/analytics/workspaceAnalytics';
import { customerFacingFindingStatuses } from '@/lib/analytics/statuses';
import {
  buildCfoSummaryDraft,
  buildCfoSummaryPrompt,
  CFO_SUMMARY_PROMPT_VERSION,
  cfoSummaryOutputSchema,
  cfoSummarySystemInstruction,
  type CfoSummaryContext,
  type CfoSummaryOutput
} from '@/lib/ai/cfoSummarySchema';
import { generateGeminiJson, type GeminiProvenance } from '@/lib/ai/geminiClient';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { isEvidenceCandidateExportReady } from '@/lib/evidence/candidates';
import { exportCitationForEvidenceRow } from '@/lib/evidence/exportReadiness';
import { generateExecutiveAuditReport, type ReportCitation, type ReportFinding } from '@/lib/evidence/report';

export const runtime = 'nodejs';

type FindingRow = {
  id: string;
  customer_id?: string | null;
  finding_type: string;
  outcome_type: string;
  severity?: string | null;
  title: string;
  estimated_amount_minor: number;
  currency: string;
  confidence: number;
  status: string;
  evidence_coverage_status?: string | null;
  recommended_action?: string | null;
  calculation?: Record<string, unknown> | null;
  reviewer_user_id?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  customers?: {
    name?: string | null;
    segment?: string | null;
    billing_model?: string | null;
    contract_type?: string | null;
    renewal_date?: string | null;
  } | Array<{
    name?: string | null;
    segment?: string | null;
    billing_model?: string | null;
    contract_type?: string | null;
    renewal_date?: string | null;
  }> | null;
};

type EvidenceRow = {
  id: string;
  finding_id: string;
  evidence_type?: string | null;
  citation?: { label?: string; excerpt?: string; sourceType?: string } | null;
  excerpt?: string | null;
  approval_state?: string | null;
};

type EvidenceCandidateRow = {
  approval_state?: string | null;
  attached_evidence_item_id?: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId: rawWorkspaceId } = await context.params;
    const workspaceId = uuidSchema.parse(rawWorkspaceId);
    const body = workspaceScopedBodySchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, workspaceId, REVIEWER_WRITE_ROLES);
    await enforceRateLimit({
      key: `cfo-summary:${auth.userId}:${body.organization_id}:${workspaceId}`,
      limit: 8,
      windowMs: 10 * 60 * 1000
    });
    const supabase = createSupabaseServiceClient();

    const [{ data: organization, error: organizationError }, { data: workspace, error: workspaceError }, { data: findingRows, error: findingsError }] =
      await Promise.all([
        supabase.from('organizations').select('name').eq('id', body.organization_id).single(),
        supabase.from('audit_workspaces').select('id, name').eq('id', workspaceId).eq('organization_id', body.organization_id).single(),
        supabase
          .from('leakage_findings')
          .select(
            'id, customer_id, finding_type, outcome_type, severity, title, estimated_amount_minor, currency, confidence, status, evidence_coverage_status, recommended_action, calculation, reviewer_user_id, reviewed_at, created_at, updated_at, customers(name, segment, billing_model, contract_type, renewal_date)'
          )
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
      ]);
    if (organizationError) throw organizationError;
    if (workspaceError) throw workspaceError;
    if (findingsError) throw findingsError;

    const findings = (findingRows ?? []) as FindingRow[];
    const findingIds = findings.map((finding) => finding.id);
    const safeFindingIds = findingIds.length > 0 ? findingIds : ['00000000-0000-0000-0000-000000000000'];
    const [{ data: evidenceRows, error: evidenceError }, { data: candidateRows, error: candidatesError }] = await Promise.all([
      supabase
        .from('evidence_items')
        .select('id, finding_id, evidence_type, citation, excerpt, approval_state, reviewed_by, reviewed_at')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', workspaceId)
        .eq('approval_state', 'approved')
        .not('reviewed_by', 'is', null)
        .not('reviewed_at', 'is', null)
        .in('finding_id', safeFindingIds),
      supabase
        .from('evidence_candidates')
        .select('approval_state, attached_evidence_item_id')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', workspaceId)
        .in('finding_id', safeFindingIds)
    ]);
    if (evidenceError) throw evidenceError;
    if (candidatesError) throw candidatesError;

    const evidenceByFinding = evidenceMap((evidenceRows ?? []) as EvidenceRow[], candidateRows ?? []);
    const reportFindings = findings.map((finding): ReportFinding => {
      const customer = singleRelation(finding.customers);
      return {
        id: finding.id,
        title: finding.title,
        findingType: finding.finding_type,
        outcomeType: finding.outcome_type as ReportFinding['outcomeType'],
        status: finding.status as ReportFinding['status'],
        amountMinor: Number(finding.estimated_amount_minor),
        currency: finding.currency,
        confidence: Number(finding.confidence),
        customerName: customer?.name ?? undefined,
        recommendedAction: finding.recommended_action ?? undefined,
        calculation: finding.calculation ?? {},
        reviewerUserId: finding.reviewer_user_id,
        reviewedAt: finding.reviewed_at,
        evidenceCitations: evidenceByFinding.get(finding.id) ?? []
      };
    });
    const report = generateExecutiveAuditReport({
      organizationName: organization.name,
      workspaceName: workspace.name,
      workspaceId,
      generatedBy: auth.userId,
      findings: reportFindings
    });
    const analytics = buildWorkspaceAnalytics({
      findings: findings.map(toAnalyticsFinding)
    });
    const summaryContext: CfoSummaryContext = {
      organizationName: organization.name,
      workspace: {
        id: workspace.id,
        name: workspace.name
      },
      currency: report.currency,
      report,
      internalPipeline: {
        unapprovedExposureMinor: analytics.internalPipeline.unapprovedExposureMinor,
        findingCount: analytics.internalPipeline.findingCount,
        needsReviewCount: analytics.internalPipeline.needsReviewCount,
        topUnapproved: analytics.internalPipeline.topUnapproved
      },
      closedReview: closedReviewSummary(findings),
      riskOnly: {
        count: report.totalRiskOnlyItems
      }
    };

    const { summary, provenance } = await generateCfoSummary(summaryContext);

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'workspace.cfo_summary_drafted',
      entityType: 'audit_workspace',
      entityId: workspaceId,
      metadata: {
        prompt_version: provenance?.promptVersion ?? CFO_SUMMARY_PROMPT_VERSION,
        model: provenance?.model ?? 'deterministic_fallback',
        included_finding_count: report.includedFindingCount,
        customer_facing_statuses: [...customerFacingFindingStatuses],
        exportable: report.exportability.exportable
      }
    });

    return NextResponse.json({
      cfo_summary: summary,
      report_readiness: report.exportability,
      external_actions: {
        email_sent: false,
        invoice_created: false,
        report_exported: false
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function generateCfoSummary(
  context: CfoSummaryContext
): Promise<{ summary: CfoSummaryOutput; provenance: GeminiProvenance | null }> {
  try {
    const result = await generateGeminiJson<unknown>({
      promptVersion: CFO_SUMMARY_PROMPT_VERSION,
      systemInstruction: cfoSummarySystemInstruction(),
      prompt: buildCfoSummaryPrompt(context)
    });
    return {
      summary: buildCfoSummaryDraft(context, result.data),
      provenance: result.provenance
    };
  } catch {
    const summary = buildCfoSummaryDraft(context);
    return {
      summary: cfoSummaryOutputSchema.parse({
        ...summary,
        caveats: Array.from(new Set([
          'Gemini was unavailable or returned invalid CFO-summary output, so a deterministic safe summary was used.',
          ...summary.caveats
        ])).slice(0, 12)
      }),
      provenance: null
    };
  }
}

function evidenceMap(evidenceRows: EvidenceRow[], candidateRows: unknown[]): Map<string, ReportCitation[]> {
  const candidateEvidenceIds = new Set(
    candidateRows
      .filter(isEvidenceCandidateRow)
      .filter((candidate) => candidate.attached_evidence_item_id)
      .map((candidate) => candidate.attached_evidence_item_id as string)
  );
  const approvedCandidateEvidenceIds = new Set(
    candidateRows
      .filter(isEvidenceCandidateRow)
      .filter(isEvidenceCandidateExportReady)
      .map((candidate) => candidate.attached_evidence_item_id as string)
  );
  const evidenceByFinding = new Map<string, ReportCitation[]>();
  for (const row of evidenceRows) {
    if (candidateEvidenceIds.has(row.id) && !approvedCandidateEvidenceIds.has(row.id)) continue;
    const exportCitation = exportCitationForEvidenceRow(row);
    const next = evidenceByFinding.get(row.finding_id) ?? [];
    next.push({
      label: row.citation?.label ?? 'Approved evidence',
      excerpt: row.excerpt ?? row.citation?.excerpt,
      sourceType: exportCitation.sourceType ?? undefined,
      approvalState: exportCitation.approvalState as ReportCitation['approvalState']
    });
    evidenceByFinding.set(row.finding_id, next);
  }
  return evidenceByFinding;
}

function toAnalyticsFinding(row: FindingRow): WorkspaceAnalyticsFinding {
  const customer = singleRelation(row.customers);
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
}

function closedReviewSummary(findings: FindingRow[]): CfoSummaryContext['closedReview'] {
  const dismissed = findings.filter((finding) => finding.status === 'dismissed');
  const notRecoverable = findings.filter((finding) => finding.status === 'not_recoverable');
  return {
    dismissedCount: dismissed.length,
    notRecoverableCount: notRecoverable.length
  };
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEvidenceCandidateRow(value: unknown): value is EvidenceCandidateRow {
  return isRecord(value);
}
