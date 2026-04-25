import { describe, expect, it } from 'vitest';
import {
  findAmendmentConflict,
  findExpiredDiscountStillApplied,
  findMissedAnnualUplift,
  findRenewalWindowRisk,
  findSeatUnderbilling
} from './reconcile';
import type { ContractTerm, InvoiceRecord, UsageRecord } from './types';

const contractCitation = {
  sourceType: 'contract' as const,
  sourceId: 'contract_alpha',
  label: 'Section 4'
};

const invoiceCitation = {
  sourceType: 'invoice' as const,
  sourceId: 'invoice_row_1',
  label: 'invoices.csv row 2'
};

const usageCitation = {
  sourceType: 'usage' as const,
  sourceId: 'usage_row_1',
  label: 'usage.csv row 2'
};

describe('expanded reconciliation rules', () => {
  it('creates a seat underbilling finding when billed seats are below actual seats', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_seat_price',
        customerId: 'customer_alpha',
        type: 'seat_price',
        value: { amountMinor: 4_000, currency: 'USD' },
        citation: contractCitation,
        confidence: 0.94,
        reviewStatus: 'approved'
      }
    ];
    const invoices: InvoiceRecord[] = [
      {
        id: 'invoice_1',
        customerId: 'customer_alpha',
        invoiceId: 'INV-001',
        invoiceDate: '2026-03-31',
        lineItem: 'Platform seats',
        quantity: 80,
        unitPriceMinor: 4_000,
        amountMinor: 320_000,
        currency: 'USD',
        citation: invoiceCitation
      }
    ];
    const usage: UsageRecord[] = [
      {
        id: 'usage_1',
        customerId: 'customer_alpha',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        metricName: 'seats',
        quantity: 100,
        citation: usageCitation
      }
    ];

    expect(findSeatUnderbilling({ customerId: 'customer_alpha', terms, invoices, usage })?.estimatedAmount.amountMinor).toBe(80_000);
  });

  it('creates an expired discount finding when a discount line remains after expiry', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_discount',
        customerId: 'customer_alpha',
        type: 'discount',
        value: { percent: 20 },
        citation: contractCitation,
        confidence: 0.91,
        reviewStatus: 'approved'
      },
      {
        id: 'term_discount_expiry',
        customerId: 'customer_alpha',
        type: 'discount_expiry',
        value: { date: '2026-03-31' },
        citation: contractCitation,
        confidence: 0.91,
        reviewStatus: 'approved'
      }
    ];
    const invoices: InvoiceRecord[] = [
      {
        id: 'invoice_1',
        customerId: 'customer_alpha',
        invoiceId: 'INV-004',
        invoiceDate: '2026-04-30',
        lineItem: 'Promotional discount',
        amountMinor: -200_000,
        currency: 'USD',
        citation: invoiceCitation
      }
    ];

    expect(findExpiredDiscountStillApplied({ customerId: 'customer_alpha', terms, invoices })?.estimatedAmount.amountMinor).toBe(200_000);
  });

  it('creates a missed uplift finding when invoices after anniversary do not include the uplift', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_base_fee',
        customerId: 'customer_alpha',
        type: 'base_fee',
        value: { amountMinor: 1_000_000, currency: 'USD' },
        citation: contractCitation,
        confidence: 0.94,
        reviewStatus: 'approved'
      },
      {
        id: 'term_start',
        customerId: 'customer_alpha',
        type: 'contract_start_date',
        value: { date: '2026-01-01' },
        citation: contractCitation,
        confidence: 0.96,
        reviewStatus: 'approved'
      },
      {
        id: 'term_uplift',
        customerId: 'customer_alpha',
        type: 'annual_uplift',
        value: { percent: 5 },
        citation: contractCitation,
        confidence: 0.92,
        reviewStatus: 'approved'
      }
    ];
    const invoices: InvoiceRecord[] = [
      {
        id: 'invoice_2027',
        customerId: 'customer_alpha',
        invoiceId: 'INV-2027-01',
        invoiceDate: '2027-01-31',
        lineItem: 'Monthly platform fee',
        amountMinor: 1_000_000,
        currency: 'USD',
        citation: invoiceCitation
      }
    ];

    expect(findMissedAnnualUplift({ customerId: 'customer_alpha', terms, invoices })?.estimatedAmount.amountMinor).toBe(50_000);
  });

  it('creates a renewal risk finding when notice deadline is near', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_end',
        customerId: 'customer_alpha',
        type: 'contract_end_date',
        value: { date: '2026-06-30' },
        citation: contractCitation,
        confidence: 0.96,
        reviewStatus: 'approved'
      },
      {
        id: 'term_notice',
        customerId: 'customer_alpha',
        type: 'notice_period',
        value: { days: 30 },
        citation: contractCitation,
        confidence: 0.92,
        reviewStatus: 'approved'
      }
    ];

    const finding = findRenewalWindowRisk({ customerId: 'customer_alpha', terms, asOfDate: '2026-05-25' });
    expect(finding?.outcomeType).toBe('risk_alert');
    expect(finding?.status).toBe('needs_review');
  });

  it('creates a needs-review amendment conflict without claiming leakage amount', () => {
    const terms: ContractTerm[] = [
      {
        id: 'term_original',
        customerId: 'customer_alpha',
        type: 'base_fee',
        value: { amountMinor: 1_000_000, currency: 'USD', effectiveDate: '2026-01-01' },
        citation: contractCitation,
        confidence: 0.94,
        reviewStatus: 'approved'
      },
      {
        id: 'term_amendment',
        customerId: 'customer_alpha',
        type: 'amendment',
        value: { supersedes: 'base_fee', amountMinor: 1_200_000, currency: 'USD', effectiveDate: '2026-03-01' },
        citation: { ...contractCitation, sourceId: 'amendment_1', label: 'Amendment section 2' },
        confidence: 0.9,
        reviewStatus: 'approved'
      }
    ];

    const finding = findAmendmentConflict({ customerId: 'customer_alpha', terms });
    expect(finding?.estimatedAmount.amountMinor).toBe(0);
    expect(finding?.status).toBe('needs_review');
  });
});
