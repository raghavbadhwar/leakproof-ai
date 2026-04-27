import { z } from 'zod';
import { aiSafeEntityReferenceSchema, aiTaskTypeSchema, type AiTaskType } from './taskTypes';

const shortSafeTextSchema = z.string().trim().min(1).max(1200);
const optionalSafeTextSchema = z.string().trim().max(500).optional();

export const aiTaskResultStatusSchema = z.enum(['completed', 'partial', 'rejected', 'blocked', 'failed']);

export const aiSafetyFlagSchema = z.enum([
  'schema_validated',
  'raw_source_text_redacted',
  'secret_redacted',
  'pii_redacted',
  'truncated_safe_excerpt',
  'human_approval_required',
  'code_calculates_money',
  'advisory_only',
  'no_external_action',
  'needs_more_evidence'
]);

export const aiCitationSchema = z
  .object({
    entity: aiSafeEntityReferenceSchema,
    sourceKind: z
      .enum(['contract', 'invoice', 'usage', 'customer', 'finding', 'evidence', 'report', 'calculation', 'workspace'])
      .optional(),
    label: z.string().trim().min(1).max(180),
    locator: z.string().trim().min(1).max(180).optional(),
    excerpt: optionalSafeTextSchema
  })
  .strict();

export const aiSuggestedActionSchema = z
  .object({
    label: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(600),
    actionType: z.string().trim().min(1).max(120),
    requiresHumanApproval: z.literal(true),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    target: aiSafeEntityReferenceSchema.optional()
  })
  .strict();

const aiTaskResultEnvelopeShape = {
  taskType: aiTaskTypeSchema,
  status: aiTaskResultStatusSchema,
  summary: shortSafeTextSchema,
  confidence: z.number().min(0).max(1).nullable(),
  citations: z.array(aiCitationSchema).max(20).default([]),
  referencedEntities: z.array(aiSafeEntityReferenceSchema).max(40).default([]),
  warnings: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  suggestedActions: z.array(aiSuggestedActionSchema).max(6).default([]),
  safetyFlags: z.array(aiSafetyFlagSchema).max(12).default([]),
  generatedAt: z.string().datetime()
};

export const aiTaskResultEnvelopeSchema = z.object(aiTaskResultEnvelopeShape).strict();

export type AiTaskResultEnvelope = z.infer<typeof aiTaskResultEnvelopeSchema>;
export type AiTaskResultStatus = z.infer<typeof aiTaskResultStatusSchema>;
export type AiSafetyFlag = z.infer<typeof aiSafetyFlagSchema>;
export type AiCitation = z.infer<typeof aiCitationSchema>;
export type AiSuggestedAction = z.infer<typeof aiSuggestedActionSchema>;

export function aiTaskResultSchemaForTask(taskType: AiTaskType) {
  return z
    .object({
      ...aiTaskResultEnvelopeShape,
      taskType: z.literal(taskType)
    })
    .strict();
}

export function parseAiTaskResult(output: unknown): AiTaskResultEnvelope {
  return aiTaskResultEnvelopeSchema.parse(output);
}
