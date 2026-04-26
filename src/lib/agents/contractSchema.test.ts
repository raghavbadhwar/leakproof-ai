import { describe, expect, it } from 'vitest';
import { contractExtractionSchema } from './contractSchema';

describe('contract extraction schema', () => {
  it('accepts cited structured terms with confidence and review flags', () => {
    const parsed = contractExtractionSchema.parse({
      terms: [
        {
          term_type: 'minimum_commitment',
          value: 'USD 10,000 monthly',
          normalized_value: { amountMinor: 1_000_000, currency: 'USD', period: 'monthly' },
          currency: 'USD',
          period: 'monthly',
          citation: {
            label: 'Section 4.1',
            sourceType: 'contract',
            sourceId: 'doc_1',
            excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.'
          },
          source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.',
          confidence: 0.96,
          needs_review: false,
          reasoning_summary: 'The clause explicitly states the minimum monthly commitment.'
        }
      ]
    });

    expect(parsed.terms[0]?.term_type).toBe('minimum_commitment');
  });

  it('rejects terms that lack citations', () => {
    expect(() =>
      contractExtractionSchema.parse({
        terms: [
          {
            term_type: 'minimum_commitment',
            value: 'USD 10,000 monthly',
            normalized_value: { amountMinor: 1_000_000, currency: 'USD' },
            confidence: 0.96,
            needs_review: false,
            reasoning_summary: 'Missing evidence should fail.'
          }
        ]
      })
    ).toThrow();
  });

  it('rejects invalid normalized value shapes for typed terms', () => {
    expect(() =>
      contractExtractionSchema.parse({
        terms: [
          {
            term_type: 'minimum_commitment',
            value: 'USD 10,000 monthly',
            normalized_value: { amount: '10000', currency: 'USD' },
            citation: {
              label: 'Section 4.1',
              sourceType: 'contract',
              sourceId: 'doc_1',
              excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.'
            },
            source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.',
            confidence: 0.96,
            needs_review: false,
            reasoning_summary: 'Wrong value shape should fail.'
          }
        ]
      })
    ).toThrow();
  });

  it('accepts unresolved typed values only when marked for review', () => {
    const parsed = contractExtractionSchema.parse({
      terms: [
        {
          term_type: 'notice_period',
          value: 'Notice must be provided before renewal.',
          normalized_value: {
            kind: 'unresolved',
            rawText: 'Notice must be provided before renewal.',
            reason: 'The clause does not state a duration.'
          },
          citation: {
            label: 'Section 9',
            sourceType: 'contract',
            sourceId: 'doc_1',
            excerpt: 'Notice must be provided before renewal.'
          },
          source_excerpt: 'Notice must be provided before renewal.',
          confidence: 0.61,
          needs_review: true,
          reasoning_summary: 'The notice clause exists but the value is incomplete.'
        }
      ]
    });

    expect(parsed.terms[0]?.needs_review).toBe(true);
  });

  it('rejects unresolved values that are not marked for review', () => {
    expect(() =>
      contractExtractionSchema.parse({
        terms: [
          {
            term_type: 'notice_period',
            value: 'Notice must be provided before renewal.',
            normalized_value: {
              kind: 'unresolved',
              rawText: 'Notice must be provided before renewal.',
              reason: 'The clause does not state a duration.'
            },
            citation: {
              label: 'Section 9',
              sourceType: 'contract',
              sourceId: 'doc_1',
              excerpt: 'Notice must be provided before renewal.'
            },
            source_excerpt: 'Notice must be provided before renewal.',
            confidence: 0.61,
            needs_review: false,
            reasoning_summary: 'The notice clause exists but the value is incomplete.'
          }
        ]
      })
    ).toThrow();
  });
});
