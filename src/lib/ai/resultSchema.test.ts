import { describe, expect, it } from 'vitest';
import { aiTaskResultSchemaForTask, parseAiTaskResult } from './resultSchema';

const generatedAt = '2026-04-27T10:00:00.000Z';

describe('shared AI result schema', () => {
  it('validates the common advisory result envelope', () => {
    const result = parseAiTaskResult({
      taskType: 'evidence_quality_review',
      status: 'completed',
      summary: 'Approved evidence appears sufficient, but a reviewer must confirm billing period alignment.',
      confidence: 0.74,
      citations: [
        {
          entity: {
            type: 'evidence_item',
            id: '44444444-4444-4444-8444-444444444444',
            label: 'Approved contract clause'
          },
          sourceKind: 'evidence',
          label: 'Evidence item',
          locator: 'Section 4.1',
          excerpt: 'Minimum commitment reference.'
        }
      ],
      referencedEntities: [
        {
          type: 'finding',
          id: '33333333-3333-4333-8333-333333333333',
          label: 'Finding ref'
        }
      ],
      warnings: ['Human approval is required before customer-facing use.'],
      suggestedActions: [
        {
          label: 'Review billing period',
          description: 'Confirm invoice and usage evidence match the contract period.',
          actionType: 'review_evidence',
          requiresHumanApproval: true,
          riskLevel: 'medium',
          target: {
            type: 'finding',
            id: '33333333-3333-4333-8333-333333333333'
          }
        }
      ],
      safetyFlags: ['schema_validated', 'human_approval_required', 'advisory_only'],
      generatedAt
    });

    expect(result.taskType).toBe('evidence_quality_review');
    expect(result.suggestedActions[0]?.requiresHumanApproval).toBe(true);
  });

  it('rejects invalid results that try to bypass human approval', () => {
    expect(() =>
      parseAiTaskResult({
        taskType: 'recovery_note_draft',
        status: 'completed',
        summary: 'Draft note.',
        confidence: 0.8,
        citations: [],
        referencedEntities: [],
        warnings: [],
        suggestedActions: [
          {
            label: 'Send note',
            description: 'Send directly to customer.',
            actionType: 'send_email',
            requiresHumanApproval: false,
            riskLevel: 'critical'
          }
        ],
        safetyFlags: ['schema_validated'],
        generatedAt
      })
    ).toThrow();
  });

  it('rejects task-specific envelopes with the wrong task type', () => {
    const recoveryNoteSchema = aiTaskResultSchemaForTask('recovery_note_draft');

    expect(() =>
      recoveryNoteSchema.parse({
        taskType: 'cfo_summary_draft',
        status: 'completed',
        summary: 'Wrong task type.',
        confidence: null,
        generatedAt
      })
    ).toThrow();
  });
});
