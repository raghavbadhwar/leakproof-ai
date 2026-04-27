import { z } from 'zod';

export const AI_TASK_TYPES = [
  'data_mapping',
  'missing_data_detection',
  'audit_readiness',
  'evidence_quality_review',
  'false_positive_review',
  'contract_hierarchy_resolution',
  'recovery_note_draft',
  'cfo_summary_draft',
  'root_cause_classification',
  'next_best_action',
  'reviewer_checklist'
] as const;

export const aiTaskTypeSchema = z.enum(AI_TASK_TYPES);

export type AiTaskType = z.infer<typeof aiTaskTypeSchema>;

export const AI_ENTITY_REFERENCE_TYPES = [
  'organization',
  'workspace',
  'source_document',
  'document_chunk',
  'customer',
  'contract_term',
  'invoice_row',
  'usage_row',
  'finding',
  'evidence_item',
  'evidence_candidate',
  'report',
  'reconciliation_run',
  'analytics_snapshot',
  'copilot_action'
] as const;

export const aiEntityReferenceTypeSchema = z.enum(AI_ENTITY_REFERENCE_TYPES);

export type AiEntityReferenceType = z.infer<typeof aiEntityReferenceTypeSchema>;

export const aiSafeEntityReferenceSchema = z
  .object({
    type: aiEntityReferenceTypeSchema,
    id: z.string().trim().min(1).max(180),
    label: z.string().trim().min(1).max(180).optional()
  })
  .strict();

export type AiSafeEntityReference = z.infer<typeof aiSafeEntityReferenceSchema>;
