import { describe, expect, it } from 'vitest';
import { findMinimumCommitmentShortfall, findUsageOverageUnbilled } from './reconcile';
import type { ContractTerm, InvoiceRecord, UsageRecord } from './types';

const contractCitation = {
  sourceType: 'contract' as const,
  sourceId: 'contract_alpha',
  label: 'Section 4.1',
  excerpt: 'Customer will pay a minimum monthly commitment of USD 10,000.'
};

const usageCitation = {
  sourceType: 'usage' as const,
  sourceId: 'usage_row_1',
  label: 'usage.csv row 2'
};

const invoiceCitation = {
  sourceType: 'invoice' as const,
  sourceId: 'invoice_row_1',
  label: 'invoices.csv row 2'
};

describe('minimum commitment reconciliation', () => {
  it('creates a shortfall finding when invoice total is below approved minimum commitment', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_minimum',
        customerId: 'customer_alpha',
        type: 'minimum_commitment',
        value: { amountMinor: 1_000_000, currency: 'USD' },
        citation: contractCitation,
        confidence: 0.96,
        reviewStatus: 'approved'
      }
    ];

    const invoices: InvoiceRecord[] = [
      {
        id: 'invoice_1',
        customerId: 'customer_alpha',
        invoiceId: 'INV-001',
        invoiceDate: '2026-03-31',
        lineItem: 'Monthly platform fee',
        amountMinor: 800_000,
        currency: 'USD',
        citation: invoiceCitation
      }
    ];

    const finding = findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(200_000);
    expect(finding?.type).toBe('minimum_commitment_shortfall');
  });

  it('does not create a finding when invoice total meets the minimum', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_minimum',
        customerId: 'customer_alpha',
        type: 'minimum_commitment',
        value: { amountMinor: 1_000_000, currency: 'USD' },
        citation: contractCitation,
        confidence: 0.96,
        reviewStatus: 'approved'
      }
    ];

    const invoices: InvoiceRecord[] = [
      {
        id: 'invoice_1',
        customerId: 'customer_alpha',
        invoiceId: 'INV-001',
        invoiceDate: '2026-03-31',
        lineItem: 'Monthly platform fee',
        amountMinor: 1_000_000,
        currency: 'USD',
        citation: invoiceCitation
      }
    ];

    expect(findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices })).toBeNull();
  });
});

describe('usage overage reconciliation', () => {
  it('creates a finding when usage exceeds allowance and no overage is billed', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_allowance',
        customerId: 'customer_alpha',
        type: 'usage_allowance',
        value: { metricName: 'api_calls', quantity: 100_000 },
        citation: contractCitation,
        confidence: 0.94,
        reviewStatus: 'approved'
      },
      {
        id: 'term_overage',
        customerId: 'customer_alpha',
        type: 'overage_price',
        value: { metricName: 'api_calls', amountMinor: 1, currency: 'USD' },
        citation: contractCitation,
        confidence: 0.94,
        reviewStatus: 'approved'
      }
    ];

    const usage: UsageRecord[] = [
      {
        id: 'usage_1',
        customerId: 'customer_alpha',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        metricName: 'api_calls',
        quantity: 125_000,
        citation: usageCitation
      }
    ];

    const invoices: InvoiceRecord[] = [];

    const finding = findUsageOverageUnbilled({ customerId: 'customer_alpha', terms, usage, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(25_000);
    expect(finding?.type).toBe('usage_overage_unbilled');
  });
});
