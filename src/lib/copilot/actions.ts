import { ADMIN_ROLES, assertRoleAllowed, REVIEWER_WRITE_ROLES, type OrganizationRole } from '../db/roles';
import { assertValidFindingStatusTransition } from '../api/status';
import { sanitizeOperationalErrorMessage } from '../audit/auditEvents';
import { writeAuditEvent } from '../db/audit';
import { citationForEvidenceCandidate, evidenceTypeForSourceDocument, isEvidenceCandidateExportReady } from '../evidence/candidates';
import { exportBlockerForFinding, exportCitationForEvidenceRow } from '../evidence/exportReadiness';
import { CUSTOMER_FACING_REPORT_STATUSES, generateExecutiveAuditReport, type ReportCitation, type ReportFinding } from '../evidence/report';
import { redactCopilotOutput, redactSafeText } from './redaction';
import type { CopilotDataContext, CopilotSupabaseClient } from './context';
import type {
  CopilotActionCard,
  CopilotActionRiskLevel,
  CopilotActionStatus,
  CopilotActionType
} from './schema';

type ActionPolicy = {
  requiredRoles: readonly OrganizationRole[];
  requiredRole: 'owner' | 'admin' | 'reviewer';
  riskLevel: CopilotActionRiskLevel;
  title: string;
  description: string;
};

export type CopilotActionIntent = {
  actionType: CopilotActionType;
  targetEntityType: string;
  targetEntityId: string | null;
  payloadRefs?: Record<string, unknown>;
};

export type PendingCopilotActionProposal = CopilotActionIntent & {
  organizationId: string;
  workspaceId: string;
  title: string;
  description: string;
  riskLevel: CopilotActionRiskLevel;
  requiredRole: 'owner' | 'admin' | 'reviewer';
  payloadRefs: Record<string, unknown>;
  preview: {
    what_will_change: string[];
    blockers: string[];
  };
  expiresAt: string;
};

export type AssistantActionRecord = {
  id: string;
  organization_id: string;
  workspace_id: string;
  thread_id: string | null;
  message_id: string | null;
  action_type: CopilotActionType;
  target_entity_type: string;
  target_entity_id: string | null;
  status: CopilotActionStatus;
  risk_level: CopilotActionRiskLevel;
  required_role: 'owner' | 'admin' | 'reviewer';
  payload_refs: Record<string, unknown>;
  preview: Record<string, unknown>;
  proposed_by: string | null;
  confirmed_by: string | null;
  cancelled_by: string | null;
  executed_by?: string | null;
  result_summary?: string | null;
  result_refs?: Record<string, unknown>;
  failure_code?: string | null;
  expires_at: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  executed_at?: string | null;
};

export type CopilotActionExecutionResult = {
  status: 'executed' | 'failed';
  summary: string;
  refs: Record<string, unknown>;
};

export type CopilotActionExecutionOutcome = {
  action: AssistantActionRecord;
  result: CopilotActionExecutionResult;
};

export type CopilotWorkflowRunners = {
  runExtraction?: (input: { organizationId: string; workspaceId: string; sourceDocumentId: string }) => Promise<unknown>;
  runReconciliation?: (input: { organizationId: string; workspaceId: string }) => Promise<unknown>;
  generateReportDraft?: (input: { organizationId: string; workspaceId: string }) => Promise<unknown>;
};

export const COPILOT_ACTION_POLICIES: Record<CopilotActionType, ActionPolicy> = {
  prepare_run_extraction: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'medium',
    title: 'Prepare extraction run',
    description: 'Prepare a confirmation to run contract extraction for this workspace.'
  },
  prepare_run_reconciliation: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'high',
    title: 'Prepare reconciliation run',
    description: 'Prepare a confirmation to run deterministic reconciliation for this workspace.'
  },
  prepare_search_evidence: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'low',
    title: 'Prepare evidence search',
    description: 'Prepare a confirmation to search for supporting evidence references.'
  },
  prepare_attach_evidence_candidate: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'medium',
    title: 'Prepare evidence candidate attachment',
    description: 'Prepare a confirmation to attach an evidence candidate to a finding.'
  },
  prepare_generate_report_draft: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'high',
    title: 'Prepare report draft',
    description: 'Prepare a confirmation to generate a report draft from approved findings and evidence.'
  },
  prepare_update_finding_status: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'high',
    title: 'Prepare finding status update',
    description: 'Prepare a confirmation to update a finding status without changing its amount.'
  },
  prepare_approve_evidence: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'high',
    title: 'Prepare evidence approval',
    description: 'Prepare a confirmation to approve evidence for review workflow use.'
  },
  prepare_assign_reviewer: {
    requiredRoles: ADMIN_ROLES,
    requiredRole: 'admin',
    riskLevel: 'medium',
    title: 'Prepare reviewer assignment',
    description: 'Prepare a confirmation to assign a reviewer.'
  },
  prepare_recovery_note: {
    requiredRoles: REVIEWER_WRITE_ROLES,
    requiredRole: 'reviewer',
    riskLevel: 'medium',
    title: 'Prepare recovery note',
    description: 'Prepare a confirmation to add a recovery workflow note.'
  }
};

export function detectCopilotActionIntent(input: {
  message: string;
  selectedFindingId?: string;
  selectedReportId?: string;
}): CopilotActionIntent | null {
  const normalized = input.message.toLowerCase();
  const firstUuid = input.message.match(UUID_PATTERN_GLOBAL)?.[0] ?? null;
  if (/\b(run|start|rerun)\b.*\b(extraction|extract)\b/.test(normalized)) {
    return {
      actionType: 'prepare_run_extraction',
      targetEntityType: firstUuid ? 'document' : 'workspace',
      targetEntityId: firstUuid,
      payloadRefs: firstUuid ? { source_document_id: firstUuid } : {}
    };
  }
  if (/\b(run|start|rerun)\b.*\b(reconciliation|reconcile)\b/.test(normalized)) {
    return { actionType: 'prepare_run_reconciliation', targetEntityType: 'workspace', targetEntityId: null };
  }
  if (/\b(attach|link)\b.*\b(evidence|candidate|citation)\b/.test(normalized)) {
    return {
      actionType: 'prepare_attach_evidence_candidate',
      targetEntityType: 'evidence_candidate',
      targetEntityId: firstUuid,
      payloadRefs: { evidence_candidate_id: firstUuid, finding_id: input.selectedFindingId }
    };
  }
  if (/\b(search|find|attach|look for)\b.*\b(evidence|citation)\b/.test(normalized)) {
    return { actionType: 'prepare_search_evidence', targetEntityType: input.selectedFindingId ? 'finding' : 'workspace', targetEntityId: input.selectedFindingId ?? null };
  }
  if (/\b(generate|prepare|create|draft)\b.*\b(report)\b/.test(normalized)) {
    return { actionType: 'prepare_generate_report_draft', targetEntityType: input.selectedReportId ? 'report' : 'workspace', targetEntityId: input.selectedReportId ?? null };
  }
  if (/\b(approve|mark|change|update)\b.*\b(finding|status|customer ready|customer-ready)\b/.test(normalized)) {
    return {
      actionType: 'prepare_update_finding_status',
      targetEntityType: 'finding',
      targetEntityId: input.selectedFindingId ?? firstUuid,
      payloadRefs: { proposed_status: proposedFindingStatus(normalized) }
    };
  }
  if (/\b(approve|accept)\b.*\b(evidence|citation)\b/.test(normalized)) {
    return {
      actionType: 'prepare_approve_evidence',
      targetEntityType: firstUuid ? 'evidence_candidate' : input.selectedFindingId ? 'finding' : 'evidence',
      targetEntityId: firstUuid ?? input.selectedFindingId ?? null,
      payloadRefs: {
        evidence_candidate_id: firstUuid,
        finding_id: input.selectedFindingId
      }
    };
  }
  if (/\b(assign|reassign)\b.*\b(reviewer|owner|admin)\b/.test(normalized)) {
    return {
      actionType: 'prepare_assign_reviewer',
      targetEntityType: input.selectedFindingId ? 'finding' : 'workspace',
      targetEntityId: input.selectedFindingId ?? null,
      payloadRefs: { reviewer_user_id: firstUuid }
    };
  }
  if (/\b(add|save|record|persist)\b.*\b(recovery|recover|collection|follow[- ]?up)\b.*\b(note|memo|comment)\b/.test(normalized)) {
    return { actionType: 'prepare_recovery_note', targetEntityType: input.selectedFindingId ? 'finding' : 'workspace', targetEntityId: input.selectedFindingId ?? null };
  }
  return null;
}

export function buildPendingCopilotActionProposal(input: {
  context: CopilotDataContext;
  intent: CopilotActionIntent;
  actorRole: OrganizationRole;
  expiresAt?: string;
}): PendingCopilotActionProposal {
  const policy = policyForAction(input.intent.actionType);
  assertRoleAllowed(input.actorRole, policy.requiredRoles);
  const blockers = actionBlockers(input.context, input.intent);
  const targetId = input.intent.targetEntityId ?? (input.intent.targetEntityType === 'workspace' ? input.context.workspace.id : null);

  return {
    ...input.intent,
    organizationId: input.context.organization.id,
    workspaceId: input.context.workspace.id,
    targetEntityId: targetId,
    title: policy.title,
    description: policy.description,
    riskLevel: policy.riskLevel,
    requiredRole: policy.requiredRole,
    payloadRefs: sanitizeActionPayloadRefs({
      action_type: input.intent.actionType,
      target_entity_type: input.intent.targetEntityType,
      target_entity_id: targetId,
      workspace_id: input.context.workspace.id,
      proposed_status: input.intent.actionType === 'prepare_update_finding_status' ? input.intent.payloadRefs?.proposed_status ?? 'approved' : undefined,
      ...input.intent.payloadRefs,
      execution_deferred: true
    }),
    preview: {
      what_will_change: whatWillChange(input.intent.actionType),
      blockers
    },
    expiresAt: input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}

export async function insertPendingCopilotAction(
  supabase: CopilotSupabaseClient,
  input: {
    proposal: PendingCopilotActionProposal;
    threadId: string;
    messageId: string;
    actorUserId: string;
  }
): Promise<AssistantActionRecord> {
  const { data, error } = await supabase
    .from('assistant_actions')
    .insert({
      organization_id: input.proposal.organizationId,
      workspace_id: input.proposal.workspaceId,
      thread_id: input.threadId,
      message_id: input.messageId,
      action_type: input.proposal.actionType,
      target_entity_type: input.proposal.targetEntityType,
      target_entity_id: input.proposal.targetEntityId,
      status: 'pending',
      risk_level: input.proposal.riskLevel,
      required_role: input.proposal.requiredRole,
      proposed_by: input.actorUserId,
      payload_refs: sanitizeActionPayloadRefs(input.proposal.payloadRefs),
      preview: sanitizeActionPayloadRefs({
        title: input.proposal.title,
        description: input.proposal.description,
        what_will_change: input.proposal.preview.what_will_change,
        blockers: input.proposal.preview.blockers
      }),
      expires_at: input.proposal.expiresAt
    })
    .select(ACTION_SELECT_COLUMNS)
    .single();

  if (error || !isAssistantActionRecord(data)) throw error ?? new Error('assistant_action_insert_failed');
  return data;
}

export async function loadAssistantAction(
  supabase: CopilotSupabaseClient,
  input: { organizationId: string; workspaceId: string; actionId: string }
): Promise<AssistantActionRecord> {
  const { data, error } = await supabase
    .from('assistant_actions')
    .select(ACTION_SELECT_COLUMNS)
    .eq('id', input.actionId)
    .eq('organization_id', input.organizationId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();

  if (error || !isAssistantActionRecord(data)) throw new Error('forbidden');
  return data;
}

export async function confirmPendingCopilotAction(
  supabase: CopilotSupabaseClient,
  input: { action: AssistantActionRecord; actorUserId: string; actorRole: OrganizationRole; now?: Date }
): Promise<AssistantActionRecord> {
  assertCanConfirmCopilotAction(input.action, input.actorRole, input.now);
  const { data, error } = await supabase
    .from('assistant_actions')
    .update({
      status: 'confirmed',
      confirmed_by: input.actorUserId,
      confirmed_at: (input.now ?? new Date()).toISOString()
    })
    .eq('id', input.action.id)
    .eq('status', 'pending')
    .select(ACTION_SELECT_COLUMNS)
    .single();

  if (error || !isAssistantActionRecord(data)) throw error ?? new Error('assistant_action_confirm_failed');
  return data;
}

export async function cancelPendingCopilotAction(
  supabase: CopilotSupabaseClient,
  input: { action: AssistantActionRecord; actorUserId: string; actorRole: OrganizationRole; now?: Date }
): Promise<AssistantActionRecord> {
  assertCanConfirmCopilotAction(input.action, input.actorRole, input.now);
  const { data, error } = await supabase
    .from('assistant_actions')
    .update({
      status: 'cancelled',
      cancelled_by: input.actorUserId,
      cancelled_at: (input.now ?? new Date()).toISOString()
    })
    .eq('id', input.action.id)
    .eq('status', 'pending')
    .select(ACTION_SELECT_COLUMNS)
    .single();

  if (error || !isAssistantActionRecord(data)) throw error ?? new Error('assistant_action_cancel_failed');
  return data;
}

export async function executeConfirmedCopilotAction(
  supabase: CopilotSupabaseClient,
  input: {
    action: AssistantActionRecord;
    actorUserId: string;
    actorRole: OrganizationRole;
    runners?: CopilotWorkflowRunners;
    now?: Date;
  }
): Promise<CopilotActionExecutionOutcome> {
  assertCanExecuteCopilotAction(input.action, input.actorRole);

  try {
    const result = await executeActionByType(supabase, input);
    const executed = await markCopilotActionExecuted(supabase, {
      action: input.action,
      actorUserId: input.actorUserId,
      result,
      now: input.now
    });

    await writeAuditEvent(supabase as never, {
      organizationId: input.action.organization_id,
      actorUserId: input.actorUserId,
      eventType: 'copilot.action_executed',
      entityType: 'assistant_action',
      entityId: input.action.id,
      metadata: {
        action_type: input.action.action_type,
        risk_level: input.action.risk_level,
        result_summary: result.summary
      }
    });

    return { action: executed, result };
  } catch (error) {
    const failureSummary = sanitizeOperationalErrorMessage(error, 'Copilot action execution failed.');
    const failed = await markCopilotActionFailed(supabase, {
      action: input.action,
      actorUserId: input.actorUserId,
      summary: failureSummary,
      now: input.now
    });

    await writeAuditEvent(supabase as never, {
      organizationId: input.action.organization_id,
      actorUserId: input.actorUserId,
      eventType: 'copilot.action_failed',
      entityType: 'assistant_action',
      entityId: input.action.id,
      metadata: {
        action_type: input.action.action_type,
        risk_level: input.action.risk_level,
        reason: failureSummary
      }
    });

    return {
      action: failed,
      result: {
        status: 'failed',
        summary: failureSummary,
        refs: {}
      }
    };
  }
}

export function assertCanConfirmCopilotAction(
  action: AssistantActionRecord,
  actorRole: OrganizationRole,
  now: Date = new Date()
): void {
  assertRoleAllowed(actorRole, policyForAction(action.action_type).requiredRoles);
  if (action.status !== 'pending') throw new Error('action_not_pending');
  if (action.expires_at && Date.parse(action.expires_at) <= now.getTime()) throw new Error('action_expired');
  if (actionCardFromRecord(action).blockers.length > 0) throw new Error('action_blocked');
}

export function assertCanExecuteCopilotAction(action: AssistantActionRecord, actorRole: OrganizationRole): void {
  assertRoleAllowed(actorRole, policyForAction(action.action_type).requiredRoles);
  if (action.status !== 'confirmed') throw new Error('action_not_confirmed');
}

async function executeActionByType(
  supabase: CopilotSupabaseClient,
  input: {
    action: AssistantActionRecord;
    actorUserId: string;
    actorRole: OrganizationRole;
    runners?: CopilotWorkflowRunners;
  }
): Promise<CopilotActionExecutionResult> {
  const action = input.action;
  if (action.action_type === 'prepare_run_extraction') {
    return executeRunExtraction(action, input.runners);
  }
  if (action.action_type === 'prepare_run_reconciliation') {
    return executeRunReconciliation(action, input.runners);
  }
  if (action.action_type === 'prepare_search_evidence') {
    return executeSearchEvidence(supabase, action);
  }
  if (action.action_type === 'prepare_attach_evidence_candidate') {
    return executeAttachEvidenceCandidate(supabase, action, input.actorUserId);
  }
  if (action.action_type === 'prepare_approve_evidence') {
    return executeApproveEvidence(supabase, action, input.actorUserId);
  }
  if (action.action_type === 'prepare_update_finding_status') {
    return executeUpdateFindingStatus(supabase, action, input.actorUserId);
  }
  if (action.action_type === 'prepare_assign_reviewer') {
    return executeAssignReviewer(supabase, action, input.actorUserId);
  }
  if (action.action_type === 'prepare_generate_report_draft') {
    return executeGenerateReportDraft(supabase, action, input.actorUserId, input.runners);
  }

  throw new Error('unsupported_copilot_action');
}

async function executeRunExtraction(action: AssistantActionRecord, runners?: CopilotWorkflowRunners): Promise<CopilotActionExecutionResult> {
  const sourceDocumentId = stringPayload(action.payload_refs, 'source_document_id') ?? action.target_entity_id;
  if (!sourceDocumentId) throw new Error('source_document_id_required');
  if (!runners?.runExtraction) throw new Error('copilot_runner_unavailable');

  const payload = await runners.runExtraction({
    organizationId: action.organization_id,
    workspaceId: action.workspace_id,
    sourceDocumentId
  });
  const record = isRecord(payload) ? payload : {};
  const terms = Array.isArray(record.terms) ? record.terms : [];

  return executedResult(`Extraction completed with ${terms.length} term reference${terms.length === 1 ? '' : 's'} created.`, {
    run_id: stringPayload(record, 'run_id'),
    source_document_id: sourceDocumentId,
    terms_created: terms.length
  });
}

async function executeRunReconciliation(action: AssistantActionRecord, runners?: CopilotWorkflowRunners): Promise<CopilotActionExecutionResult> {
  if (!runners?.runReconciliation) throw new Error('copilot_runner_unavailable');

  const payload = await runners.runReconciliation({
    organizationId: action.organization_id,
    workspaceId: action.workspace_id
  });
  const record = isRecord(payload) ? payload : {};
  const findings = Array.isArray(record.findings) ? record.findings : [];

  return executedResult(`Reconciliation completed with ${findings.length} finding reference${findings.length === 1 ? '' : 's'} created.`, {
    run_id: stringPayload(record, 'run_id'),
    findings_created: findings.length,
    deep_link: '/app/findings'
  });
}

async function executeSearchEvidence(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord
): Promise<CopilotActionExecutionResult> {
  const findingId = stringPayload(action.payload_refs, 'finding_id') ?? (action.target_entity_type === 'finding' ? action.target_entity_id : null);
  let query = supabase
    .from('evidence_candidates')
    .select('id')
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id);
  if (findingId) query = query.eq('finding_id', findingId);
  const { data, error } = await query;
  if (error) throw error;
  const count = Array.isArray(data) ? data.length : 0;

  return executedResult(`Evidence search found ${count} candidate reference${count === 1 ? '' : 's'}.`, {
    candidate_count: count,
    finding_id: findingId,
    deep_link: '/app/evidence'
  });
}

async function executeAttachEvidenceCandidate(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string
): Promise<CopilotActionExecutionResult> {
  const findingId = requiredPayload(action.payload_refs, 'finding_id');
  const documentChunkId = requiredPayload(action.payload_refs, 'document_chunk_id');
  const retrievalScore = numberPayload(action.payload_refs, 'retrieval_score') ?? 1;
  const relevanceExplanation = stringPayload(action.payload_refs, 'relevance_explanation');
  await assertFindingAndChunkBelongToWorkspace(supabase, {
    organizationId: action.organization_id,
    workspaceId: action.workspace_id,
    findingId,
    documentChunkId
  });

  const { data, error } = await supabase
    .from('evidence_candidates')
    .insert({
      organization_id: action.organization_id,
      workspace_id: action.workspace_id,
      finding_id: findingId,
      document_chunk_id: documentChunkId,
      retrieval_score: retrievalScore,
      relevance_explanation: relevanceExplanation
    })
    .select('id, finding_id, document_chunk_id')
    .single();
  if (error || !isRecord(data) || typeof data.id !== 'string') throw error ?? new Error('evidence_candidate_attach_failed');

  await writeAuditEvent(supabase as never, {
    organizationId: action.organization_id,
    actorUserId,
    eventType: 'evidence_candidate.attached',
    entityType: 'evidence_candidate',
    entityId: data.id,
    metadata: {
      finding_id: findingId,
      document_chunk_id: documentChunkId,
      source: 'copilot_action'
    }
  });

  return executedResult('Evidence candidate attached for review. Evidence was not approved automatically.', {
    evidence_candidate_id: data.id,
    finding_id: findingId,
    deep_link: '/app/evidence'
  });
}

async function executeApproveEvidence(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string
): Promise<CopilotActionExecutionResult> {
  const candidateId = stringPayload(action.payload_refs, 'evidence_candidate_id') ?? (action.target_entity_type === 'evidence_candidate' ? action.target_entity_id : null);
  const evidenceItemId = stringPayload(action.payload_refs, 'evidence_item_id') ?? (action.target_entity_type === 'evidence_item' ? action.target_entity_id : null);
  if (candidateId) return approveEvidenceCandidate(supabase, action, actorUserId, candidateId);
  if (evidenceItemId) return approveEvidenceItem(supabase, action, actorUserId, evidenceItemId);
  throw new Error('evidence_reference_required');
}

async function executeUpdateFindingStatus(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string
): Promise<CopilotActionExecutionResult> {
  const findingId = action.target_entity_type === 'finding' ? action.target_entity_id : stringPayload(action.payload_refs, 'finding_id');
  const proposedStatus = requiredPayload(action.payload_refs, 'proposed_status');
  if (!findingId) throw new Error('finding_id_required');
  const { data: finding, error } = await supabase
    .from('leakage_findings')
    .select('id, status, workspace_id, outcome_type, calculation')
    .eq('id', findingId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('is_active', true)
    .single();
  if (error || !isRecord(finding)) throw error ?? new Error('forbidden');

  const transition = assertValidFindingStatusTransition(String(finding.status), proposedStatus);
  if (['approved', 'customer_ready', 'recovered'].includes(transition.to)) {
    await assertFindingHasRequiredApprovedEvidence(supabase, {
      organizationId: action.organization_id,
      workspaceId: action.workspace_id,
      findingId,
      status: transition.to,
      outcomeType: String(finding.outcome_type),
      calculation: isRecord(finding.calculation) ? finding.calculation : {}
    });
  }

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('leakage_findings')
    .update({
      status: transition.to,
      reviewer_user_id: actorUserId,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt
    })
    .eq('id', findingId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('is_active', true);
  if (updateError) throw updateError;

  await writeAuditEvent(supabase as never, {
    organizationId: action.organization_id,
    actorUserId,
    eventType: transition.to === 'approved' ? 'finding.approved' : 'finding.status_changed',
    entityType: 'leakage_finding',
    entityId: findingId,
    metadata: {
      from_status: transition.from,
      to_status: transition.to,
      source: 'copilot_action'
    }
  });

  return executedResult(`Finding status updated to ${transition.to}. The finding amount and calculation were not changed.`, {
    finding_id: findingId,
    from_status: transition.from,
    to_status: transition.to,
    deep_link: `/app/findings/${findingId}`
  });
}

async function executeAssignReviewer(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string
): Promise<CopilotActionExecutionResult> {
  const findingId = action.target_entity_type === 'finding' ? action.target_entity_id : stringPayload(action.payload_refs, 'finding_id');
  const reviewerUserId = requiredPayload(action.payload_refs, 'reviewer_user_id');
  if (!findingId) throw new Error('finding_id_required');

  const { data: currentFinding, error: findingError } = await supabase
    .from('leakage_findings')
    .select('id, reviewer_user_id')
    .eq('id', findingId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('is_active', true)
    .single();
  if (findingError || !isRecord(currentFinding)) throw findingError ?? new Error('forbidden');

  const { data: reviewer, error: reviewerError } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', action.organization_id)
    .eq('user_id', reviewerUserId)
    .in('role', ['owner', 'admin', 'reviewer'])
    .maybeSingle();
  if (reviewerError || !reviewer) throw new Error('forbidden');

  const { error: updateError } = await supabase
    .from('leakage_findings')
    .update({ reviewer_user_id: reviewerUserId, updated_at: new Date().toISOString() })
    .eq('id', findingId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('is_active', true);
  if (updateError) throw updateError;

  await writeAuditEvent(supabase as never, {
    organizationId: action.organization_id,
    actorUserId,
    eventType: 'finding_assigned',
    entityType: 'leakage_finding',
    entityId: findingId,
    metadata: {
      from_reviewer_user_id: currentFinding.reviewer_user_id,
      to_reviewer_user_id: reviewerUserId,
      source: 'copilot_action'
    }
  });

  return executedResult('Reviewer assignment updated.', {
    finding_id: findingId,
    reviewer_user_id: reviewerUserId,
    deep_link: `/app/findings/${findingId}`
  });
}

async function executeGenerateReportDraft(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string,
  runners?: CopilotWorkflowRunners
): Promise<CopilotActionExecutionResult> {
  if (runners?.generateReportDraft) {
    const payload = await runners.generateReportDraft({
      organizationId: action.organization_id,
      workspaceId: action.workspace_id
    });
    const record = isRecord(payload) ? payload : {};
    const report = isRecord(record.report) ? record.report : {};
    const includedFindings = Array.isArray(report.includedFindings) ? report.includedFindings : [];
    return executedResult(`Report draft generated with ${includedFindings.length} included finding reference${includedFindings.length === 1 ? '' : 's'}.`, {
      evidence_pack_id: stringPayload(record, 'evidence_pack_id'),
      included_findings_count: includedFindings.length,
      deep_link: '/app/reports'
    });
  }

  return generateReportDraftDirect(supabase, action, actorUserId);
}

async function approveEvidenceCandidate(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string,
  candidateId: string
): Promise<CopilotActionExecutionResult> {
  const { data: candidate, error } = await supabase
    .from('evidence_candidates')
    .select('id, workspace_id, finding_id, document_chunk_id, retrieval_score, relevance_explanation, approval_state, attached_evidence_item_id, document_chunks(source_label, content, source_documents(document_type))')
    .eq('id', candidateId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .single();
  if (error || !isRecord(candidate)) throw error ?? new Error('forbidden');
  if (candidate.approval_state === 'rejected') throw new Error('evidence_rejected');
  await assertFindingExists(supabase, action.organization_id, action.workspace_id, String(candidate.finding_id));

  const reviewedAt = new Date().toISOString();
  const evidenceItemId = typeof candidate.attached_evidence_item_id === 'string'
    ? candidate.attached_evidence_item_id
    : await createEvidenceItemFromCandidate(supabase, action, candidate, actorUserId, reviewedAt);

  const { error: updateError } = await supabase
    .from('evidence_candidates')
    .update({
      approval_state: 'approved',
      attached_evidence_item_id: evidenceItemId,
      attached_at: reviewedAt,
      reviewed_by: actorUserId,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt
    })
    .eq('id', candidateId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id);
  if (updateError) throw updateError;

  const { error: findingError } = await supabase
    .from('leakage_findings')
    .update({ evidence_coverage_status: 'complete', updated_at: reviewedAt })
    .eq('id', String(candidate.finding_id))
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('is_active', true);
  if (findingError) throw findingError;

  await writeAuditEvent(supabase as never, {
    organizationId: action.organization_id,
    actorUserId,
    eventType: 'evidence_candidate.approved',
    entityType: 'evidence_candidate',
    entityId: candidateId,
    metadata: {
      finding_id: candidate.finding_id,
      source: 'copilot_action'
    }
  });

  return executedResult('Evidence candidate approved and attached to the finding.', {
    evidence_candidate_id: candidateId,
    evidence_item_id: evidenceItemId,
    finding_id: candidate.finding_id,
    deep_link: '/app/evidence'
  });
}

async function approveEvidenceItem(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string,
  evidenceItemId: string
): Promise<CopilotActionExecutionResult> {
  const { data: evidence, error } = await supabase
    .from('evidence_items')
    .select('id, workspace_id, finding_id, approval_state')
    .eq('id', evidenceItemId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .single();
  if (error || !isRecord(evidence)) throw error ?? new Error('forbidden');
  if (evidence.approval_state === 'rejected') throw new Error('evidence_rejected');
  await assertFindingExists(supabase, action.organization_id, action.workspace_id, String(evidence.finding_id));

  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('evidence_items')
    .update({ approval_state: 'approved', reviewed_by: actorUserId, reviewed_at: reviewedAt })
    .eq('id', evidenceItemId)
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('finding_id', String(evidence.finding_id));
  if (updateError) throw updateError;

  await writeAuditEvent(supabase as never, {
    organizationId: action.organization_id,
    actorUserId,
    eventType: 'evidence_candidate.approved',
    entityType: 'evidence_item',
    entityId: evidenceItemId,
    metadata: {
      finding_id: evidence.finding_id,
      source: 'copilot_action'
    }
  });

  return executedResult('Evidence item approved for the finding.', {
    evidence_item_id: evidenceItemId,
    finding_id: evidence.finding_id,
    deep_link: '/app/evidence'
  });
}

async function createEvidenceItemFromCandidate(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  candidate: Record<string, unknown>,
  actorUserId: string,
  reviewedAt: string
): Promise<string> {
  const chunk = relationObject(candidate.document_chunks);
  const sourceDocument = relationObject(chunk?.source_documents);
  const documentType = typeof sourceDocument?.document_type === 'string' ? sourceDocument.document_type : 'other';
  const sourceLabel = typeof chunk?.source_label === 'string' ? chunk.source_label : 'Evidence candidate';
  const content = typeof chunk?.content === 'string' ? chunk.content : '';
  const { data, error } = await supabase
    .from('evidence_items')
    .insert({
      organization_id: action.organization_id,
      workspace_id: action.workspace_id,
      finding_id: candidate.finding_id,
      document_chunk_id: candidate.document_chunk_id,
      evidence_type: evidenceTypeForSourceDocument(documentType),
      citation: citationForEvidenceCandidate({
        documentType,
        chunkId: String(candidate.document_chunk_id),
        sourceLabel,
        content
      }),
      excerpt: content.slice(0, 1200),
      relevance_explanation: candidate.relevance_explanation,
      retrieval_score: candidate.retrieval_score,
      approval_state: 'approved',
      reviewed_by: actorUserId,
      reviewed_at: reviewedAt
    })
    .select('id')
    .single();
  if (error || !isRecord(data) || typeof data.id !== 'string') throw error ?? new Error('evidence_item_insert_failed');
  return data.id;
}

async function assertFindingAndChunkBelongToWorkspace(
  supabase: CopilotSupabaseClient,
  input: { organizationId: string; workspaceId: string; findingId: string; documentChunkId: string }
): Promise<void> {
  const [finding, chunk] = await Promise.all([
    supabase
      .from('leakage_findings')
      .select('id')
      .eq('id', input.findingId)
      .eq('organization_id', input.organizationId)
      .eq('workspace_id', input.workspaceId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('document_chunks')
      .select('id')
      .eq('id', input.documentChunkId)
      .eq('organization_id', input.organizationId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle()
  ]);

  if (finding.error || !finding.data || chunk.error || !chunk.data) throw new Error('forbidden');
}

async function assertFindingExists(
  supabase: CopilotSupabaseClient,
  organizationId: string,
  workspaceId: string,
  findingId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('leakage_findings')
    .select('id')
    .eq('id', findingId)
    .eq('organization_id', organizationId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) throw new Error('forbidden');
}

async function assertFindingHasRequiredApprovedEvidence(
  supabase: CopilotSupabaseClient,
  input: {
    organizationId: string;
    workspaceId: string;
    findingId: string;
    status: string;
    outcomeType: string;
    calculation: Record<string, unknown>;
  }
): Promise<void> {
  const [{ data: evidenceRows, error: evidenceError }, { data: candidateRows, error: candidateError }] = await Promise.all([
    supabase
      .from('evidence_items')
      .select('id, evidence_type, citation, approval_state, reviewed_by, reviewed_at')
      .eq('organization_id', input.organizationId)
      .eq('workspace_id', input.workspaceId)
      .eq('finding_id', input.findingId)
      .eq('approval_state', 'approved')
      .not('reviewed_by', 'is', null)
      .not('reviewed_at', 'is', null),
    supabase
      .from('evidence_candidates')
      .select('approval_state, attached_evidence_item_id')
      .eq('organization_id', input.organizationId)
      .eq('workspace_id', input.workspaceId)
      .eq('finding_id', input.findingId)
  ]);
  if (evidenceError) throw evidenceError;
  if (candidateError) throw candidateError;

  const candidateEvidenceIds = new Set(
    (Array.isArray(candidateRows) ? candidateRows : [])
      .filter((candidate) => isRecord(candidate) && typeof candidate.attached_evidence_item_id === 'string')
      .map((candidate) => (candidate as { attached_evidence_item_id: string }).attached_evidence_item_id)
  );
  const approvedCandidateEvidenceIds = new Set(
    (Array.isArray(candidateRows) ? candidateRows : [])
      .filter((candidate) => isRecord(candidate) && isEvidenceCandidateExportReady(candidate))
      .map((candidate) => (candidate as { attached_evidence_item_id: string }).attached_evidence_item_id)
  );
  const exportableEvidence = (Array.isArray(evidenceRows) ? evidenceRows : [])
    .filter((item) => isRecord(item) && (!candidateEvidenceIds.has(String(item.id)) || approvedCandidateEvidenceIds.has(String(item.id))))
    .map((item) => exportCitationForEvidenceRow(item));
  const blocker = exportBlockerForFinding({
    status: input.status,
    outcomeType: input.outcomeType,
    calculation: input.calculation,
    evidenceCitations: exportableEvidence
  });
  if (blocker) throw new Error(blocker);
}

async function generateReportDraftDirect(
  supabase: CopilotSupabaseClient,
  action: AssistantActionRecord,
  actorUserId: string
): Promise<CopilotActionExecutionResult> {
  const [{ data: organization, error: organizationError }, { data: workspace, error: workspaceError }, { data: findingRows, error: findingsError }] =
    await Promise.all([
      supabase.from('organizations').select('name').eq('id', action.organization_id).single(),
      supabase.from('audit_workspaces').select('name').eq('id', action.workspace_id).eq('organization_id', action.organization_id).single(),
      supabase
        .from('leakage_findings')
        .select('id, title, finding_type, outcome_type, status, estimated_amount_minor, currency, confidence, recommended_action, calculation, reviewer_user_id, reviewed_at')
        .eq('organization_id', action.organization_id)
        .eq('workspace_id', action.workspace_id)
        .eq('is_active', true)
        .in('status', [...CUSTOMER_FACING_REPORT_STATUSES])
    ]);
  if (organizationError) throw organizationError;
  if (workspaceError) throw workspaceError;
  if (findingsError) throw findingsError;

  const findingIds = (Array.isArray(findingRows) ? findingRows : []).filter(isRecord).map((finding) => String(finding.id));
  const safeFindingIds = findingIds.length > 0 ? findingIds : ['00000000-0000-0000-0000-000000000000'];
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('evidence_items')
    .select('id, finding_id, evidence_type, citation, excerpt, approval_state, reviewed_by, reviewed_at')
    .eq('organization_id', action.organization_id)
    .eq('workspace_id', action.workspace_id)
    .eq('approval_state', 'approved')
    .not('reviewed_by', 'is', null)
    .not('reviewed_at', 'is', null)
    .in('finding_id', safeFindingIds);
  if (evidenceError) throw evidenceError;

  const evidenceByFinding = new Map<string, ReportCitation[]>();
  for (const row of (Array.isArray(evidenceRows) ? evidenceRows : []).filter(isRecord)) {
    const citation = isRecord(row.citation) ? row.citation : {};
    const exportCitation = exportCitationForEvidenceRow(row);
    const next = evidenceByFinding.get(String(row.finding_id)) ?? [];
    next.push({
      label: typeof citation.label === 'string' ? citation.label : 'Source evidence',
      excerpt: typeof row.excerpt === 'string' ? row.excerpt : typeof citation.excerpt === 'string' ? citation.excerpt : undefined,
      sourceType: exportCitation.sourceType ?? undefined,
      approvalState: exportCitation.approvalState as ReportCitation['approvalState']
    });
    evidenceByFinding.set(String(row.finding_id), next);
  }

  const findings: ReportFinding[] = (Array.isArray(findingRows) ? findingRows : []).filter(isRecord).map((finding) => ({
    id: String(finding.id),
    title: String(finding.title),
    findingType: String(finding.finding_type),
    outcomeType: String(finding.outcome_type) as ReportFinding['outcomeType'],
    status: String(finding.status) as ReportFinding['status'],
    amountMinor: Number(finding.estimated_amount_minor),
    currency: String(finding.currency),
    confidence: Number(finding.confidence),
    recommendedAction: typeof finding.recommended_action === 'string' ? finding.recommended_action : undefined,
    calculation: isRecord(finding.calculation) ? finding.calculation : {},
    reviewerUserId: typeof finding.reviewer_user_id === 'string' ? finding.reviewer_user_id : null,
    reviewedAt: typeof finding.reviewed_at === 'string' ? finding.reviewed_at : null,
    evidenceCitations: evidenceByFinding.get(String(finding.id)) ?? []
  }));
  const report = generateExecutiveAuditReport({
    organizationName: isRecord(organization) && typeof organization.name === 'string' ? organization.name : 'Organization',
    workspaceName: isRecord(workspace) && typeof workspace.name === 'string' ? workspace.name : 'Workspace',
    workspaceId: action.workspace_id,
    generatedBy: actorUserId,
    findings
  });

  if (!report.exportability.exportable) {
    return executedResult('Report draft checked, but export-ready report generation is blocked by existing report rules.', {
      included_findings_count: report.includedFindings.length,
      blockers: report.exportability.blockers,
      deep_link: '/app/reports'
    });
  }

  const { data: pack, error: packError } = await supabase
    .from('evidence_packs')
    .insert({
      organization_id: action.organization_id,
      workspace_id: action.workspace_id,
      title: `${isRecord(workspace) && typeof workspace.name === 'string' ? workspace.name : 'Workspace'} Executive Audit Report`,
      selected_finding_ids: report.includedFindings.map((finding) => finding.id),
      report_json: report,
      status: 'generated',
      generated_by: actorUserId
    })
    .select('id')
    .single();
  if (packError) throw packError;

  await writeAuditEvent(supabase as never, {
    organizationId: action.organization_id,
    actorUserId,
    eventType: 'report.generated',
    entityType: 'evidence_pack',
    entityId: isRecord(pack) && typeof pack.id === 'string' ? pack.id : undefined,
    metadata: {
      finding_count: report.topFindings.length,
      total_minor: report.totalPotentialLeakageMinor,
      source: 'copilot_action'
    }
  });

  return executedResult(`Report draft generated with ${report.includedFindings.length} included finding reference${report.includedFindings.length === 1 ? '' : 's'}.`, {
    evidence_pack_id: isRecord(pack) && typeof pack.id === 'string' ? pack.id : null,
    included_findings_count: report.includedFindings.length,
    deep_link: '/app/reports'
  });
}

async function markCopilotActionExecuted(
  supabase: CopilotSupabaseClient,
  input: { action: AssistantActionRecord; actorUserId: string; result: CopilotActionExecutionResult; now?: Date }
): Promise<AssistantActionRecord> {
  const { data, error } = await supabase
    .from('assistant_actions')
    .update({
      status: 'executed',
      executed_by: input.actorUserId,
      executed_at: (input.now ?? new Date()).toISOString(),
      result_summary: input.result.summary,
      result_refs: sanitizeActionPayloadRefs(input.result.refs),
      failure_code: null
    })
    .eq('id', input.action.id)
    .eq('status', 'confirmed')
    .select(ACTION_SELECT_COLUMNS)
    .single();
  if (error || !isAssistantActionRecord(data)) throw error ?? new Error('assistant_action_execute_failed');
  return data;
}

async function markCopilotActionFailed(
  supabase: CopilotSupabaseClient,
  input: { action: AssistantActionRecord; actorUserId: string; summary: string; now?: Date }
): Promise<AssistantActionRecord> {
  const { data, error } = await supabase
    .from('assistant_actions')
    .update({
      status: 'failed',
      executed_by: input.actorUserId,
      executed_at: (input.now ?? new Date()).toISOString(),
      result_summary: input.summary,
      result_refs: {},
      failure_code: 'execution_failed'
    })
    .eq('id', input.action.id)
    .eq('status', 'confirmed')
    .select(ACTION_SELECT_COLUMNS)
    .single();
  if (error || !isAssistantActionRecord(data)) throw error ?? new Error('assistant_action_fail_update_failed');
  return data;
}

function executedResult(summary: string, refs: Record<string, unknown>): CopilotActionExecutionResult {
  return {
    status: 'executed',
    summary: redactSafeText(summary),
    refs: sanitizeActionPayloadRefs(refs)
  };
}

export function actionCardFromRecord(action: AssistantActionRecord): CopilotActionCard {
  const preview = isRecord(action.preview) ? action.preview : {};
  return {
    id: action.id,
    action_type: action.action_type,
    title: stringValue(preview.title) ?? policyForAction(action.action_type).title,
    description: stringValue(preview.description) ?? policyForAction(action.action_type).description,
    risk_level: action.risk_level,
    required_role: action.required_role,
    status: action.status,
    target_entity_type: action.target_entity_type,
    target_entity_id: action.target_entity_id,
    what_will_change: stringArray(preview.what_will_change),
    blockers: stringArray(preview.blockers),
    result_summary: action.result_summary ? redactSafeText(action.result_summary) : null,
    expires_at: action.expires_at
  };
}

export function actionCardFromProposal(proposal: PendingCopilotActionProposal, id: string): CopilotActionCard {
  return {
    id,
    action_type: proposal.actionType,
    title: proposal.title,
    description: proposal.description,
    risk_level: proposal.riskLevel,
    required_role: proposal.requiredRole,
    status: 'pending',
    target_entity_type: proposal.targetEntityType,
    target_entity_id: proposal.targetEntityId,
    what_will_change: proposal.preview.what_will_change,
    blockers: proposal.preview.blockers,
    result_summary: null,
    expires_at: proposal.expiresAt
  };
}

export function sanitizeActionPayloadRefs(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactCopilotOutput(value) as Record<string, unknown>;
  for (const key of ACTION_ENTITY_REF_KEYS) {
    const original = value[key];
    if (typeof original === 'string' && UUID_PATTERN.test(original)) {
      redacted[key] = original;
    }
  }
  return redacted;
}

export function actionPreparedAnswer(proposal: PendingCopilotActionProposal): string {
  if (proposal.preview.blockers.length > 0) {
    return 'I prepared an action card, but it has blockers that must be resolved before confirmation. No audit data changed.';
  }
  return 'I prepared a pending action for confirmation. No audit data changed, and execution is deferred to a later phase.';
}

export function actionForbiddenAnswer(): string {
  return 'I cannot prepare that action for your current role. No audit data changed.';
}

function actionBlockers(context: CopilotDataContext, intent: CopilotActionIntent): string[] {
  const blockers: string[] = [];
  if (intent.actionType === 'prepare_run_extraction' && !intent.payloadRefs?.source_document_id) {
    blockers.push('Select or reference a contract source document before running extraction.');
  }
  if (intent.targetEntityType === 'finding') {
    if (!intent.targetEntityId) {
      blockers.push('Select a finding before preparing this action.');
    } else if (!context.findings.some((finding) => finding.id === intent.targetEntityId && finding.workspaceId === context.workspace.id)) {
      blockers.push('The selected finding was not found in this workspace.');
    }
  }
  if (intent.actionType === 'prepare_approve_evidence' && !intent.targetEntityId) {
    blockers.push('Select a finding or evidence reference before preparing evidence approval.');
  }
  if (intent.actionType === 'prepare_attach_evidence_candidate' && !intent.payloadRefs?.document_chunk_id && !intent.payloadRefs?.evidence_candidate_id) {
    blockers.push('Select an evidence candidate or document chunk before attaching evidence.');
  }
  return blockers;
}

function whatWillChange(actionType: CopilotActionType): string[] {
  if (actionType === 'prepare_update_finding_status') {
    return [
      'A finding status update will be queued for a later execution phase.',
      'The finding amount and deterministic calculation will not change.'
    ];
  }
  if (actionType === 'prepare_approve_evidence') {
    return ['Evidence approval will execute after confirmation.', 'Report readiness may change only after approved evidence is attached.'];
  }
  if (actionType === 'prepare_attach_evidence_candidate') {
    return ['An evidence candidate will be attached for review.', 'Evidence will not be approved automatically.'];
  }
  if (actionType === 'prepare_assign_reviewer') {
    return ['Reviewer assignment will update after confirmation.'];
  }
  if (actionType === 'prepare_run_extraction') return ['A contract extraction run will start after confirmation.'];
  if (actionType === 'prepare_run_reconciliation') return ['A deterministic reconciliation run will start after confirmation.'];
  if (actionType === 'prepare_search_evidence') return ['Evidence candidates will be searched read-only; no evidence will be approved automatically.'];
  if (actionType === 'prepare_generate_report_draft') return ['A report draft will be generated; no report will be exported automatically.'];
  return ['A recovery note will be prepared after confirmation.'];
}

function policyForAction(actionType: CopilotActionType): ActionPolicy {
  return COPILOT_ACTION_POLICIES[actionType];
}

const ACTION_SELECT_COLUMNS = [
  'id',
  'organization_id',
  'workspace_id',
  'thread_id',
  'message_id',
  'action_type',
  'target_entity_type',
  'target_entity_id',
  'status',
  'risk_level',
  'required_role',
  'payload_refs',
  'preview',
  'proposed_by',
  'confirmed_by',
  'cancelled_by',
  'executed_by',
  'result_summary',
  'result_refs',
  'failure_code',
  'expires_at',
  'created_at',
  'confirmed_at',
  'cancelled_at',
  'executed_at'
].join(', ');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN_GLOBAL = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const ACTION_ENTITY_REF_KEYS = [
  'organization_id',
  'workspace_id',
  'thread_id',
  'message_id',
  'target_entity_id',
  'source_document_id',
  'document_chunk_id',
  'evidence_candidate_id',
  'evidence_item_id',
  'reviewer_user_id',
  'finding_id',
  'report_id',
  'evidence_id'
];

function isAssistantActionRecord(value: unknown): value is AssistantActionRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.organization_id === 'string'
    && typeof value.workspace_id === 'string'
    && typeof value.action_type === 'string'
    && typeof value.target_entity_type === 'string'
    && typeof value.status === 'string'
    && typeof value.risk_level === 'string'
    && typeof value.required_role === 'string';
}

function proposedFindingStatus(normalizedMessage: string): string {
  if (/\bcustomer[- ]?ready\b/.test(normalizedMessage)) return 'customer_ready';
  if (/\brecovered\b/.test(normalizedMessage)) return 'recovered';
  if (/\bneeds? review\b/.test(normalizedMessage)) return 'needs_review';
  if (/\bdismiss(?:ed)?\b/.test(normalizedMessage)) return 'dismissed';
  if (/\bnot recoverable\b/.test(normalizedMessage)) return 'not_recoverable';
  return 'approved';
}

function requiredPayload(payload: Record<string, unknown>, key: string): string {
  const value = stringPayload(payload, key);
  if (!value) throw new Error(`${key}_required`);
  return value;
}

function stringPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberPayload(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function relationObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null;
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? redactSafeText(value) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => redactSafeText(item)).slice(0, 8)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
