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
          citation: { label: 'Section 4.1', sourceType: 'contract', sourceId: 'doc_1' },
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
});
