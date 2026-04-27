import { z } from 'zod';
import { redactSensitiveAiInput, safeEntityReference, truncateSafeExcerpt } from '../ai/safety';
import { aiTaskTypeSchema, type AiEntityReferenceType, type AiTaskType } from '../ai/taskTypes';
import { redactAuditMetadata } from './auditEvents';

export const aiAuditEventTypeSchema = z.enum([
  'ai.task_started',
  'ai.task_completed',
  'ai.task_failed',
  'ai.output_rejected',
  'ai.safety_blocked'
]);

export const aiAuditStatusSchema = z.enum(['started', 'completed', 'failed', 'rejected', 'blocked']);

export type AiAuditEventType = z.infer<typeof aiAuditEventTypeSchema>;
export type AiAuditStatus = z.infer<typeof aiAuditStatusSchema>;

export type AiAuditEntityReferenceInput = {
  type: AiEntityReferenceType;
  id: string;
  label?: string | null;
};

export type AiAuditMetadataInput = {
  organizationId: string;
  workspaceId: string;
  taskType: AiTaskType;
  entityReferences?: AiAuditEntityReferenceInput[];
  safeSummary: string;
  modelName?: string | null;
  status: AiAuditStatus;
  safetyFlags?: string[];
  errorCode?: string | null;
};

export type AiAuditEventPayload = {
  eventType: AiAuditEventType;
  entityType: 'ai_task';
  entityId?: string;
  metadata: Record<string, unknown>;
};

export function buildAiAuditEventMetadata(input: AiAuditMetadataInput): Record<string, unknown> {
  const metadata = {
    organization_id: input.organizationId,
    workspace_id: input.workspaceId,
    task_type: aiTaskTypeSchema.parse(input.taskType),
    entity_references: (input.entityReferences ?? []).slice(0, 20).map(safeEntityReference),
    safe_summary: truncateSafeExcerpt(input.safeSummary, 500) || 'AI task event recorded.',
    model_name: input.modelName ? truncateSafeExcerpt(input.modelName, 120) : null,
    status: aiAuditStatusSchema.parse(input.status),
    safety_flags: (input.safetyFlags ?? []).map((flag) => truncateSafeExcerpt(flag, 80)).filter(Boolean).slice(0, 12),
    error_code: input.errorCode ? truncateSafeExcerpt(input.errorCode, 120) : null
  };

  return redactAuditMetadata(redactSensitiveAiInput(metadata) as Record<string, unknown>);
}

export function aiTaskStartedEvent(input: Omit<AiAuditMetadataInput, 'status'>): AiAuditEventPayload {
  return buildAiAuditEvent('ai.task_started', { ...input, status: 'started' });
}

export function aiTaskCompletedEvent(input: Omit<AiAuditMetadataInput, 'status'>): AiAuditEventPayload {
  return buildAiAuditEvent('ai.task_completed', { ...input, status: 'completed' });
}

export function aiTaskFailedEvent(input: Omit<AiAuditMetadataInput, 'status'>): AiAuditEventPayload {
  return buildAiAuditEvent('ai.task_failed', { ...input, status: 'failed' });
}

export function aiOutputRejectedEvent(input: Omit<AiAuditMetadataInput, 'status'>): AiAuditEventPayload {
  return buildAiAuditEvent('ai.output_rejected', { ...input, status: 'rejected' });
}

export function aiSafetyBlockedEvent(input: Omit<AiAuditMetadataInput, 'status'>): AiAuditEventPayload {
  return buildAiAuditEvent('ai.safety_blocked', { ...input, status: 'blocked' });
}

function buildAiAuditEvent(eventType: AiAuditEventType, input: AiAuditMetadataInput): AiAuditEventPayload {
  return {
    eventType,
    entityType: 'ai_task',
    entityId: input.workspaceId,
    metadata: buildAiAuditEventMetadata(input)
  };
}
