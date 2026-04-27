import { describe, expect, it } from 'vitest';
import { AI_FORBIDDEN_DATA, AI_TASK_REGISTRY, getAiTaskDefinition } from './tasks';
import { AI_TASK_TYPES } from './taskTypes';

describe('AI task registry', () => {
  it('contains every supported task type', () => {
    expect(Object.keys(AI_TASK_REGISTRY).sort()).toEqual([...AI_TASK_TYPES].sort());
  });

  it('defines advisory, schema-validated metadata for every task', () => {
    for (const taskType of AI_TASK_TYPES) {
      const definition = getAiTaskDefinition(taskType);

      expect(definition.taskType).toBe(taskType);
      expect(definition.name).toBeTruthy();
      expect(definition.purpose).toBeTruthy();
      expect(definition.readOnly).toBe(true);
      expect(
        definition.expectedOutputSchema.parse({
          taskType,
          status: 'completed',
          summary: 'Safe advisory summary.',
          confidence: null,
          generatedAt: '2026-04-27T10:00:00.000Z'
        })
      ).toMatchObject({ taskType });
    }
  });

  it('does not allow forbidden raw data as input references', () => {
    const forbiddenNames = new Set<string>(AI_FORBIDDEN_DATA);

    for (const definition of Object.values(AI_TASK_REGISTRY)) {
      for (const forbidden of AI_FORBIDDEN_DATA) {
        expect(definition.forbiddenData).toContain(forbidden);
      }

      expect(definition.allowedInputReferences.some((reference) => forbiddenNames.has(reference))).toBe(false);
      expect(definition.allowedInputReferences.join(' ')).not.toMatch(/raw|prompt|embedding|secret|token|api_key|customer_pii/i);
    }
  });

  it('limits pending-action creation to reviewer-scoped tasks', () => {
    for (const definition of Object.values(AI_TASK_REGISTRY)) {
      if (definition.canCreatePendingActions) {
        expect(definition.requiredRole).toBe('reviewer');
      }
    }
  });
});
