import { describe, expect, it } from 'vitest';
import {
  aiOutputRejectedEvent,
  aiSafetyBlockedEvent,
  aiTaskCompletedEvent,
  aiTaskFailedEvent,
  aiTaskStartedEvent,
  buildAiAuditEventMetadata
} from './aiEvents';
import { shouldWriteAuditEvent } from './auditEvents';

const baseInput = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  taskType: 'evidence_quality_review' as const,
  entityReferences: [
    {
      type: 'finding' as const,
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Acme Cloud buyer@example.com finding'
    }
  ],
  safeSummary: 'AI reviewed evidence references. raw contract text should be treated as a phrase, not stored source data.',
  modelName: 'gemini-2.5-pro'
};

describe('AI audit events', () => {
  it('marks AI event types as required audit events', () => {
    expect(shouldWriteAuditEvent('ai.task_started')).toBe(true);
    expect(shouldWriteAuditEvent('ai.task_completed')).toBe(true);
    expect(shouldWriteAuditEvent('ai.task_failed')).toBe(true);
    expect(shouldWriteAuditEvent('ai.output_rejected')).toBe(true);
    expect(shouldWriteAuditEvent('ai.safety_blocked')).toBe(true);
  });

  it('builds safe metadata with required AI audit fields', () => {
    const metadata = buildAiAuditEventMetadata({
      ...baseInput,
      status: 'completed',
      safetyFlags: ['schema_validated', 'human_approval_required']
    });

    expect(metadata).toMatchObject({
      organization_id: baseInput.organizationId,
      workspace_id: baseInput.workspaceId,
      task_type: 'evidence_quality_review',
      safe_summary: expect.any(String),
      model_name: 'gemini-2.5-pro',
      status: 'completed',
      safety_flags: ['schema_validated', 'human_approval_required']
    });
    expect(metadata.entity_references).toEqual([
      {
        type: 'finding',
        id: '33333333-3333-4333-8333-333333333333',
        label: 'Acme Cloud [redacted_email] finding'
      }
    ]);
  });

  it('does not allow raw data in AI audit metadata', () => {
    const metadata = buildAiAuditEventMetadata({
      ...baseInput,
      status: 'failed',
      safeSummary: 'Contact buyer@example.com. Gemini API key: AIza123456789012345678901234567890',
      modelName: 'gemini-2.5-pro',
      errorCode: 'gemini_validation_failed'
    });
    const serialized = JSON.stringify(metadata);

    expect(serialized).not.toContain('buyer@example.com');
    expect(serialized).not.toContain('AIza');
    expect(serialized).not.toContain('raw contract text should be treated');
    expect(serialized).not.toMatch(/prompt|embedding|model_response|invoice_contents|raw_contract_text/i);
  });

  it('creates typed event payloads for every AI audit lifecycle event', () => {
    expect(aiTaskStartedEvent(baseInput)).toMatchObject({ eventType: 'ai.task_started', entityType: 'ai_task' });
    expect(aiTaskCompletedEvent(baseInput)).toMatchObject({ eventType: 'ai.task_completed', entityType: 'ai_task' });
    expect(aiTaskFailedEvent(baseInput)).toMatchObject({ eventType: 'ai.task_failed', entityType: 'ai_task' });
    expect(aiOutputRejectedEvent(baseInput)).toMatchObject({ eventType: 'ai.output_rejected', entityType: 'ai_task' });
    expect(aiSafetyBlockedEvent(baseInput)).toMatchObject({ eventType: 'ai.safety_blocked', entityType: 'ai_task' });
  });
});
