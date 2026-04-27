import {
  DATA_MAPPING_PROMPT_VERSION,
  dataMappingDocumentTypeSchema,
  dataMappingSuggestionSchema,
  fieldsForDocumentType,
  requiredFieldsForDocumentType,
  type DataMappingDocumentType,
  type DataMappingFieldMapping,
  type DataMappingSuggestRequest,
  type DataMappingSuggestion,
  type DataMappingTargetField
} from './dataMappingSchema';

export type GenerateDataMappingAiOutput = (input: {
  prompt: string;
  systemInstruction: string;
  promptVersion: string;
}) => Promise<unknown>;

type MappingCandidate = {
  field: DataMappingTargetField | null;
  confidence: number;
  rationale: string;
};

type AliasMap = Record<DataMappingDocumentType, Partial<Record<DataMappingTargetField, readonly string[]>>>;

const aliasMap: AliasMap = {
  invoice_csv: {
    customer_external_id: ['customer external id', 'customer id', 'client id', 'account id', 'acct id', 'external id', 'account number'],
    customer_name: ['customer name', 'client name', 'client', 'customer', 'account name', 'company', 'company name'],
    invoice_id: ['invoice id', 'invoice number', 'invoice no', 'invoice', 'inv no', 'bill number', 'bill id', 'document number'],
    invoice_date: ['invoice date', 'bill date', 'billing date', 'issued date', 'issue date', 'invoice issued'],
    line_item: ['line item', 'line', 'line description', 'description', 'item description', 'charge description'],
    quantity: ['quantity', 'qty', 'users', 'seats', 'seat count', 'usage qty', 'units'],
    unit_price: ['unit price', 'unit rate', 'price', 'rate', 'per unit', 'seat price'],
    amount: ['amount', 'total', 'invoice total', 'line total', 'net amount', 'subtotal', 'charge amount'],
    currency: ['currency', 'currency code', 'curr', 'ccy'],
    service_period_start: ['service period start', 'period start', 'start date', 'from date', 'service start'],
    service_period_end: ['service period end', 'period end', 'end date', 'to date', 'service end'],
    payment_terms_days: ['payment terms days', 'payment terms', 'terms days', 'net terms', 'net days'],
    due_date: ['due date', 'payment due date', 'invoice due date'],
    paid_at: ['paid at', 'paid date', 'payment date', 'settled date'],
    product_label: ['product', 'product label', 'sku', 'plan', 'product name', 'service'],
    team_label: ['team', 'team label', 'department', 'cost center', 'business unit']
  },
  usage_csv: {
    customer_external_id: ['customer external id', 'customer id', 'client id', 'account id', 'acct id', 'external id', 'account number'],
    customer_name: ['customer name', 'client name', 'client', 'customer', 'account name', 'company', 'company name'],
    period_start: ['period start', 'usage period start', 'period from', 'from', 'start date', 'from date', 'month start'],
    period_end: ['period end', 'usage period end', 'period to', 'to', 'end date', 'to date', 'month end'],
    metric_name: ['metric name', 'usage metric', 'metric', 'usage type', 'usage', 'event type', 'activity'],
    quantity: ['quantity', 'qty', 'usage qty', 'usage quantity', 'count', 'calls', 'api calls', 'users', 'seats', 'seat count'],
    product_label: ['product', 'product label', 'sku', 'plan', 'product name', 'service'],
    team_label: ['team', 'team label', 'department', 'cost center', 'business unit']
  },
  customer_csv: {
    customer_external_id: ['customer external id', 'customer id', 'client id', 'account id', 'acct id', 'external id', 'account number'],
    customer_name: ['customer name', 'client name', 'client', 'customer', 'account name', 'company', 'company name'],
    domain: ['domain', 'website', 'email domain', 'company domain'],
    segment: ['segment', 'customer segment', 'tier', 'market segment'],
    billing_model: ['billing model', 'pricing model', 'billing type', 'commercial model'],
    contract_type: ['contract type', 'agreement type', 'order type', 'contract class'],
    contract_value: ['contract value', 'arr', 'annual recurring revenue', 'annual value', 'tcv', 'acv', 'bookings'],
    renewal_date: ['renewal date', 'renewal', 'contract renewal', 'next renewal'],
    owner_label: ['owner', 'owner label', 'account owner', 'customer owner', 'csm', 'sales owner']
  }
};

const safety = {
  canCalculateFinalLeakage: false,
  canApproveFindings: false,
  canApproveEvidence: false,
  canExportReports: false,
  storesRawCsv: false
} as const;

export async function suggestDataMapping(
  input: DataMappingSuggestRequest,
  generateAiOutput?: GenerateDataMappingAiOutput
): Promise<DataMappingSuggestion> {
  const deterministic = suggestDataMappingDeterministic(input);
  if (!generateAiOutput) return deterministic;

  try {
    const rawOutput = await generateAiOutput({
      prompt: buildDataMappingPrompt(input),
      systemInstruction: dataMappingSystemInstruction(),
      promptVersion: DATA_MAPPING_PROMPT_VERSION
    });
    const parsed = dataMappingSuggestionSchema.parse(rawOutput);
    return normalizeSuggestion(parsed, input, deterministic);
  } catch {
    return {
      ...deterministic,
      warnings: [
        'Gemini was unavailable or returned invalid mapping JSON, so deterministic fuzzy mapping was used.',
        ...deterministic.warnings
      ].slice(0, 12)
    };
  }
}

export function suggestDataMappingDeterministic(input: DataMappingSuggestRequest): DataMappingSuggestion {
  const detectedDocumentType = detectDocumentType(input.csv_headers, input.document_type);
  const selectedTargets = new Set<DataMappingTargetField>();
  const fieldMappings = input.csv_headers.map((header) => {
    const candidate = candidateForHeader(header, input.document_type, input.sample_rows);
    if (!candidate.field || selectedTargets.has(candidate.field)) {
      return fieldMapping(header, null, 0, 'No confident deterministic match.');
    }
    selectedTargets.add(candidate.field);
    return fieldMapping(header, candidate.field, candidate.confidence, candidate.rationale);
  });
  const requiredMissingFields = missingRequiredFields(input.document_type, fieldMappings);

  return dataMappingSuggestionSchema.parse({
    suggested_document_type: detectedDocumentType,
    field_mappings: fieldMappings,
    required_missing_fields: requiredMissingFields,
    optional_suggested_fields: optionalSuggestedFields(input.document_type, fieldMappings),
    warnings: mappingWarnings(input.document_type, detectedDocumentType, requiredMissingFields),
    safe_preview: safePreviewRows(input.document_type, fieldMappings, input.sample_rows),
    mapping_source: 'deterministic_fallback',
    safety
  });
}

export function buildDataMappingPrompt(input: DataMappingSuggestRequest): string {
  return [
    'Suggest a LeakProof CSV column mapping.',
    'Use only the headers and redacted sample value types. Do not infer financial values.',
    JSON.stringify({
      requested_document_type: input.document_type,
      csv_headers: input.csv_headers,
      redacted_sample_rows: redactSampleRowsForPrompt(input.sample_rows)
    })
  ].join('\n');
}

export function dataMappingSystemInstruction(): string {
  return [
    'You are the AI Data Mapping Assistant for LeakProof AI.',
    'LLM explains and suggests. Code calculates. Human approves.',
    'Map uploaded CSV headers to LeakProof fields for invoice_csv, usage_csv, or customer_csv.',
    'Never calculate leakage, approve findings, approve evidence, export reports, send emails, create invoices, or invent missing values.',
    'Return strict JSON matching the configured schema.',
    'Set all safety booleans to false and storesRawCsv=false.',
    'Use null for unmapped columns and include missing required fields.'
  ].join(' ');
}

export function redactSampleRowsForPrompt(rows: DataMappingSuggestRequest['sample_rows']): Array<Record<string, string>> {
  return rows.slice(0, 5).map((row) => Object.fromEntries(
    Object.entries(row).slice(0, 100).map(([key, value]) => [key, redactValueShape(value)])
  ));
}

export function missingRequiredFields(
  documentType: DataMappingDocumentType,
  mappings: readonly DataMappingFieldMapping[]
): DataMappingTargetField[] {
  const mapped = new Set(mappings.map((mapping) => mapping.mapped_field).filter(Boolean));
  return requiredFieldsForDocumentType(documentType).filter((field) => !mapped.has(field));
}

export function safePreviewRows(
  documentType: DataMappingDocumentType,
  mappings: readonly DataMappingFieldMapping[],
  rows: DataMappingSuggestRequest['sample_rows']
): Array<Record<string, string>> {
  const sourceByTarget = new Map<DataMappingTargetField, string>();
  for (const mapping of mappings) {
    if (mapping.mapped_field) sourceByTarget.set(mapping.mapped_field, mapping.uploaded_column);
  }

  return rows.slice(0, 3).map((row) => {
    const preview: Record<string, string> = {};
    for (const field of fieldsForDocumentType(documentType)) {
      const source = sourceByTarget.get(field);
      if (!source) continue;
      preview[field] = redactMappedPreviewValue(field, row[source]);
    }
    return preview;
  });
}

function normalizeSuggestion(
  suggestion: DataMappingSuggestion,
  input: DataMappingSuggestRequest,
  deterministic: DataMappingSuggestion
): DataMappingSuggestion {
  const documentType = dataMappingDocumentTypeSchema.catch(input.document_type).parse(suggestion.suggested_document_type);
  const validFields = new Set(fieldsForDocumentType(input.document_type));
  const mappingsByHeader = new Map(suggestion.field_mappings.map((mapping) => [mapping.uploaded_column, mapping]));
  const usedTargets = new Set<DataMappingTargetField>();
  const normalizedMappings = input.csv_headers.map((header) => {
    const aiMapping = mappingsByHeader.get(header);
    const deterministicMapping = deterministic.field_mappings.find((mapping) => mapping.uploaded_column === header);
    const mappedField = aiMapping?.mapped_field && validFields.has(aiMapping.mapped_field)
      ? aiMapping.mapped_field
      : deterministicMapping?.mapped_field ?? null;
    if (mappedField && usedTargets.has(mappedField)) {
      return fieldMapping(header, null, 0, 'Duplicate AI target removed for reviewer mapping.');
    }
    if (mappedField) usedTargets.add(mappedField);
    return fieldMapping(
      header,
      mappedField,
      clampConfidence(aiMapping?.confidence ?? deterministicMapping?.confidence ?? 0),
      aiMapping?.rationale ?? deterministicMapping?.rationale ?? 'AI-suggested mapping.'
    );
  });
  const requiredMissingFields = missingRequiredFields(input.document_type, normalizedMappings);

  return dataMappingSuggestionSchema.parse({
    suggested_document_type: documentType,
    field_mappings: normalizedMappings,
    required_missing_fields: requiredMissingFields,
    optional_suggested_fields: optionalSuggestedFields(input.document_type, normalizedMappings),
    warnings: [...suggestion.warnings, ...mappingWarnings(input.document_type, documentType, requiredMissingFields)].slice(0, 12),
    safe_preview: safePreviewRows(input.document_type, normalizedMappings, input.sample_rows),
    mapping_source: 'gemini',
    safety
  });
}

function candidateForHeader(
  header: string,
  documentType: DataMappingDocumentType,
  rows: DataMappingSuggestRequest['sample_rows']
): MappingCandidate {
  const candidates = fieldsForDocumentType(documentType).map((field) => ({
    field,
    score: scoreHeaderForField(header, field, documentType, sampleValuesForHeader(rows, header))
  }));
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 0.52) {
    return { field: null, confidence: 0, rationale: 'No confident deterministic match.' };
  }
  return {
    field: best.field,
    confidence: Math.min(best.score, 0.95),
    rationale: `Header resembles ${best.field}.`
  };
}

function scoreHeaderForField(
  header: string,
  field: DataMappingTargetField,
  documentType: DataMappingDocumentType,
  sampleValues: unknown[]
): number {
  const normalized = normalizeHeader(header);
  if (normalized === normalizeHeader(field)) return 0.98;
  const aliases = aliasMap[documentType][field] ?? [];
  const aliasScore = Math.max(0, ...aliases.map((alias) => scoreAlias(normalized, alias)));
  const valueScore = scoreValueShapeForField(field, sampleValues);
  return Math.min(0.97, aliasScore + valueScore);
}

function scoreAlias(normalizedHeader: string, alias: string): number {
  const normalizedAlias = normalizeHeader(alias);
  if (normalizedHeader === normalizedAlias) return 0.93;
  if (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) return 0.82;
  const aliasTokens = normalizedAlias.split(' ').filter(Boolean);
  if (aliasTokens.length > 1 && aliasTokens.every((token) => normalizedHeader.includes(token))) return 0.76;
  if (aliasTokens.length === 1 && normalizedHeader.includes(aliasTokens[0] ?? '')) return 0.58;
  return 0;
}

function scoreValueShapeForField(field: DataMappingTargetField, values: unknown[]): number {
  const present = values.filter((value) => String(value ?? '').trim());
  if (present.length === 0) return 0;
  const shapes = present.map((value) => redactValueShape(value));
  if (['amount', 'unit_price', 'contract_value'].includes(field) && shapes.some((shape) => shape === 'money' || shape === 'number')) return 0.08;
  if (['quantity', 'payment_terms_days'].includes(field) && shapes.every((shape) => shape === 'number' || shape === 'money')) return 0.06;
  if (field.includes('date') || ['paid_at', 'period_start', 'period_end', 'service_period_start', 'service_period_end', 'renewal_date'].includes(field)) {
    return shapes.some((shape) => shape === 'date') ? 0.08 : 0;
  }
  if (field === 'currency' && present.some((value) => /^[A-Z]{3}$/i.test(String(value).trim()))) return 0.08;
  if (field === 'domain' && shapes.some((shape) => shape === 'domain' || shape === 'email')) return 0.08;
  return 0;
}

function detectDocumentType(headers: readonly string[], requested: DataMappingDocumentType): DataMappingDocumentType {
  const joined = normalizeHeader(headers.join(' '));
  const scores: Record<DataMappingDocumentType, number> = {
    invoice_csv: scoreTerms(joined, ['invoice', 'bill', 'amount', 'total', 'due', 'paid', 'line item', 'currency']),
    usage_csv: scoreTerms(joined, ['usage', 'metric', 'calls', 'seats', 'period', 'quantity', 'qty']),
    customer_csv: scoreTerms(joined, ['domain', 'segment', 'arr', 'contract value', 'renewal', 'owner', 'billing model'])
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[DataMappingDocumentType, number]>;
  return ranked[0]?.[1] ? ranked[0][0] : requested;
}

function scoreTerms(joinedHeader: string, terms: readonly string[]): number {
  return terms.reduce((score, term) => score + (joinedHeader.includes(normalizeHeader(term)) ? 1 : 0), 0);
}

function optionalSuggestedFields(
  documentType: DataMappingDocumentType,
  mappings: readonly DataMappingFieldMapping[]
): DataMappingTargetField[] {
  const required = new Set(requiredFieldsForDocumentType(documentType));
  return mappings
    .map((mapping) => mapping.mapped_field)
    .filter((field): field is DataMappingTargetField => Boolean(field))
    .filter((field) => !required.has(field));
}

function mappingWarnings(
  requestedDocumentType: DataMappingDocumentType,
  detectedDocumentType: DataMappingDocumentType,
  requiredMissingFields: readonly DataMappingTargetField[]
): string[] {
  const warnings: string[] = [];
  if (detectedDocumentType !== requestedDocumentType) warnings.push(`Headers look more like ${detectedDocumentType} than ${requestedDocumentType}. Review before confirming.`);
  if (requiredMissingFields.length > 0) warnings.push(`Missing required fields: ${requiredMissingFields.join(', ')}.`);
  if (requiredMissingFields.includes('customer_external_id') || requiredMissingFields.includes('customer_name')) {
    warnings.push('Customer identifier fields are incomplete; LeakProof will not fabricate customer values.');
  }
  return warnings;
}

function fieldMapping(
  uploadedColumn: string,
  mappedField: DataMappingTargetField | null,
  confidence: number,
  rationale: string
): DataMappingFieldMapping {
  return {
    uploaded_column: uploadedColumn,
    mapped_field: mappedField,
    confidence: clampConfidence(confidence),
    rationale
  };
}

function sampleValuesForHeader(rows: DataMappingSuggestRequest['sample_rows'], header: string): unknown[] {
  return rows.map((row) => row[header]);
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function redactValueShape(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'blank';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return 'date';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return 'email';
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text) && !/^\d/.test(text)) return 'domain';
  if (/^\$?\s*-?\d[\d,]*(\.\d{1,2})?$/.test(text)) return text.includes('$') || text.includes(',') || text.includes('.') ? 'money' : 'number';
  if (/^[A-Z]{3}$/i.test(text)) return 'currency';
  return `text:${Math.min(text.length, 120)}`;
}

function redactMappedPreviewValue(field: DataMappingTargetField, value: unknown): string {
  const shape = redactValueShape(value);
  if (shape === 'blank') return 'blank';
  if (['amount', 'unit_price', 'contract_value'].includes(field)) return 'money value present';
  if (['quantity', 'payment_terms_days'].includes(field)) return 'number present';
  if (field === 'currency') return /^[A-Z]{3}$/i.test(String(value ?? '').trim()) ? String(value).trim().toUpperCase() : 'currency present';
  if (field.includes('date') || ['paid_at', 'period_start', 'period_end', 'service_period_start', 'service_period_end', 'renewal_date'].includes(field)) return 'date present';
  return shape.startsWith('text') || ['email', 'domain'].includes(shape) ? 'text present' : `${shape} present`;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}
