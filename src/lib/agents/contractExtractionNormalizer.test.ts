import { describe, expect, it } from 'vitest';
import { normalizeContractExtraction } from './contractExtractionNormalizer';

describe('contract extraction normalizer', () => {
  it('keeps already structured extraction responses unchanged', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_type: 'minimum_commitment',
            value: 'USD 10,000 monthly',
            normalized_value: { amountMinor: 1_000_000, currency: 'USD' },
            citation: {
              sourceType: 'contract',
              sourceId: 'doc_1',
              label: 'Section 4.1',
              excerpt: 'Minimum monthly commitment of USD 10,000.'
            },
            source_excerpt: 'Minimum monthly commitment of USD 10,000.',
            confidence: 0.96,
            needs_review: false,
            reasoning_summary: 'The clause explicitly states the minimum commitment.'
          }
        ]
      },
      { sourceDocumentId: 'doc_1' }
    );

    expect(parsed.terms[0]?.term_type).toBe('minimum_commitment');
    expect(parsed.terms[0]?.normalized_value).toEqual({ amountMinor: 1_000_000, currency: 'USD' });
  });

  it('upgrades structured generic billing notes into usage allowance terms', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_type: 'special_billing_note',
            value: { text: '100,000 API calls' },
            normalized_value: { text: '100,000 API calls' },
            citation: {
              sourceType: 'contract',
              sourceId: 'doc_1',
              label: 'Usage allowance',
              excerpt: 'The monthly subscription includes 100,000 API calls per calendar month.'
            },
            source_excerpt: 'The monthly subscription includes 100,000 API calls per calendar month.',
            confidence: 0.9,
            needs_review: false,
            reasoning_summary: 'The clause describes included usage.'
          }
        ]
      },
      { sourceDocumentId: 'doc_1' }
    );

    expect(parsed.terms[0]?.term_type).toBe('usage_allowance');
    expect(parsed.terms[0]?.normalized_value).toEqual({ metricName: 'api_calls', quantity: 100_000, period: 'monthly' });
    expect(parsed.terms[0]?.period).toBe('monthly');
    expect(parsed.terms[0]?.needs_review).toBe(false);
  });

  it('corrects structured terms when Gemini used the wrong valid label', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_type: 'customer_name',
            value: { text: 'Customer will pay a minimum monthly commitment of USD 10,000 for the platform subscription.' },
            normalized_value: { text: 'Customer will pay a minimum monthly commitment of USD 10,000 for the platform subscription.' },
            citation: {
              sourceType: 'contract',
              sourceId: 'doc_1',
              label: 'Minimum commitment',
              excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000 for the platform subscription.'
            },
            source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000 for the platform subscription.',
            confidence: 0.9,
            needs_review: false,
            reasoning_summary: 'The clause describes a customer obligation.'
          },
          {
            term_type: 'usage_allowance',
            value: { text: 'Usage above the included allowance will be billed at USD 0.01 per additional API call.' },
            normalized_value: { text: 'Usage above the included allowance will be billed at USD 0.01 per additional API call.' },
            citation: {
              sourceType: 'contract',
              sourceId: 'doc_1',
              label: 'Overage price',
              excerpt: 'Usage above the included allowance will be billed at USD 0.01 per additional API call.'
            },
            source_excerpt: 'Usage above the included allowance will be billed at USD 0.01 per additional API call.',
            confidence: 0.9,
            needs_review: false,
            reasoning_summary: 'The clause describes usage handling.'
          }
        ]
      },
      { sourceDocumentId: 'doc_1' }
    );

    expect(parsed.terms.map((term) => term.term_type)).toEqual(['minimum_commitment', 'overage_price']);
    expect(parsed.terms[0]?.normalized_value).toEqual({ amountMinor: 1_000_000, currency: 'USD', period: 'monthly' });
    expect(parsed.terms[1]?.normalized_value).toEqual({ amountMinor: 1, currency: 'USD', metricName: 'api_calls' });
  });

  it('corrects raw special billing labels before saving minimum commitment terms', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_type: 'special_billing_note',
            value: 'USD 10,000',
            citation: 'chunk_minimum',
            source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000 for the platform subscription.',
            confidence: 'high',
            reasoning_summary: 'The value is a monthly customer payment obligation.'
          }
        ]
      },
      { sourceDocumentId: 'doc_contract' }
    );

    expect(parsed.terms[0]?.term_type).toBe('minimum_commitment');
    expect(parsed.terms[0]?.normalized_value).toEqual({ amountMinor: 1_000_000, currency: 'USD' });
  });

  it('recognizes customer and supplier header clauses without overmatching obligations', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_type: 'special_billing_note',
            value: 'Customer: Alpha Retail Cloud Ltd.',
            citation: 'chunk_customer',
            source_excerpt: 'Customer: Alpha Retail Cloud Ltd.',
            confidence: 'high',
            reasoning_summary: 'Header names the customer.'
          },
          {
            term_type: 'special_billing_note',
            value: 'Supplier: ExampleSoft Inc.',
            citation: 'chunk_supplier',
            source_excerpt: 'Supplier: ExampleSoft Inc.',
            confidence: 'high',
            reasoning_summary: 'Header names the supplier.'
          },
          {
            term_type: 'special_billing_note',
            value: 'Customer will pay a minimum monthly commitment of USD 10,000.',
            citation: 'chunk_minimum',
            source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.',
            confidence: 'high',
            reasoning_summary: 'Customer obligation clause.'
          }
        ]
      },
      { sourceDocumentId: 'doc_contract' }
    );

    expect(parsed.terms.map((term) => term.term_type)).toEqual(['customer_name', 'supplier_name', 'minimum_commitment']);
  });

  it('normalizes Gemini-friendly labels, citations, and confidence strings', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_name: 'Minimum Monthly Commitment',
            value: 'USD 10,000 per month',
            citation: 'chunk_minimum',
            source_excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.',
            confidence: 'high',
            reasoning_summary: 'Explicit minimum commitment clause.'
          },
          {
            term_name: 'Monthly Usage Allowance',
            value: '100,000 API calls per month',
            citation: 'chunk_usage',
            source_excerpt: 'The plan includes 100,000 API calls per month.',
            confidence: 'high'
          },
          {
            term_name: 'Overage Rate',
            value: 'USD 0.01 per API call',
            citation: 'chunk_overage',
            source_excerpt: 'Overage usage is charged at USD 0.01 per API call.',
            confidence: 'medium'
          }
        ]
      },
      { sourceDocumentId: 'doc_contract' }
    );

    expect(parsed.terms.map((term) => term.term_type)).toEqual(['minimum_commitment', 'usage_allowance', 'overage_price']);
    expect(parsed.terms[0]?.normalized_value).toEqual({ amountMinor: 1_000_000, currency: 'USD', period: 'monthly' });
    expect(parsed.terms[1]?.normalized_value).toEqual({ metricName: 'api_calls', quantity: 100_000, period: 'monthly' });
    expect(parsed.terms[2]?.normalized_value).toEqual({ amountMinor: 1, currency: 'USD', metricName: 'api_calls' });
    expect(parsed.terms[2]?.needs_review).toBe(true);
  });

  it('preserves page labels when Gemini cites a page-aware chunk id', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_type: 'payment_terms',
            value: 'Net 30',
            normalized_value: { dueDays: 30 },
            citation: {
              sourceType: 'contract',
              sourceId: 'chunk_page_4_2',
              label: 'Section 8.2',
              excerpt: 'Invoices are payable Net 30 from invoice date.'
            },
            source_excerpt: 'Invoices are payable Net 30 from invoice date.',
            confidence: 0.92,
            needs_review: false,
            reasoning_summary: 'The payment terms clause explicitly says Net 30.'
          }
        ]
      },
      {
        sourceDocumentId: 'doc_contract',
        sourceLabelsById: {
          chunk_page_4_2: 'Page 4, chunk 2'
        }
      }
    );

    expect(parsed.terms[0]?.citation).toMatchObject({
      sourceId: 'chunk_page_4_2',
      label: 'Page 4, chunk 2 - Section 8.2'
    });
  });

  it('uses image labels when raw citations only provide the image chunk id', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_name: 'Discount',
            value: '20%',
            citation: 'chunk_image_1',
            source_excerpt: 'Customer receives a 20% promotional discount.',
            confidence: 'high'
          }
        ]
      },
      {
        sourceDocumentId: 'doc_contract',
        sourceLabelsById: {
          chunk_image_1: 'Image 1'
        }
      }
    );

    expect(parsed.terms[0]?.citation.label).toBe('Image 1');
  });

  it('splits a promotional discount that contains an expiry date', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_name: 'Promotional Discount',
            value: '20% promotional discount until March 31, 2026',
            citation: 'chunk_discount',
            source_excerpt: 'Customer receives a 20% promotional discount until March 31, 2026.',
            confidence: 'high'
          }
        ]
      },
      { sourceDocumentId: 'doc_contract' }
    );

    expect(parsed.terms.map((term) => term.term_type)).toEqual(['discount', 'discount_expiry']);
    expect(parsed.terms[0]?.normalized_value).toEqual({ percent: 20 });
    expect(parsed.terms[1]?.normalized_value).toEqual({ date: '2026-03-31' });
  });

  it('marks raw terms as needs_review when citation evidence is missing', () => {
    const parsed = normalizeContractExtraction(
      {
        terms: [
          {
            term_name: 'Payment Terms',
            value: 'Net 30',
            source_excerpt: 'Invoices are payable Net 30 from invoice date.',
            confidence: 'high'
          }
        ]
      },
      { sourceDocumentId: 'doc_contract' }
    );

    expect(parsed.terms[0]?.term_type).toBe('payment_terms');
    expect(parsed.terms[0]?.normalized_value).toEqual({ dueDays: 30 });
    expect(parsed.terms[0]?.needs_review).toBe(true);
    expect(parsed.terms[0]?.citation.excerpt).toContain('Net 30');
  });
});
