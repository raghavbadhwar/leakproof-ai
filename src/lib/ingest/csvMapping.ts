import {
  fieldsForDocumentType,
  requiredFieldsForDocumentType,
  type ConfirmedDataMapping,
  type DataMappingDocumentType,
  type DataMappingFieldMapping,
  type DataMappingTargetField
} from '../ai/dataMappingSchema';
import { parseCustomerCsv, parseCsv, parseInvoiceCsv, parseUsageCsv, serializeCsv, type CsvParseContext } from './csv';

export class DataMappingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataMappingValidationError';
  }
}

export type CsvMappingValidationResult = {
  normalizedMapping: ConfirmedDataMapping;
  mappedFields: DataMappingTargetField[];
  requiredMissingFields: DataMappingTargetField[];
  warnings: string[];
};

export type MappedCsvResult = CsvMappingValidationResult & {
  csv: string;
  rowCount: number;
  canonicalHeaders: DataMappingTargetField[];
};

export type CsvParsePreview = {
  row_count: number;
  safe_preview: Array<Record<string, string>>;
  warnings: string[];
};

export function validateConfirmedDataMapping(input: {
  documentType: DataMappingDocumentType;
  csvHeaders: readonly string[];
  mapping: ConfirmedDataMapping;
}): CsvMappingValidationResult {
  if (input.mapping.document_type !== input.documentType) {
    throw new DataMappingValidationError('Confirmed mapping document type does not match the selected document type.');
  }

  const headers = new Set(input.csvHeaders);
  const validFields = new Set(fieldsForDocumentType(input.documentType));
  const seenTargets = new Set<DataMappingTargetField>();
  const warnings: string[] = [];
  const normalizedMappings: DataMappingFieldMapping[] = [];

  for (const mapping of input.mapping.field_mappings) {
    if (!headers.has(mapping.uploaded_column)) {
      throw new DataMappingValidationError(`Uploaded column "${mapping.uploaded_column}" was not found in the CSV headers.`);
    }
    if (!mapping.mapped_field) {
      normalizedMappings.push(mapping);
      continue;
    }
    if (!validFields.has(mapping.mapped_field)) {
      throw new DataMappingValidationError(`${mapping.mapped_field} is not valid for ${input.documentType}.`);
    }
    if (seenTargets.has(mapping.mapped_field)) {
      throw new DataMappingValidationError(`${mapping.mapped_field} is mapped more than once.`);
    }
    assertSemanticDateMapping(mapping.uploaded_column, mapping.mapped_field);
    seenTargets.add(mapping.mapped_field);
    normalizedMappings.push(mapping);
  }

  const requiredMissingFields = requiredFieldsForDocumentType(input.documentType).filter((field) => !seenTargets.has(field));
  if (requiredMissingFields.length > 0) {
    throw new DataMappingValidationError(`Missing required fields: ${requiredMissingFields.join(', ')}.`);
  }
  if (!seenTargets.has('customer_external_id') || !seenTargets.has('customer_name')) {
    warnings.push('Customer identifier mapping is incomplete; LeakProof will not fabricate customer values.');
  }

  return {
    normalizedMapping: {
      document_type: input.documentType,
      field_mappings: normalizedMappings
    },
    mappedFields: Array.from(seenTargets),
    requiredMissingFields,
    warnings
  };
}

export function applyCsvMappingToCanonicalCsv(input: {
  csv: string;
  documentType: DataMappingDocumentType;
  mapping: ConfirmedDataMapping;
}): MappedCsvResult {
  const parsed = parseCsv(input.csv);
  const validation = validateConfirmedDataMapping({
    documentType: input.documentType,
    csvHeaders: parsed.headers,
    mapping: input.mapping
  });
  const canonicalHeaders = fieldsForDocumentType(input.documentType);
  const sourceByTarget = new Map<DataMappingTargetField, string>();
  for (const mapping of validation.normalizedMapping.field_mappings) {
    if (mapping.mapped_field) sourceByTarget.set(mapping.mapped_field, mapping.uploaded_column);
  }

  const records = parsed.records.map((record) =>
    Object.fromEntries(canonicalHeaders.map((field) => [field, sourceByTarget.get(field) ? record[sourceByTarget.get(field) as string] ?? '' : '']))
  );

  return {
    ...validation,
    csv: serializeCsv(canonicalHeaders, records),
    rowCount: records.length,
    canonicalHeaders: [...canonicalHeaders]
  };
}

export function parseMappedCsvPreview(input: {
  csv: string;
  documentType: DataMappingDocumentType;
  mapping: ConfirmedDataMapping;
  context?: CsvParseContext;
  maxRows?: number;
}): CsvParsePreview {
  const mapped = applyCsvMappingToCanonicalCsv(input);
  const maxRows = input.maxRows ?? 5;

  if (input.documentType === 'invoice_csv') {
    const records = parseInvoiceCsv(mapped.csv, input.context ?? { sourceDocumentId: 'mapping_preview', workspaceId: 'mapping_preview' });
    return {
      row_count: records.length,
      safe_preview: records.slice(0, maxRows).map((record) => ({
        customer_external_id: redactText(record.customerExternalId),
        customer_name: redactText(record.customerName),
        invoice_id: redactText(record.invoiceId),
        invoice_date: 'date present',
        line_item: redactText(record.lineItem),
        amount: 'money value present',
        currency: record.currency
      })),
      warnings: mapped.warnings
    };
  }

  if (input.documentType === 'usage_csv') {
    const records = parseUsageCsv(mapped.csv, input.context ?? { sourceDocumentId: 'mapping_preview', workspaceId: 'mapping_preview' });
    return {
      row_count: records.length,
      safe_preview: records.slice(0, maxRows).map((record) => ({
        customer_external_id: redactText(record.customerExternalId),
        customer_name: redactText(record.customerName),
        period_start: 'date present',
        period_end: 'date present',
        metric_name: redactText(record.metricName),
        quantity: 'number present'
      })),
      warnings: mapped.warnings
    };
  }

  const records = parseCustomerCsv(mapped.csv);
  return {
    row_count: records.length,
    safe_preview: records.slice(0, maxRows).map((record) => ({
      customer_external_id: redactText(record.customerExternalId),
      customer_name: redactText(record.customerName),
      domain: record.domain ? 'text present' : 'blank',
      contract_value: record.contractValueMinor === undefined ? 'blank' : 'money value present',
      renewal_date: record.renewalDate ? 'date present' : 'blank'
    })),
    warnings: mapped.warnings
  };
}

function assertSemanticDateMapping(sourceColumn: string, targetField: DataMappingTargetField): void {
  const source = normalizeHeader(sourceColumn);
  if (targetField === 'invoice_date' && /\b(due|paid|payment|renewal)\b|period end|service end/.test(source)) {
    throw new DataMappingValidationError('Due, paid, renewal, or period-end columns cannot be mapped to invoice_date.');
  }
  if (targetField === 'period_start' && /\b(end|due|paid|invoice|bill|renewal)\b/.test(source)) {
    throw new DataMappingValidationError('Only usage period start columns can be mapped to period_start.');
  }
  if (targetField === 'period_end' && /\b(start|due|paid|invoice|bill|renewal)\b/.test(source)) {
    throw new DataMappingValidationError('Only usage period end columns can be mapped to period_end.');
  }
  if (targetField === 'service_period_start' && /\b(end|due|paid|invoice|bill|renewal)\b/.test(source)) {
    throw new DataMappingValidationError('Only service period start columns can be mapped to service_period_start.');
  }
  if (targetField === 'service_period_end' && /\b(start|due|paid|invoice|bill|renewal)\b/.test(source)) {
    throw new DataMappingValidationError('Only service period end columns can be mapped to service_period_end.');
  }
  if (targetField === 'paid_at' && /\b(invoice|bill|due|renewal)\b/.test(source) && !/\bpaid|payment\b/.test(source)) {
    throw new DataMappingValidationError('Only paid/payment date columns can be mapped to paid_at.');
  }
  if (targetField === 'renewal_date' && /\b(invoice|bill|due|paid|payment)\b/.test(source)) {
    throw new DataMappingValidationError('Only renewal date columns can be mapped to renewal_date.');
  }
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function redactText(value: string): string {
  return value.trim() ? 'text present' : 'blank';
}
