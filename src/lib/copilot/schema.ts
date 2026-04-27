import { z } from 'zod';
import { uuidSchema } from '../api/schemas';

export const copilotModeSchema = z.enum(['read_only']).default('read_only');

export const copilotRequestSchema = z.object({
  organization_id: uuidSchema,
  thread_id: uuidSchema.optional(),
  message: z.string().trim().min(1).max(2000),
  selected_finding_id: uuidSchema.optional(),
  selected_report_id: uuidSchema.optional(),
  mode: copilotModeSchema.optional().default('read_only')
});

export const copilotToolNameSchema = z.enum([
  'getWorkspaceSummary',
  'getAnalyticsSummary',
  'getFindings',
  'getFindingDetail',
  'checkReportReadiness',
  'detectMissingData',
  'dataMappingAssistant',
  'missingDataDetector',
  'auditReadinessScore',
  'nextBestAction',
  'prepareCfoSummaryData',
  'explainFindingFormulaDeterministic',
  'evidenceQualityReview',
  'evidenceQualityScorer',
  'falsePositiveRiskCheck',
  'falsePositiveCritic',
  'reviewerChecklist',
  'prepareCfoSummary',
  'cfoSummaryGenerator',
  'prepareRecoveryNote',
  'recoveryNoteGenerator',
  'contractHierarchyResolver',
  'rootCauseClassifier',
  'preventionRecommendations'
]);

export const confidenceBucketSchema = z.enum(['low', 'medium', 'high']);

export const copilotActionTypeSchema = z.enum([
  'prepare_run_extraction',
  'prepare_run_reconciliation',
  'prepare_search_evidence',
  'prepare_attach_evidence_candidate',
  'prepare_generate_report_draft',
  'prepare_update_finding_status',
  'prepare_approve_evidence',
  'prepare_assign_reviewer',
  'prepare_recovery_note',
  'prepare_contract_hierarchy_resolution'
]);

export const copilotActionStatusSchema = z.enum([
  'pending',
  'confirmed',
  'executed',
  'cancelled',
  'failed',
  'expired'
]);

export const copilotActionRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const copilotToolBaseInputSchema = z.object({
  organization_id: uuidSchema,
  workspace_id: uuidSchema
});

export const getFindingsInputSchema = copilotToolBaseInputSchema.extend({
  status: z.string().trim().min(1).max(80).optional(),
  customer: uuidSchema.optional(),
  finding_type: z.string().trim().min(1).max(120).optional(),
  min_amount_minor: z.number().int().min(0).optional(),
  outcome_type: z.enum(['recoverable_leakage', 'prevented_future_leakage', 'risk_alert']).optional(),
  confidence_bucket: confidenceBucketSchema.optional(),
  limit: z.number().int().min(1).max(50).optional().default(20)
});

export const getFindingDetailInputSchema = copilotToolBaseInputSchema.extend({
  finding_id: uuidSchema
});

export const optionalFindingInputSchema = copilotToolBaseInputSchema.extend({
  finding_id: uuidSchema.optional()
});

export const explainFindingFormulaInputSchema = getFindingDetailInputSchema;

export const copilotFeatureRouteSchema = z.object({
  method: z.enum(['GET', 'POST']),
  path: z.string().trim().min(1).max(260),
  execution: z.enum(['direct_read_only', 'pending_action_required', 'requires_input']),
  required_role: z.enum(['member', 'reviewer']).nullable()
}).strict();

export const copilotFeatureIntegrationSchema = z.object({
  feature: z.enum([
    'data_mapping',
    'missing_data_detection',
    'audit_readiness',
    'next_best_action',
    'evidence_quality_review',
    'false_positive_review',
    'contract_hierarchy_resolution',
    'recovery_note_draft',
    'cfo_summary_draft',
    'root_cause_classification',
    'prevention_recommendations'
  ]),
  route: copilotFeatureRouteSchema,
  advisory_only: z.literal(true),
  code_calculates_money: z.literal(true),
  human_approval_required: z.literal(true),
  mutating_actions_require_confirmation: z.literal(true),
  customer_facing_rules_preserved: z.literal(true),
  warnings: z.array(z.string().trim().min(1).max(500)).max(12).default([])
}).strict();

export const evidenceQualityReviewSchema = z.object({
  finding_id: uuidSchema,
  strong_evidence: z.array(z.string().trim().min(1).max(240)).max(12),
  weak_evidence: z.array(z.string().trim().min(1).max(240)).max(12),
  conflicting_evidence: z.array(z.string().trim().min(1).max(240)).max(12),
  needs_more_evidence: z.array(z.string().trim().min(1).max(240)).max(12),
  overall: z.enum(['strong_evidence', 'weak_evidence', 'conflicting_evidence', 'needs_more_evidence']),
  advisory_only: z.literal(true)
}).strict();

export const falsePositiveRiskCheckSchema = z.object({
  finding_id: uuidSchema,
  riskLevel: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string().trim().min(1).max(260)).max(12),
  reviewer_checklist: z.array(z.string().trim().min(1).max(260)).max(12),
  recommended_next_step: z.string().trim().min(1).max(500),
  advisory_only: z.literal(true)
}).strict();

export const reviewerChecklistSchema = z.object({
  finding_id: uuidSchema,
  verify_before_approving: z.array(z.string().trim().min(1).max(260)).max(12),
  required_evidence: z.array(z.string().trim().min(1).max(260)).max(12),
  blocks_customer_ready: z.array(z.string().trim().min(1).max(260)).max(12),
  advisory_only: z.literal(true)
}).strict();

export const cfoSummarySchema = z.object({
  workspace_id: uuidSchema,
  currency: z.string().trim().min(1).max(12),
  customer_facing: z.object({
    total_leakage_minor: z.number().int(),
    recoverable_leakage_minor: z.number().int(),
    prevented_leakage_minor: z.number().int(),
    recovered_amount_minor: z.number().int()
  }).strict(),
  internal_pipeline: z.object({
    unapproved_exposure_minor: z.number().int(),
    needs_review_count: z.number().int().min(0),
    finding_count: z.number().int().min(0)
  }).strict(),
  top_categories: z.array(z.unknown()).max(5),
  top_customers: z.array(z.unknown()).max(5),
  readiness_warnings: z.array(z.string().trim().min(1).max(260)).max(12),
  advisory_only: z.literal(true)
}).strict();

export const recoveryNoteDraftSchema = z.object({
  finding_id: uuidSchema,
  internal_note: z.string().trim().min(1).max(1200),
  customer_facing_draft: z.string().trim().min(1).max(1400),
  contract_basis: z.string().trim().min(1).max(600),
  invoice_usage_basis: z.string().trim().min(1).max(600),
  calculation_summary: z.string().trim().min(1).max(600),
  human_review_disclaimer: z.string().trim().min(1).max(400),
  auto_send: z.literal(false),
  advisory_only: z.literal(true)
}).strict();

export const copilotToolRunSchema = z.object({
  tool_name: copilotToolNameSchema,
  input_refs: z.record(z.string(), z.unknown()),
  output_refs: z.record(z.string(), z.unknown())
});

export const copilotAnswerTypeSchema = z.enum([
  'audit_summary',
  'direct_answer',
  'finding_explanation',
  'evidence_review',
  'report_readiness',
  'missing_data',
  'data_mapping',
  'audit_readiness',
  'next_best_action',
  'false_positive_risk',
  'reviewer_checklist',
  'cfo_summary',
  'recovery_note',
  'contract_hierarchy',
  'root_cause',
  'prevention_recommendations'
]);

export const copilotSuggestedActionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  requiresConfirmation: z.boolean(),
  riskLevel: copilotActionRiskLevelSchema
}).strict();

export const copilotActionCardSchema = z.object({
  id: uuidSchema,
  action_type: copilotActionTypeSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(600),
  risk_level: copilotActionRiskLevelSchema,
  required_role: z.enum(['owner', 'admin', 'reviewer']),
  status: copilotActionStatusSchema,
  target_entity_type: z.string().trim().min(1).max(80),
  target_entity_id: uuidSchema.nullable(),
  what_will_change: z.array(z.string().trim().min(1).max(240)).max(8),
  blockers: z.array(z.string().trim().min(1).max(240)).max(8),
  result_summary: z.string().trim().max(500).nullable().default(null),
  expires_at: z.string().datetime().nullable()
}).strict();

export const copilotResponseSchema = z.object({
  mode: z.literal('read_only'),
  thread_id: uuidSchema.nullable(),
  routed_tool_names: z.array(copilotToolNameSchema).min(1),
  answer_type: copilotAnswerTypeSchema.default('direct_answer'),
  answer: z.string().trim().min(1).max(4000),
  data: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
  suggested_actions: z.array(copilotSuggestedActionSchema).max(6).default([]),
  action_cards: z.array(copilotActionCardSchema).max(6).default([]),
  persisted: z.object({
    thread_id: uuidSchema.nullable(),
    user_message_id: uuidSchema.nullable(),
    assistant_message_id: uuidSchema.nullable()
  })
});

export type CopilotRequest = z.infer<typeof copilotRequestSchema>;
export type CopilotMode = z.infer<typeof copilotModeSchema>;
export type CopilotToolName = z.infer<typeof copilotToolNameSchema>;
export type CopilotActionType = z.infer<typeof copilotActionTypeSchema>;
export type CopilotActionStatus = z.infer<typeof copilotActionStatusSchema>;
export type CopilotActionRiskLevel = z.infer<typeof copilotActionRiskLevelSchema>;
export type CopilotToolBaseInput = z.infer<typeof copilotToolBaseInputSchema>;
export type GetFindingsInput = z.input<typeof getFindingsInputSchema>;
export type GetFindingDetailInput = z.infer<typeof getFindingDetailInputSchema>;
export type OptionalFindingInput = z.infer<typeof optionalFindingInputSchema>;
export type ExplainFindingFormulaInput = z.infer<typeof explainFindingFormulaInputSchema>;
export type EvidenceQualityReview = z.infer<typeof evidenceQualityReviewSchema>;
export type FalsePositiveRiskCheck = z.infer<typeof falsePositiveRiskCheckSchema>;
export type ReviewerChecklist = z.infer<typeof reviewerChecklistSchema>;
export type CfoSummary = z.infer<typeof cfoSummarySchema>;
export type RecoveryNoteDraft = z.infer<typeof recoveryNoteDraftSchema>;
export type CopilotToolRun = z.infer<typeof copilotToolRunSchema>;
export type CopilotAnswerType = z.infer<typeof copilotAnswerTypeSchema>;
export type CopilotSuggestedAction = z.infer<typeof copilotSuggestedActionSchema>;
export type CopilotActionCard = z.infer<typeof copilotActionCardSchema>;
export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

export const copilotActionTransitionRequestSchema = z.object({
  organization_id: uuidSchema
});
