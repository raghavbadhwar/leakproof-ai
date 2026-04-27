import { describe, expect, it } from 'vitest';
import {
  assertNoRawSourceText,
  assertNoSecrets,
  redactSensitiveAiInput,
  redactSensitiveAiOutput,
  safeEntityReference,
  truncateSafeExcerpt
} from './safety';

describe('shared AI safety helpers', () => {
  it('redacts sensitive AI input keys and secret-like values', () => {
    const redacted = redactSensitiveAiInput({
      organization_id: '11111111-1111-4111-8111-111111111111',
      workspace_id: '22222222-2222-4222-8222-222222222222',
      raw_contract_text: 'Customer legal name and contract content should not be stored.',
      invoice_contents: 'invoice row contents should not be stored.',
      usage_raw_rows: [{ user_email: 'buyer@example.com', seats: 42 }],
      prompt: 'Full prompt should not be stored.',
      model_response: 'Full model response should not be stored.',
      embedding: [0.1, 0.2],
      api_key: 'AIza123456789012345678901234567890',
      safe_summary: 'Reviewer asked for missing data.',
      nested: {
        customer_name: 'Acme Cloud',
        safe_count: 3
      }
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('contract content');
    expect(serialized).not.toContain('invoice row contents');
    expect(serialized).not.toContain('buyer@example.com');
    expect(serialized).not.toContain('Full prompt');
    expect(serialized).not.toContain('Full model response');
    expect(serialized).not.toContain('AIza');
    expect(serialized).not.toContain('Acme Cloud');
    expect(serialized).toContain('[redacted]');
    expect(redacted).toMatchObject({
      safe_summary: 'Reviewer asked for missing data.',
      nested: {
        safe_count: 3
      }
    });
  });

  it('redacts sensitive AI output while keeping advisory metadata', () => {
    const redacted = redactSensitiveAiOutput({
      summary: 'Use finding ref 33333333-3333-4333-8333-333333333333 for human review.',
      customer_email: 'buyer@example.com',
      full_gemini_output: 'raw chain of output',
      suggestedActions: [{ label: 'Review evidence', requiresHumanApproval: true }]
    });

    expect(JSON.stringify(redacted)).not.toContain('buyer@example.com');
    expect(JSON.stringify(redacted)).not.toContain('raw chain');
    expect(redacted).toMatchObject({
      summary: 'Use finding ref 33333333-3333-4333-8333-333333333333 for human review.'
    });
  });

  it('blocks raw source text and overlong source strings before logging', () => {
    expect(() => assertNoRawSourceText({ contract_text: 'raw contract clause' })).toThrow(/raw source data/i);
    expect(() => assertNoRawSourceText({ summary: 'safe '.repeat(400) })).toThrow(/overlong source text/i);
    expect(() => assertNoRawSourceText({ summary: 'Safe short summary.' })).not.toThrow();
  });

  it('blocks secret keys and secret-looking values', () => {
    expect(() => assertNoSecrets({ GEMINI_API_KEY: 'AIza123456789012345678901234567890' })).toThrow(/secret/i);
    expect(() => assertNoSecrets({ authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456' })).toThrow(/secret/i);
    expect(() => assertNoSecrets({ model_name: 'gemini-2.5-pro' })).not.toThrow();
  });

  it('truncates safe excerpts and redacts customer PII', () => {
    const excerpt = truncateSafeExcerpt(
      'Contact buyer@example.com at acme.example.com. ' + 'Approved invoice reference. '.repeat(30),
      140
    );

    expect(excerpt.length).toBeLessThanOrEqual(140);
    expect(excerpt).toContain('[redacted_email]');
    expect(excerpt).toContain('[redacted_domain]');
    expect(excerpt).not.toContain('buyer@example.com');
  });

  it('returns safe entity references with redacted labels', () => {
    expect(
      safeEntityReference({
        type: 'finding',
        id: '33333333-3333-4333-8333-333333333333',
        label: 'Acme Cloud buyer@example.com minimum commitment finding'
      })
    ).toEqual({
      type: 'finding',
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Acme Cloud [redacted_email] minimum commitment finding'
    });
  });
});
