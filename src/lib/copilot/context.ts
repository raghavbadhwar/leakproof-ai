import type { WorkspaceAnalyticsDocument, WorkspaceAnalyticsFinding, WorkspaceAnalyticsTerm, WorkspaceAnalyticsUsage } from '../analytics/workspaceAnalytics';

type QueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type QueryLike = PromiseLike<QueryResult<unknown>>;

type SupabaseQueryBuilder = QueryLike & {
  select(columns?: string): SupabaseQueryBuilder;
  insert(payload: unknown): SupabaseQueryBuilder;
  update(payload: unknown): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  neq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  not(column: string, operator: string, value: unknown): SupabaseQueryBuilder;
  is(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  single(): Promise<QueryResult<unknown>>;
  maybeSingle(): Promise<QueryResult<unknown>>;
};

export type CopilotSupabaseClient = {
  from(table: string): SupabaseQueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): Promise<QueryResult<unknown>>;
};

export type CopilotOrganization = {
  id: string;
  name: string;
};

export type CopilotWorkspace = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
};

export type CopilotSourceDocument = {
  id: string;
  organizationId: string;
  workspaceId: string;
  customerId: string | null;
  documentType: string;
  parseStatus: string | null;
  chunkingStatus: string | null;
  embeddingStatus: string | null;
};

export type CopilotContractTerm = {
  id: string;
  organizationId: string;
  workspaceId: string;
  customerId: string | null;
  sourceDocumentId: string;
  termType: string;
  confidence: number;
  reviewStatus: string;
};

export type CopilotFinding = {
  id: string;
  organizationId: string;
  workspaceId: string;
  customerId: string | null;
  findingType: string;
  outcomeType: 'recoverable_leakage' | 'prevented_future_leakage' | 'risk_alert' | string;
  severity: string | null;
  title: string;
  summary: string;
  amountMinor: number;
  currency: string;
  confidence: number;
  status: string;
  evidenceCoverageStatus: string | null;
  calculation: Record<string, unknown>;
  reviewerUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  customerSegment: string | null;
  billingModel: string | null;
  contractType: string | null;
  customerRenewalDate: string | null;
};

export type CopilotEvidenceItem = {
  id: string;
  organizationId: string;
  workspaceId: string;
  findingId: string;
  evidenceType: string;
  sourceId: string | null;
  documentChunkId: string | null;
  sourceType: string | null;
  approvalState: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type CopilotEvidenceCandidate = {
  id: string;
  organizationId: string;
  workspaceId: string;
  findingId: string | null;
  approvalState: string | null;
  attachedEvidenceItemId: string | null;
};

export type CopilotEvidencePack = {
  id: string;
  organizationId: string;
  workspaceId: string;
  status: string;
  selectedFindingIds: string[];
  createdAt: string | null;
};

export type CopilotInvoiceRecord = {
  id: string;
  organizationId: string;
  workspaceId: string;
  customerId: string | null;
  sourceDocumentId: string | null;
  amountMinor: number;
  currency: string;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
};

export type CopilotUsageRecord = {
  id: string;
  organizationId: string;
  workspaceId: string;
  customerId: string | null;
  sourceDocumentId: string | null;
  metricName: string;
  quantity: number;
  periodStart: string | null;
  periodEnd: string | null;
};

export type CopilotDataContext = {
  organization: CopilotOrganization;
  workspace: CopilotWorkspace;
  documents: CopilotSourceDocument[];
  terms: CopilotContractTerm[];
  findings: CopilotFinding[];
  evidenceItems: CopilotEvidenceItem[];
  evidenceCandidates: CopilotEvidenceCandidate[];
  evidencePacks: CopilotEvidencePack[];
  invoiceRecords: CopilotInvoiceRecord[];
  usageRecords: CopilotUsageRecord[];
};

type OrganizationRow = { id: string; name: string };
type WorkspaceRow = { id: string; organization_id: string; name: string; status: string };
type DocumentRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  customer_id: string | null;
  document_type: string;
  parse_status: string | null;
  chunking_status: string | null;
  embedding_status: string | null;
};
type TermRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  customer_id: string | null;
  source_document_id: string;
  term_type: string;
  confidence: number | string | null;
  review_status: string;
};
type CustomerRelation = {
  id?: string;
  segment?: string | null;
  billing_model?: string | null;
  contract_type?: string | null;
  renewal_date?: string | null;
};
type FindingRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  customer_id: string | null;
  finding_type: string;
  outcome_type: string;
  severity: string | null;
  title: string;
  summary: string;
  estimated_amount_minor: number | string | null;
  currency: string | null;
  confidence: number | string | null;
  status: string;
  evidence_coverage_status: string | null;
  calculation: unknown;
  reviewer_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  customers?: CustomerRelation | CustomerRelation[] | null;
};
type EvidenceItemRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  finding_id: string;
  evidence_type: string;
  source_id: string | null;
  document_chunk_id: string | null;
  citation: unknown;
  approval_state: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
type EvidenceCandidateRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  finding_id: string | null;
  approval_state: string | null;
  attached_evidence_item_id: string | null;
};
type EvidencePackRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  status: string;
  selected_finding_ids: string[] | null;
  created_at: string | null;
};
type InvoiceRecordRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  customer_id: string | null;
  source_document_id: string | null;
  amount_minor: number | string | null;
  currency: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
};
type UsageRecordRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  customer_id: string | null;
  source_document_id: string | null;
  metric_name: string | null;
  quantity: number | string | null;
  period_start: string | null;
  period_end: string | null;
};

export async function loadCopilotContext(
  supabase: CopilotSupabaseClient,
  input: { organizationId: string; workspaceId: string }
): Promise<CopilotDataContext> {
  const [
    organizationResult,
    workspaceResult,
    documents,
    terms,
    findings,
    evidenceItems,
    evidenceCandidates,
    evidencePacks,
    invoiceRecords,
    usageRecords
  ] = await Promise.all([
    querySingle<OrganizationRow>(
      supabase.from('organizations').select('id, name').eq('id', input.organizationId).single()
    ),
    querySingle<WorkspaceRow>(
      supabase
        .from('audit_workspaces')
        .select('id, organization_id, name, status')
        .eq('id', input.workspaceId)
        .eq('organization_id', input.organizationId)
        .single()
    ),
    queryArray<DocumentRow>(
      supabase
        .from('source_documents')
        .select('id, organization_id, workspace_id, customer_id, document_type, parse_status, chunking_status, embedding_status')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
    ),
    queryArray<TermRow>(
      supabase
        .from('contract_terms')
        .select('id, organization_id, workspace_id, customer_id, source_document_id, term_type, confidence, review_status')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
        .eq('is_active', true)
    ),
    queryArray<FindingRow>(
      supabase
        .from('leakage_findings')
        .select(
          'id, organization_id, workspace_id, customer_id, finding_type, outcome_type, severity, title, summary, estimated_amount_minor, currency, confidence, status, evidence_coverage_status, calculation, reviewer_user_id, reviewed_at, review_note, created_at, updated_at, customers(id, segment, billing_model, contract_type, renewal_date)'
        )
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
        .eq('is_active', true)
    ),
    queryArray<EvidenceItemRow>(
      supabase
        .from('evidence_items')
        .select('id, organization_id, workspace_id, finding_id, evidence_type, source_id, document_chunk_id, citation, approval_state, reviewed_by, reviewed_at')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
    ),
    queryArray<EvidenceCandidateRow>(
      supabase
        .from('evidence_candidates')
        .select('id, organization_id, workspace_id, finding_id, approval_state, attached_evidence_item_id')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
    ),
    queryArray<EvidencePackRow>(
      supabase
        .from('evidence_packs')
        .select('id, organization_id, workspace_id, status, selected_finding_ids, created_at')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
    ),
    queryArray<InvoiceRecordRow>(
      supabase
        .from('invoice_records')
        .select('id, organization_id, workspace_id, customer_id, source_document_id, amount_minor, currency, service_period_start, service_period_end')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
    ),
    queryArray<UsageRecordRow>(
      supabase
        .from('usage_records')
        .select('id, organization_id, workspace_id, customer_id, source_document_id, metric_name, quantity, period_start, period_end')
        .eq('organization_id', input.organizationId)
        .eq('workspace_id', input.workspaceId)
    )
  ]);

  return {
    organization: {
      id: organizationResult.id,
      name: organizationResult.name
    },
    workspace: {
      id: workspaceResult.id,
      organizationId: workspaceResult.organization_id,
      name: workspaceResult.name,
      status: workspaceResult.status
    },
    documents: documents.map(mapDocument),
    terms: terms.map(mapTerm),
    findings: findings.map(mapFinding),
    evidenceItems: evidenceItems.map(mapEvidenceItem),
    evidenceCandidates: evidenceCandidates.map(mapEvidenceCandidate),
    evidencePacks: evidencePacks.map(mapEvidencePack),
    invoiceRecords: invoiceRecords.map(mapInvoiceRecord),
    usageRecords: usageRecords.map(mapUsageRecord)
  };
}

export function toWorkspaceAnalyticsInput(context: CopilotDataContext): {
  findings: WorkspaceAnalyticsFinding[];
  documents: WorkspaceAnalyticsDocument[];
  terms: WorkspaceAnalyticsTerm[];
  usage: WorkspaceAnalyticsUsage[];
} {
  return {
    findings: context.findings.map((finding) => ({
      id: finding.id,
      title: safeFindingLabel(finding),
      findingType: finding.findingType,
      outcomeType: finding.outcomeType,
      severity: finding.severity,
      status: finding.status,
      amountMinor: finding.amountMinor,
      currency: finding.currency,
      confidence: finding.confidence,
      customerId: finding.customerId,
      customerName: safeCustomerLabel(finding.customerId),
      customerSegment: finding.customerSegment,
      billingModel: finding.billingModel,
      contractType: finding.contractType,
      customerRenewalDate: finding.customerRenewalDate,
      reviewerId: finding.reviewerUserId,
      reviewedAt: finding.reviewedAt,
      createdAt: finding.createdAt,
      updatedAt: finding.updatedAt,
      evidenceCoverageStatus: finding.evidenceCoverageStatus
    })),
    documents: context.documents.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      parseStatus: document.parseStatus,
      chunkingStatus: document.chunkingStatus,
      embeddingStatus: document.embeddingStatus
    })),
    terms: context.terms.map((term) => ({
      id: term.id,
      termType: term.termType,
      reviewStatus: term.reviewStatus,
      confidence: term.confidence
    })),
    usage: context.usageRecords.map((usage) => ({
      id: usage.id,
      metricName: usage.metricName,
      quantity: usage.quantity,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      customerName: safeCustomerLabel(usage.customerId)
    }))
  };
}

export function safeCustomerLabel(customerId: string | null | undefined): string | null {
  if (!customerId) return null;
  return `Customer ${customerId.slice(0, 8)}`;
}

export function safeFindingLabel(finding: Pick<CopilotFinding, 'findingType' | 'id'>): string {
  return `${finding.findingType.replaceAll('_', ' ')} (${finding.id.slice(0, 8)})`;
}

function mapDocument(row: DocumentRow): CopilotSourceDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    documentType: row.document_type,
    parseStatus: row.parse_status,
    chunkingStatus: row.chunking_status,
    embeddingStatus: row.embedding_status
  };
}

function mapTerm(row: TermRow): CopilotContractTerm {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    sourceDocumentId: row.source_document_id,
    termType: row.term_type,
    confidence: Number(row.confidence ?? 0),
    reviewStatus: row.review_status
  };
}

function mapFinding(row: FindingRow): CopilotFinding {
  const customer = singleRelation(row.customers);
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    findingType: row.finding_type,
    outcomeType: row.outcome_type,
    severity: row.severity,
    title: row.title,
    summary: row.summary,
    amountMinor: Number(row.estimated_amount_minor ?? 0),
    currency: row.currency ?? 'USD',
    confidence: Number(row.confidence ?? 0),
    status: row.status,
    evidenceCoverageStatus: row.evidence_coverage_status,
    calculation: isRecord(row.calculation) ? row.calculation : {},
    reviewerUserId: row.reviewer_user_id,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerSegment: customer?.segment ?? null,
    billingModel: customer?.billing_model ?? null,
    contractType: customer?.contract_type ?? null,
    customerRenewalDate: customer?.renewal_date ?? null
  };
}

function mapEvidenceItem(row: EvidenceItemRow): CopilotEvidenceItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    findingId: row.finding_id,
    evidenceType: row.evidence_type,
    sourceId: row.source_id,
    documentChunkId: row.document_chunk_id,
    sourceType: sourceTypeFromCitation(row.citation, row.evidence_type),
    approvalState: row.approval_state,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at
  };
}

function mapEvidenceCandidate(row: EvidenceCandidateRow): CopilotEvidenceCandidate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    findingId: row.finding_id,
    approvalState: row.approval_state,
    attachedEvidenceItemId: row.attached_evidence_item_id
  };
}

function mapEvidencePack(row: EvidencePackRow): CopilotEvidencePack {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    status: row.status,
    selectedFindingIds: row.selected_finding_ids ?? [],
    createdAt: row.created_at
  };
}

function mapInvoiceRecord(row: InvoiceRecordRow): CopilotInvoiceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    sourceDocumentId: row.source_document_id,
    amountMinor: Number(row.amount_minor ?? 0),
    currency: row.currency ?? 'USD',
    servicePeriodStart: row.service_period_start,
    servicePeriodEnd: row.service_period_end
  };
}

function mapUsageRecord(row: UsageRecordRow): CopilotUsageRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    customerId: row.customer_id,
    sourceDocumentId: row.source_document_id,
    metricName: row.metric_name ?? 'usage_metric',
    quantity: Number(row.quantity ?? 0),
    periodStart: row.period_start,
    periodEnd: row.period_end
  };
}

async function querySingle<T>(query: Promise<QueryResult<unknown>>): Promise<T> {
  const { data, error } = await query;
  if (error || !data) throw error ?? new Error('copilot_context_not_found');
  return data as T;
}

async function queryArray<T>(query: QueryLike): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

function sourceTypeFromCitation(citation: unknown, evidenceType: string): string | null {
  if (isRecord(citation) && typeof citation.sourceType === 'string') {
    return citation.sourceType;
  }
  if (evidenceType === 'contract_term') return 'contract';
  if (evidenceType === 'invoice_row') return 'invoice';
  if (evidenceType === 'usage_row') return 'usage';
  if (evidenceType === 'calculation') return 'calculation';
  return null;
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
