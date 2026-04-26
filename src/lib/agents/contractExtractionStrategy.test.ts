import { describe, expect, it } from 'vitest';
import { buildContractExtractionPasses, mergeContractExtractions } from './contractExtractionStrategy';
import type { ContractExtraction } from './contractSchema';

describe('contract extraction strategy', () => {
  it('builds passes that include terms from later contract chunks', () => {
    const passes = buildContractExtractionPasses({
      contractText: '',
      maxPassCharacters: 140,
      chunks: [
        { chunkId: 'chunk_1', label: 'Section 1', text: 'Introductory terms only.' },
        { chunkId: 'chunk_2', label: 'Section 7', text: 'Billing frequency is monthly.' },
        { chunkId: 'chunk_3', label: 'Section 14', text: 'Annual uplift is 8% starting on renewal.' }
      ]
    });

    expect(passes.length).toBeGreaterThan(1);
    expect(passes.flatMap((pass) => pass.chunks.map((chunk) => chunk.chunkId))).toEqual(['chunk_1', 'chunk_2', 'chunk_3']);
    expect(passes.at(-1)?.text).toContain('Annual uplift is 8%');
  });

  it('merges duplicate terms from multiple chunk passes without losing the strongest cited result', () => {
    const duplicateLowConfidence = term({ confidence: 0.72, needs_review: true });
    const duplicateHighConfidence = term({ confidence: 0.94, needs_review: false });

    const merged = mergeContractExtractions([
      { terms: [duplicateLowConfidence] },
      { terms: [duplicateHighConfidence, term({ type: 'billing_frequency' })] }
    ]);

    expect(merged.terms).toHaveLength(2);
    expect(merged.terms.find((item) => item.term_type === 'minimum_commitment')?.confidence).toBe(0.94);
  });
});

function term(input: {
  type?: ContractExtraction['terms'][number]['term_type'];
  confidence?: number;
  needs_review?: boolean;
}): ContractExtraction['terms'][number] {
  if (input.type === 'billing_frequency') {
    return {
      term_type: 'billing_frequency',
      value: 'monthly',
      normalized_value: { frequency: 'monthly' },
      citation: {
        sourceType: 'contract',
        sourceId: 'chunk_2',
        label: 'Section 7',
        excerpt: 'Billing frequency is monthly.'
      },
      source_excerpt: 'Billing frequency is monthly.',
      confidence: input.confidence ?? 0.9,
      needs_review: input.needs_review ?? false,
      reasoning_summary: 'The clause states the billing frequency.'
    };
  }

  return {
    term_type: 'minimum_commitment',
    value: 'USD 10,000 monthly',
    normalized_value: { amountMinor: 1_000_000, currency: 'USD', period: 'monthly' },
    citation: {
      sourceType: 'contract',
      sourceId: 'chunk_1',
      label: 'Section 4.1',
      excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.'
    },
    source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.',
    confidence: input.confidence ?? 0.9,
    needs_review: input.needs_review ?? false,
    reasoning_summary: 'The clause states the minimum commitment.'
  };
}
