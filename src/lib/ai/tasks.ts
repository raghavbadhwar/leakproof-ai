import { z } from 'zod';
import type { OrganizationRole } from '../db/roles';
import { aiTaskResultSchemaForTask } from './resultSchema';
import { aiTaskTypeSchema, type AiTaskType } from './taskTypes';

export const AI_ALLOWED_INPUT_REFERENCES = [
  'organization',
  'workspace',
  'source_document',
  'document_chunk',
  'customer',
  'contract_term',
  'invoice_row_ref',
  'usage_row_ref',
  'finding',
  'evidence_item',
  'evidence_candidate',
  'report',
  'reconciliation_run',
  'analytics_snapshot',
  'human_review_state',
  'field_map',
  'safe_metric'
] as const;

export const aiInputReferenceSchema = z.enum(AI_ALLOWED_INPUT_REFERENCES);

export type AiAllowedInputReference = (typeof AI_ALLOWED_INPUT_REFERENCES)[number];

export const AI_FORBIDDEN_DATA = [
  'raw_contract_text',
  'raw_invoice_contents',
  'raw_usage_rows',
  'raw_prompts',
  'full_model_responses',
  'embeddings',
  'api_keys',
  'auth_tokens',
  'secrets',
  'storage_paths',
  'file_names',
  'customer_pii',
  'customer_emails',
  'customer_domains'
] as const;

export type AiForbiddenData = (typeof AI_FORBIDDEN_DATA)[number];

export type AiTaskDefinition = {
  taskType: AiTaskType;
  name: string;
  purpose: string;
  allowedInputReferences: readonly AiAllowedInputReference[];
  forbiddenData: readonly AiForbiddenData[];
  expectedOutputSchema: z.ZodType;
  readOnly: boolean;
  canCreatePendingActions: boolean;
  requiredRole: OrganizationRole | null;
};

const COMMON_FORBIDDEN_DATA = AI_FORBIDDEN_DATA;

export const AI_TASK_REGISTRY = {
  data_mapping: defineTask({
    taskType: 'data_mapping',
    name: 'Data mapping',
    purpose: 'Suggest safe mappings between uploaded source references and LeakProof audit fields without reading or storing raw rows.',
    allowedInputReferences: ['organization', 'workspace', 'source_document', 'customer', 'field_map', 'human_review_state'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: 'reviewer'
  }),
  missing_data_detection: defineTask({
    taskType: 'missing_data_detection',
    name: 'Missing data detection',
    purpose: 'Identify missing contract, invoice, usage, customer, or evidence references needed for deterministic review.',
    allowedInputReferences: ['organization', 'workspace', 'source_document', 'customer', 'finding', 'analytics_snapshot', 'safe_metric'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: null
  }),
  audit_readiness: defineTask({
    taskType: 'audit_readiness',
    name: 'Audit readiness',
    purpose: 'Explain whether a workspace has enough approved evidence and deterministic outputs for human review.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_item', 'report', 'analytics_snapshot', 'human_review_state'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: null
  }),
  evidence_quality_review: defineTask({
    taskType: 'evidence_quality_review',
    name: 'Evidence quality review',
    purpose: 'Critique approved evidence coverage and gaps for a finding without approving evidence or changing status.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_item', 'contract_term', 'invoice_row_ref', 'usage_row_ref'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: 'reviewer'
  }),
  false_positive_review: defineTask({
    taskType: 'false_positive_review',
    name: 'False-positive review',
    purpose: 'Flag possible false-positive reasons and reviewer checks using safe finding and evidence references.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_item', 'contract_term', 'reconciliation_run'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: 'reviewer'
  }),
  contract_hierarchy_resolution: defineTask({
    taskType: 'contract_hierarchy_resolution',
    name: 'Contract hierarchy resolution',
    purpose: 'Suggest which referenced contract terms may govern conflicts while leaving final hierarchy decisions to a human reviewer.',
    allowedInputReferences: ['organization', 'workspace', 'customer', 'contract_term', 'source_document', 'document_chunk', 'human_review_state'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: 'reviewer'
  }),
  recovery_note_draft: defineTask({
    taskType: 'recovery_note_draft',
    name: 'Recovery note draft',
    purpose: 'Draft internal and customer-facing recovery-note language from deterministic findings for human review only.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_item', 'contract_term', 'safe_metric', 'human_review_state'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: true,
    requiredRole: 'reviewer'
  }),
  cfo_summary_draft: defineTask({
    taskType: 'cfo_summary_draft',
    name: 'CFO summary draft',
    purpose: 'Draft a safe executive summary that separates customer-facing leakage from internal unapproved exposure.',
    allowedInputReferences: ['organization', 'workspace', 'report', 'analytics_snapshot', 'safe_metric', 'human_review_state'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: true,
    requiredRole: 'reviewer'
  }),
  root_cause_classification: defineTask({
    taskType: 'root_cause_classification',
    name: 'Root-cause classification',
    purpose: 'Classify likely leakage causes using deterministic finding types and safe evidence references.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_item', 'reconciliation_run', 'safe_metric'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: 'reviewer'
  }),
  next_best_action: defineTask({
    taskType: 'next_best_action',
    name: 'Next best action',
    purpose: 'Suggest the next reviewer action with blockers and required human confirmation for any mutation.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_candidate', 'evidence_item', 'report', 'human_review_state'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: true,
    requiredRole: 'reviewer'
  }),
  reviewer_checklist: defineTask({
    taskType: 'reviewer_checklist',
    name: 'Reviewer checklist',
    purpose: 'Create a checklist of human verification steps before approval, customer-ready marking, or report use.',
    allowedInputReferences: ['organization', 'workspace', 'finding', 'evidence_item', 'contract_term', 'invoice_row_ref', 'usage_row_ref'],
    forbiddenData: COMMON_FORBIDDEN_DATA,
    readOnly: true,
    canCreatePendingActions: false,
    requiredRole: 'reviewer'
  })
} as const satisfies Record<AiTaskType, AiTaskDefinition>;

export function getAiTaskDefinition(taskType: AiTaskType): AiTaskDefinition {
  return AI_TASK_REGISTRY[taskType];
}

export function parseAiTaskType(value: unknown): AiTaskType {
  return aiTaskTypeSchema.parse(value);
}

function defineTask(input: Omit<AiTaskDefinition, 'expectedOutputSchema'>): AiTaskDefinition {
  return {
    ...input,
    expectedOutputSchema: aiTaskResultSchemaForTask(input.taskType)
  };
}
