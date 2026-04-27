import type { Citation } from '../leakage/types';

export type CsvParseContext = {
  sourceDocumentId: string;
  workspaceId: string;
};

export type IngestedInvoiceRecord = {
  id: string;
  workspaceId: string;
  customerExternalId: string;
  customerName: string;
  customerSegment?: string;
  billingModel?: string;
  contractType?: string;
  contractValueMinor?: number;
  renewalDate?: string;
  ownerLabel?: string;
  domain?: string;
  invoiceId: string;
  invoiceDate: string;
  lineItem: string;
  quantity?: number;
  unitPriceMinor?: number;
  amountMinor: number;
  currency: string;
  paymentTermsDays?: number;
  dueDate?: string;
  paidAt?: string;
  productLabel?: string;
  teamLabel?: string;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  citation: Citation;
};

export type IngestedUsageRecord = {
  id: string;
  workspaceId: string;
  customerExternalId: string;
  customerName: string;
  customerSegment?: string;
  billingModel?: string;
  contractType?: string;
  contractValueMinor?: number;
  renewalDate?: string;
  ownerLabel?: string;
  domain?: string;
  periodStart: string;
  periodEnd: string;
  metricName: string;
  quantity: number;
  productLabel?: string;
  teamLabel?: string;
  citation: Citation;
};

export type IngestedCustomerRecord = {
  customerExternalId: string;
  customerName: string;
  customerSegment?: string;
  billingModel?: string;
  contractType?: string;
  contractValueMinor?: number;
  currency?: string;
  renewalDate?: string;
  ownerLabel?: string;
  domain?: string;
};

export function parseInvoiceCsv(csv: string, context: CsvParseContext): IngestedInvoiceRecord[] {
  const rows = parseCsv(csv);
  assertHeaders(rows.headers, [
    'customer_external_id',
    'customer_name',
    'invoice_id',
    'invoice_date',
    'line_item',
    'amount',
    'currency'
  ]);

  return rows.records.map((row, index) => ({
    id: stableRowId('invoice', context.sourceDocumentId, index + 2),
    workspaceId: context.workspaceId,
    customerExternalId: required(row, 'customer_external_id', index + 2),
    customerName: required(row, 'customer_name', index + 2),
    customerSegment: optionalText(row.segment),
    billingModel: optionalText(row.billing_model),
    contractType: optionalText(row.contract_type),
    contractValueMinor: optionalMoney(row.contract_value, 'contract_value', index + 2),
    renewalDate: optionalDate(row.renewal_date, 'renewal_date', index + 2),
    ownerLabel: optionalText(row.owner_label),
    domain: optionalText(row.domain),
    invoiceId: required(row, 'invoice_id', index + 2),
    invoiceDate: requiredDate(row, 'invoice_date', index + 2),
    lineItem: required(row, 'line_item', index + 2),
    quantity: optionalNumber(row.quantity, 'quantity', index + 2),
    unitPriceMinor: optionalMoney(row.unit_price, 'unit_price', index + 2),
    amountMinor: parseMoneyToMinorUnits(required(row, 'amount', index + 2), `amount on row ${index + 2}`),
    currency: required(row, 'currency', index + 2).toUpperCase(),
    paymentTermsDays: optionalInteger(row.payment_terms_days, 'payment_terms_days', index + 2),
    dueDate: optionalDate(row.due_date, 'due_date', index + 2),
    paidAt: optionalDate(row.paid_at, 'paid_at', index + 2),
    productLabel: optionalText(row.product_label),
    teamLabel: optionalText(row.team_label),
    servicePeriodStart: optionalDate(row.service_period_start, 'service_period_start', index + 2),
    servicePeriodEnd: optionalDate(row.service_period_end, 'service_period_end', index + 2),
    citation: {
      sourceType: 'invoice',
      sourceId: stableRowId('invoice', context.sourceDocumentId, index + 2),
      label: `invoices.csv row ${index + 2}`
    }
  }));
}

export function parseUsageCsv(csv: string, context: CsvParseContext): IngestedUsageRecord[] {
  const rows = parseCsv(csv);
  assertHeaders(rows.headers, [
    'customer_external_id',
    'customer_name',
    'period_start',
    'period_end',
    'metric_name',
    'quantity'
  ]);

  return rows.records.map((row, index) => ({
    id: stableRowId('usage', context.sourceDocumentId, index + 2),
    workspaceId: context.workspaceId,
    customerExternalId: required(row, 'customer_external_id', index + 2),
    customerName: required(row, 'customer_name', index + 2),
    customerSegment: optionalText(row.segment),
    billingModel: optionalText(row.billing_model),
    contractType: optionalText(row.contract_type),
    contractValueMinor: optionalMoney(row.contract_value, 'contract_value', index + 2),
    renewalDate: optionalDate(row.renewal_date, 'renewal_date', index + 2),
    ownerLabel: optionalText(row.owner_label),
    domain: optionalText(row.domain),
    periodStart: requiredDate(row, 'period_start', index + 2),
    periodEnd: requiredDate(row, 'period_end', index + 2),
    metricName: required(row, 'metric_name', index + 2),
    quantity: parseNumber(required(row, 'quantity', index + 2), `quantity on row ${index + 2}`),
    productLabel: optionalText(row.product_label),
    teamLabel: optionalText(row.team_label),
    citation: {
      sourceType: 'usage',
      sourceId: stableRowId('usage', context.sourceDocumentId, index + 2),
      label: `usage.csv row ${index + 2}`
    }
  }));
}

export function parseCustomerCsv(csv: string): IngestedCustomerRecord[] {
  const rows = parseCsv(csv);
  assertHeaders(rows.headers, ['customer_external_id', 'customer_name']);

  return rows.records.map((row, index) => ({
    customerExternalId: required(row, 'customer_external_id', index + 2),
    customerName: required(row, 'customer_name', index + 2),
    customerSegment: optionalText(row.segment),
    billingModel: optionalText(row.billing_model),
    contractType: optionalText(row.contract_type),
    contractValueMinor: optionalMoney(row.contract_value, 'contract_value', index + 2),
    currency: optionalText(row.currency)?.toUpperCase(),
    renewalDate: optionalDate(row.renewal_date, 'renewal_date', index + 2),
    ownerLabel: optionalText(row.owner_label),
    domain: optionalText(row.domain)
  }));
}

export function parseMoneyToMinorUnits(value: string, label = 'money value'): number {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  const negative = normalized.startsWith('-');
  const [wholeRaw, fractionRaw = ''] = normalized.replace('-', '').split('.');
  const fraction = fractionRaw.padEnd(2, '0');
  const amount = Number(wholeRaw) * 100 + Number(fraction);
  return negative ? -amount : amount;
}

export function parseCsv(csv: string): { headers: string[]; records: Record<string, string>[] } {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headers = splitCsvLine(lines[0] ?? '').map((header) => header.trim());
  const records = lines.slice(1).map((line, lineIndex) => {
    const values = splitCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${lineIndex + 2} has ${values.length} columns; expected ${headers.length}.`);
    }

    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });

  return { headers, records };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

export function serializeCsv(headers: readonly string[], records: readonly Record<string, string>[]): string {
  return [
    headers.map(escapeCsvCell).join(','),
    ...records.map((record) => headers.map((header) => escapeCsvCell(record[header] ?? '')).join(','))
  ].join('\n');
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function assertHeaders(actual: string[], requiredHeaders: string[]): void {
  const missing = requiredHeaders.filter((header) => !actual.includes(header));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required headers: ${missing.join(', ')}`);
  }
}

function required(row: Record<string, string>, field: string, rowNumber: number): string {
  const value = row[field]?.trim();
  if (!value) {
    throw new Error(`CSV row ${rowNumber} is missing ${field}.`);
  }
  return value;
}

function requiredDate(row: Record<string, string>, field: string, rowNumber: number): string {
  const value = required(row, field, rowNumber);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`CSV row ${rowNumber} has invalid ${field}.`);
  }
  return value;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function optionalDate(value: string | undefined, field: string, rowNumber: number): string | undefined {
  if (!value?.trim()) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`CSV row ${rowNumber} has invalid ${field}.`);
  }
  return value;
}

function optionalNumber(value: string | undefined, field: string, rowNumber: number): number | undefined {
  if (!value?.trim()) return undefined;
  return parseNumber(value, `${field} on row ${rowNumber}`);
}

function optionalMoney(value: string | undefined, field: string, rowNumber: number): number | undefined {
  if (!value?.trim()) return undefined;
  return parseMoneyToMinorUnits(value, `${field} on row ${rowNumber}`);
}

function optionalInteger(value: string | undefined, field: string, rowNumber: number): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${field} on row ${rowNumber}: ${value}`);
  }
  return parsed;
}

function parseNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function stableRowId(prefix: string, sourceDocumentId: string, rowNumber: number): string {
  return `${prefix}_${sourceDocumentId}_row_${rowNumber}`;
}
