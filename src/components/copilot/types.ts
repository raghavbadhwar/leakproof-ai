export type CopilotRole = 'owner' | 'admin' | 'reviewer' | 'member' | 'viewer' | string;

export type CopilotToolName =
  | 'getWorkspaceSummary'
  | 'getAnalyticsSummary'
  | 'getFindings'
  | 'getFindingDetail'
  | 'checkReportReadiness'
  | 'detectMissingData'
  | 'dataMappingAssistant'
  | 'missingDataDetector'
  | 'auditReadinessScore'
  | 'nextBestAction'
  | 'prepareCfoSummaryData'
  | 'explainFindingFormulaDeterministic'
  | 'evidenceQualityReview'
  | 'evidenceQualityScorer'
  | 'falsePositiveRiskCheck'
  | 'falsePositiveCritic'
  | 'reviewerChecklist'
  | 'prepareCfoSummary'
  | 'cfoSummaryGenerator'
  | 'prepareRecoveryNote'
  | 'recoveryNoteGenerator'
  | 'contractHierarchyResolver'
  | 'rootCauseClassifier'
  | 'preventionRecommendations';

export type CopilotAnswerType =
  | 'audit_summary'
  | 'direct_answer'
  | 'finding_explanation'
  | 'evidence_review'
  | 'report_readiness'
  | 'missing_data'
  | 'data_mapping'
  | 'audit_readiness'
  | 'next_best_action'
  | 'false_positive_risk'
  | 'reviewer_checklist'
  | 'cfo_summary'
  | 'recovery_note'
  | 'contract_hierarchy'
  | 'root_cause'
  | 'prevention_recommendations';

export type CopilotSuggestedAction = {
  label: string;
  description: string;
  requiresConfirmation: boolean;
  riskLevel: CopilotRiskLevel;
};

export type CopilotActionType =
  | 'prepare_run_extraction'
  | 'prepare_run_reconciliation'
  | 'prepare_search_evidence'
  | 'prepare_attach_evidence_candidate'
  | 'prepare_generate_report_draft'
  | 'prepare_update_finding_status'
  | 'prepare_approve_evidence'
  | 'prepare_assign_reviewer'
  | 'prepare_recovery_note'
  | 'prepare_contract_hierarchy_resolution';

export type CopilotActionStatus =
  | 'pending'
  | 'confirmed'
  | 'executed'
  | 'cancelled'
  | 'failed'
  | 'expired';

export type CopilotRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type CopilotPendingAction = {
  id: string;
  action_type: CopilotActionType;
  title: string;
  description: string;
  risk_level: CopilotRiskLevel;
  required_role: 'owner' | 'admin' | 'reviewer';
  status: CopilotActionStatus;
  target_entity_type: string;
  target_entity_id: string | null;
  what_will_change: string[];
  blockers: string[];
  result_summary: string | null;
  expires_at: string | null;
};

export type CopilotResponse = {
  mode: 'read_only';
  thread_id: string | null;
  routed_tool_names: CopilotToolName[];
  answer_type: CopilotAnswerType;
  answer: string;
  data: Record<string, unknown>;
  warnings: string[];
  suggested_actions: CopilotSuggestedAction[];
  action_cards: CopilotPendingAction[];
  persisted: {
    thread_id: string | null;
    user_message_id: string | null;
    assistant_message_id: string | null;
  };
};

export type CopilotConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: CopilotResponse;
  error?: string;
};

export type CopilotCitation = {
  label: string;
  href?: string;
  tone?: 'default' | 'approved' | 'warning';
};

export type CopilotActionCardData = {
  id: string;
  title: string;
  value?: string;
  detail?: string;
  href?: string;
  label?: string;
  tone?: 'default' | 'good' | 'warning' | 'danger' | 'muted';
  pendingAction?: CopilotPendingAction;
};

export type CopilotActionTransitionResponse = {
  action: CopilotPendingAction;
  message: string;
  result?: {
    status: 'executed' | 'failed';
    summary: string;
    refs?: Record<string, unknown>;
  };
};
