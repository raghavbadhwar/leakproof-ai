import { z } from 'zod';

export const DATA_MAPPING_PROMPT_VERSION = 'data-mapping-assistant-v1';

export const dataMappingDocumentTypeSchema = z.enum(['invoice_csv', 'usage_csv', 'customer_csv']);
export type DataMappingDocumentType = z.infer<typeof dataMappingDocumentTypeSchema>;

export const invoiceCsvFields = [
  'customer_external_id',
  'customer_name',
  'invoice_id',
  'invoice_date',
  'line_item',
  'quantity',
  'unit_price',
  'amount',
  'currency',
  'service_period_start',
  'service_period_end',
  'payment_terms_days',
  'due_date',
  'paid_at',
  'product_label',
  'team_label'
] as const;

export const usageCsvFields = [
  'customer_external_id',
  'customer_name',
  'period_start',
  'period_end',
  'metric_name',
  'quantity',
  'product_label',
  'team_label'
] as const;

export const customerCsvFields = [
  'customer_external_id',
  'customer_name',
  'domain',
  'segment',
  'billing_model',
  'contract_type',
  'contract_value',
  'renewal_date',
  'owner_label'
] as const;

export const dataMappingFieldsByDocumentType = {
  invoice_csv: invoiceCsvFields,
  usage_csv: usageCsvFields,
  customer_csv: customerCsvFields
} as const satisfies Record<DataMappingDocumentType, readonly string[]>;

export const requiredDataMappingFieldsByDocumentType = {
  invoice_csv: ['customer_external_id', 'customer_name', 'invoice_id', 'invoice_date', 'line_item', 'amount', 'currency'],
  usage_csv: ['customer_external_id', 'customer_name', 'period_start', 'period_end', 'metric_name', 'quantity'],
  customer_csv: ['customer_external_id', 'customer_name']
} as const satisfies Record<DataMappingDocumentType, readonly string[]>;

export const allDataMappingFields = [
  ...invoiceCsvFields,
  'period_start',
  'period_end',
  'metric_name',
  'domain',
  'segment',
  'billing_model',
  'contract_type',
  'contract_value',
  'renewal_date',
  'owner_label'
] as const;

export const dataMappingTargetFieldSchema = z.enum(allDataMappingFields);
export type DataMappingTargetField = z.infer<typeof dataMappingTargetFieldSchema>;

export const sampleRowValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const sampleRowsSchema = z.array(z.record(z.string(), sampleRowValueSchema)).max(5).default([]);

const shortAiTextSchema = z.string().trim().min(1).max(800);

export const dataMappingFieldMappingSchema = z.object({
  uploaded_column: z.string().trim().min(1).max(200),
  mapped_field: dataMappingTargetFieldSchema.nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().max(500).optional()
}).strict();

export const dataMappingSafetySchema = z.object({
  canCalculateFinalLeakage: z.literal(false),
  canApproveFindings: z.literal(false),
  canApproveEvidence: z.literal(false),
  canExportReports: z.literal(false),
  storesRawCsv: z.literal(false)
}).strict();

export const dataMappingSuggestionSchema = z.object({
  suggested_document_type: dataMappingDocumentTypeSchema,
  field_mappings: z.array(dataMappingFieldMappingSchema).max(100),
  required_missing_fields: z.array(dataMappingTargetFieldSchema).max(20).default([]),
  optional_suggested_fields: z.array(dataMappingTargetFieldSchema).max(30).default([]),
  warnings: z.array(shortAiTextSchema).max(12).default([]),
  safe_preview: z.array(z.record(z.string(), z.string().max(120))).max(5).default([]),
  mapping_source: z.enum(['gemini', 'deterministic_fallback']).default('gemini'),
  safety: dataMappingSafetySchema
}).strict();

export type DataMappingSuggestion = z.infer<typeof dataMappingSuggestionSchema>;
export type DataMappingFieldMapping = z.infer<typeof dataMappingFieldMappingSchema>;

export const dataMappingSuggestRequestSchema = z.object({
  organization_id: z.string().uuid(),
  document_type: dataMappingDocumentTypeSchema,
  file_name: z.string().trim().min(1).max(260),
  csv_headers: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  sample_rows: sampleRowsSchema
}).strict();

export type DataMappingSuggestRequest = z.infer<typeof dataMappingSuggestRequestSchema>;

export const confirmedDataMappingSchema = z.object({
  document_type: dataMappingDocumentTypeSchema,
  field_mappings: z.array(dataMappingFieldMappingSchema).min(1).max(100)
}).strict();

export type ConfirmedDataMapping = z.infer<typeof confirmedDataMappingSchema>;

export const dataMappingConfirmRequestSchema = z.object({
  organization_id: z.string().uuid(),
  document_type: dataMappingDocumentTypeSchema,
  file_name: z.string().trim().min(1).max(260).optional(),
  source_document_id: z.string().uuid().optional(),
  csv_text: z.string().max(2_000_000).optional(),
  confirmed_mapping: confirmedDataMappingSchema
}).strict().superRefine((value, ctx) => {
  if (!value.source_document_id && !value.csv_text) {
    ctx.addIssue({
      code: 'custom',
      path: ['csv_text'],
      message: 'CSV text or a draft source document reference is required.'
    });
  }
});

export type DataMappingConfirmRequest = z.infer<typeof dataMappingConfirmRequestSchema>;

export function fieldsForDocumentType(documentType: DataMappingDocumentType): readonly DataMappingTargetField[] {
  return dataMappingFieldsByDocumentType[documentType] as readonly DataMappingTargetField[];
}

export function requiredFieldsForDocumentType(documentType: DataMappingDocumentType): readonly DataMappingTargetField[] {
  return requiredDataMappingFieldsByDocumentType[documentType] as readonly DataMappingTargetField[];
}
