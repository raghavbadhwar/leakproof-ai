import type { Citation, LeakageFinding } from '../leakage/types';

export const AUDIT_RUN_STATUSES = ['queued', 'processing', 'completed', 'failed', 'superseded'] as const;

export type AuditRunStatus = (typeof AUDIT_RUN_STATUSES)[number];

export type VersionedAuditRow = {
  is_active?: boolean | null;
  superseded_at?: string | null;
};

export type AuditableRun = {
  id: string;
  status: AuditRunStatus;
};

export function activeLatestRows<T extends VersionedAuditRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.is_active !== false && !row.superseded_at);
}

export function activeCompletedRuns<T extends AuditableRun>(runs: readonly T[]): T[] {
  return runs.filter((run) => run.status === 'completed');
}

export function buildContractTermLogicalKey(input: {
  termType: string;
  termValue: unknown;
  sourceDocumentId: string;
  citation: unknown;
}): string {
  return stableLogicalKey([
    input.sourceDocumentId,
    input.termType,
    stableStringify(input.termValue),
    stableStringify(readCitationLocator(input.citation))
  ]);
}

export function buildFindingLogicalKey(finding: Pick<LeakageFinding, 'id' | 'type' | 'customerId' | 'calculation' | 'citations'>): string {
  return stableLogicalKey([
    finding.customerId,
    finding.type,
    readFindingPeriod(finding.calculation).join(':'),
    finding.citations.map((citation) => citation.sourceId).sort().join('|') || finding.id
  ]);
}

export function readFindingPeriod(calculation: Record<string, unknown>): [string | null, string | null] {
  const candidates = [
    [calculation.periodStart, calculation.periodEnd],
    [calculation.servicePeriodStart, calculation.servicePeriodEnd],
    [calculation.invoiceDate, calculation.invoiceDate],
    [calculation.contractEndDate, calculation.contractEndDate],
    [calculation.expiryDate, calculation.expiryDate],
    [calculation.noticeDeadline, calculation.noticeDeadline]
  ];

  for (const [start, end] of candidates) {
    const periodStart = toDateOnly(start);
    const periodEnd = toDateOnly(end);
    if (periodStart || periodEnd) return [periodStart, periodEnd];
  }

  return [null, null];
}

function readCitationLocator(citation: unknown): Pick<Citation, 'sourceId' | 'label' | 'sourceType'> | null {
  if (!isRecord(citation)) return null;
  return {
    sourceId: typeof citation.sourceId === 'string' ? citation.sourceId : '',
    label: typeof citation.label === 'string' ? citation.label : '',
    sourceType: citation.sourceType === 'contract' || citation.sourceType === 'invoice' || citation.sourceType === 'usage' || citation.sourceType === 'calculation' ? citation.sourceType : 'contract'
  };
}

function stableLogicalKey(parts: readonly string[]): string {
  return parts.join('::').slice(0, 512);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function toDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
