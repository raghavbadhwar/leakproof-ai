import type { ContractTerm, InvoiceRecord, LeakageFinding, UsageRecord } from '../leakage/types';

type ContractTermRow = {
  id: string;
  customer_id: string | null;
  term_type: ContractTerm['type'];
  term_value: unknown;
  citation: ContractTerm['citation'];
  confidence: number;
  review_status: ContractTerm['reviewStatus'];
};

type InvoiceRecordRow = {
  id: string;
  customer_id: string | null;
  invoice_id: string;
  invoice_date: string;
  line_item: string;
  quantity: number | null;
  unit_price_minor: number | null;
  amount_minor: number;
  currency: string;
  service_period_start?: string | null;
  service_period_end?: string | null;
  payment_terms_days?: number | null;
  row_citation: InvoiceRecord['citation'];
};

type UsageRecordRow = {
  id: string;
  customer_id: string | null;
  period_start: string;
  period_end: string;
  metric_name: string;
  quantity: number;
  row_citation: UsageRecord['citation'];
};

export function mapContractTerm(row: ContractTermRow): ContractTerm {
  return {
    id: row.id,
    customerId: row.customer_id ?? 'unassigned',
    type: row.term_type,
    value: row.term_value,
    citation: row.citation,
    confidence: Number(row.confidence),
    reviewStatus: row.review_status
  };
}

export function mapInvoiceRecord(row: InvoiceRecordRow): InvoiceRecord {
  return {
    id: row.id,
    customerId: row.customer_id ?? 'unassigned',
    invoiceId: row.invoice_id,
    invoiceDate: row.invoice_date,
    lineItem: row.line_item,
    quantity: row.quantity ?? undefined,
    unitPriceMinor: row.unit_price_minor ?? undefined,
    amountMinor: row.amount_minor,
    currency: row.currency,
    servicePeriodStart: row.service_period_start ?? undefined,
    servicePeriodEnd: row.service_period_end ?? undefined,
    paymentTermsDays: row.payment_terms_days ?? undefined,
    citation: row.row_citation
  };
}

export function mapUsageRecord(row: UsageRecordRow): UsageRecord {
  return {
    id: row.id,
    customerId: row.customer_id ?? 'unassigned',
    periodStart: row.period_start,
    periodEnd: row.period_end,
    metricName: row.metric_name,
    quantity: Number(row.quantity),
    citation: row.row_citation
  };
}

export function findingToInsert(
  finding: LeakageFinding,
  input: { organizationId: string; workspaceId: string; reconciliationRunId?: string }
) {
  return {
    organization_id: input.organizationId,
    workspace_id: input.workspaceId,
    customer_id: finding.customerId === 'unassigned' ? null : finding.customerId,
    finding_type: finding.type,
    outcome_type: finding.outcomeType,
    title: finding.title,
    summary: finding.summary,
    estimated_amount_minor: finding.estimatedAmount.amountMinor,
    currency: finding.estimatedAmount.currency,
    confidence: finding.confidence,
    status: finding.status,
    calculation: finding.calculation,
    recommended_action: 'Review the evidence pack and approve, dismiss, or mark needs review.',
    reconciliation_run_id: input.reconciliationRunId,
    evidence_coverage_status: finding.citations.length > 0 ? 'complete' : 'pending'
  };
}
