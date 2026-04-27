import { describe, expect, it } from 'vitest';
import {
  collectEntityReferences,
  redactCopilotOutput,
  summarizeCopilotAssistantForStorage,
  summarizeCopilotUserMessageForStorage
} from './redaction';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('Copilot redaction', () => {
  it('does not store raw user prompts for finding intelligence requests', () => {
    const summary = summarizeCopilotUserMessageForStorage(
      'Check false-positive risk for this pasted contract: raw contract says Acme owes invoice row 123.'
    );

    expect(summary).toBe('User asked for advisory finding intelligence.');
    expect(summary).not.toContain('raw contract');
    expect(summary).not.toContain('invoice row 123');
  });

  it('redacts raw source fields, prompts, embeddings, and model output from tool data', () => {
    const redacted = redactCopilotOutput({
      finding_id: findingId,
      content: 'Raw contract text should not appear.',
      excerpt: 'Invoice row contents should not appear.',
      prompt: 'Full Gemini prompt should not appear.',
      embedding: [0.1, 0.2, 0.3],
      model_output: 'Raw model output should not appear.',
      nested: {
        customer_name: 'Acme Cloud',
        storage_path: 'org/workspace/contract.pdf',
        safe_count: 2
      }
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('Raw contract text');
    expect(serialized).not.toContain('Invoice row contents');
    expect(serialized).not.toContain('Full Gemini prompt');
    expect(serialized).not.toContain('Raw model output');
    expect(serialized).not.toContain('Acme Cloud');
    expect(serialized).toContain('[redacted]');
    expect(redacted.nested.safe_count).toBe(2);
  });

  it('stores entity references instead of raw message text', () => {
    const references = collectEntityReferences({
      organizationId,
      workspaceId,
      selectedFindingId: findingId,
      message: `Explain finding ${findingId} using pasted invoice content that should not be stored.`
    });

    expect(references).toEqual([
      { type: 'organization', id: organizationId },
      { type: 'workspace', id: workspaceId },
      { type: 'finding', id: findingId }
    ]);
  });

  it('assistant storage summary contains tool names only', () => {
    const summary = summarizeCopilotAssistantForStorage(['prepareRecoveryNote', 'evidenceQualityReview']);

    expect(summary).toBe('Read-only Copilot response generated with tools: prepareRecoveryNote, evidenceQualityReview.');
    expect(summary).not.toContain('customer-facing draft');
    expect(summary).not.toContain('model output');
  });
});
