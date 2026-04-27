import { describe, expect, it } from 'vitest';
import {
  findExpiredDiscountStillApplied,
  findMinimumCommitmentShortfall,
  findMissedAnnualUplift,
  findPaymentTermsMismatch,
  findSeatUnderbilling,
  findUsageOverageUnbilled,
  reconcileLeakage
} from './reconcile';
import type { Citation, ContractTerm, InvoiceRecord, UsageRecord } from './types';

const contractCitation: Citation = {
  sourceType: 'contract',
  sourceId: 'contract_alpha',
  label: 'Contract section 4'
};

const invoiceCitation: Citation = {
  sourceType: 'invoice',
  sourceId: 'invoice_row',
  label: 'invoices.csv row'
};

const usageCitation: Citation = {
  sourceType: 'usage',
  sourceId: 'usage_row',
  label: 'usage.csv row'
};

function term(type: ContractTerm['type'], value: unknown, customerId = 'customer_alpha'): ContractTerm {
  return {
    id: `${customerId}_${type}`,
    customerId,
    type,
    value,
    citation: contractCitation,
    confidence: 0.95,
    reviewStatus: 'approved'
  };
}

function invoice(input: Partial<InvoiceRecord> & Pick<InvoiceRecord, 'id' | 'customerId' | 'invoiceDate' | 'amountMinor'>): InvoiceRecord {
  return {
    invoiceId: input.id,
    lineItem: 'Monthly platform fee',
    currency: 'USD',
    citation: { ...invoiceCitation, sourceId: input.id, label: `${input.id} row` },
    ...input
  };
}

function usage(input: Pick<UsageRecord, 'id' | 'customerId' | 'periodStart' | 'periodEnd' | 'metricName' | 'quantity'>): UsageRecord {
  return {
    citation: { ...usageCitation, sourceId: input.id, label: `${input.id} row` },
    ...input
  };
}

describe('period-aware finance reconciliation', () => {
  it('finds monthly minimum commitment shortfall without letting another month offset it', () => {
    const terms = [term('minimum_commitment', { amountMinor: 1_000_000, currency: 'USD', frequency: 'monthly' })];
    const invoices = [
      invoice({ id: 'inv_jan', customerId: 'customer_alpha', invoiceDate: '2026-01-31', amountMinor: 800_000 }),
      invoice({ id: 'inv_feb', customerId: 'customer_alpha', invoiceDate: '2026-02-28', amountMinor: 1_200_000 })
    ];

    const finding = findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(200_000);
    expect(finding?.calculation.periodShortfalls).toHaveLength(1);
  });

  it('finds annual minimum commitment shortfall across invoice rows in the annual billing period', () => {
    const terms = [
      term('contract_start_date', { date: '2026-01-01' }),
      term('minimum_commitment', { amountMinor: 12_000_000, currency: 'USD', frequency: 'annual' })
    ];
    const invoices = [
      invoice({ id: 'inv_q1', customerId: 'customer_alpha', invoiceDate: '2026-03-31', servicePeriodStart: '2026-01-01', amountMinor: 3_000_000 }),
      invoice({ id: 'inv_q2', customerId: 'customer_alpha', invoiceDate: '2026-06-30', servicePeriodStart: '2026-04-01', amountMinor: 3_000_000 }),
      invoice({ id: 'inv_q3', customerId: 'customer_alpha', invoiceDate: '2026-09-30', servicePeriodStart: '2026-07-01', amountMinor: 3_000_000 }),
      invoice({ id: 'inv_q4', customerId: 'customer_alpha', invoiceDate: '2026-12-31', servicePeriodStart: '2026-10-01', amountMinor: 2_400_000 })
    ];

    const finding = findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(600_000);
    expect(finding?.calculation.periodShortfalls).toHaveLength(1);
  });

  it('calculates usage overage per billing period instead of comparing total usage to total billed overage', () => {
    const terms = [
      term('usage_allowance', { metricName: 'api_calls', quantity: 100, frequency: 'monthly' }),
      term('overage_price', { metricName: 'api_calls', amountMinor: 100, currency: 'USD', frequency: 'monthly' })
    ];
    const records = [
      usage({
        id: 'usage_mar',
        customerId: 'customer_alpha',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        metricName: 'api_calls',
        quantity: 120
      }),
      usage({
        id: 'usage_apr',
        customerId: 'customer_alpha',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        metricName: 'api_calls',
        quantity: 80
      })
    ];
    const invoices = [
      invoice({
        id: 'inv_mar_overage',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        servicePeriodStart: '2026-03-01',
        lineItem: 'Usage overage',
        amountMinor: 1_000
      }),
      invoice({
        id: 'inv_feb_overage',
        customerId: 'customer_alpha',
        invoiceDate: '2026-02-28',
        servicePeriodStart: '2026-02-01',
        lineItem: 'Usage overage',
        amountMinor: 2_000
      })
    ];

    const finding = findUsageOverageUnbilled({ customerId: 'customer_alpha', terms, usage: records, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(1_000);
    expect(finding?.calculation.periodShortfalls).toHaveLength(1);
  });

  it('calculates seat underbilling per month without using seats billed in another month as an offset', () => {
    const terms = [term('seat_price', { amountMinor: 4_000, currency: 'USD', frequency: 'monthly' })];
    const records = [
      usage({
        id: 'usage_jan_seats',
        customerId: 'customer_alpha',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        metricName: 'seats',
        quantity: 100
      }),
      usage({
        id: 'usage_feb_seats',
        customerId: 'customer_alpha',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        metricName: 'seats',
        quantity: 100
      })
    ];
    const invoices = [
      invoice({
        id: 'inv_jan_seats',
        customerId: 'customer_alpha',
        invoiceDate: '2026-01-31',
        servicePeriodStart: '2026-01-01',
        lineItem: 'Platform seats',
        quantity: 90,
        amountMinor: 360_000
      }),
      invoice({
        id: 'inv_feb_seats',
        customerId: 'customer_alpha',
        invoiceDate: '2026-02-28',
        servicePeriodStart: '2026-02-01',
        lineItem: 'Platform seats',
        quantity: 110,
        amountMinor: 440_000
      })
    ];

    const finding = findSeatUnderbilling({ customerId: 'customer_alpha', terms, usage: records, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(40_000);
    expect(finding?.calculation.periodShortfalls).toHaveLength(1);
  });

  it('uses invoice service period start to catch expired discounts after the expiry date', () => {
    const terms = [
      term('discount', { percent: 20 }),
      term('discount_expiry', { date: '2026-03-31' })
    ];
    const invoices = [
      invoice({
        id: 'inv_apr_discount',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-15',
        servicePeriodStart: '2026-04-01',
        lineItem: 'Promotional discount',
        amountMinor: -200_000
      })
    ];

    const finding = findExpiredDiscountStillApplied({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(200_000);
    expect(finding?.outcomeType).toBe('recoverable_leakage');
  });

  it('sums missed annual uplift across multiple post-anniversary monthly periods', () => {
    const terms = [
      term('contract_start_date', { date: '2025-01-01' }),
      term('base_fee', { amountMinor: 100_000, currency: 'USD', frequency: 'monthly' }),
      term('annual_uplift', { percent: 5 })
    ];
    const invoices = [
      invoice({ id: 'inv_dec', customerId: 'customer_alpha', invoiceDate: '2025-12-31', servicePeriodStart: '2025-12-01', amountMinor: 100_000 }),
      invoice({ id: 'inv_jan', customerId: 'customer_alpha', invoiceDate: '2026-01-31', servicePeriodStart: '2026-01-01', amountMinor: 100_000 }),
      invoice({ id: 'inv_feb', customerId: 'customer_alpha', invoiceDate: '2026-02-28', servicePeriodStart: '2026-02-01', amountMinor: 100_000 })
    ];

    const finding = findMissedAnnualUplift({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(10_000);
    expect(finding?.calculation.periodShortfalls).toHaveLength(2);
  });

  it('does not create false positives when invoices are correct for each period', () => {
    const terms = [
      term('contract_start_date', { date: '2025-01-01' }),
      term('minimum_commitment', { amountMinor: 1_000_000, currency: 'USD', frequency: 'monthly' }),
      term('usage_allowance', { metricName: 'api_calls', quantity: 100, frequency: 'monthly' }),
      term('overage_price', { metricName: 'api_calls', amountMinor: 100, currency: 'USD', frequency: 'monthly' }),
      term('seat_price', { amountMinor: 4_000, currency: 'USD', frequency: 'monthly' }),
      term('discount', { percent: 20 }),
      term('discount_expiry', { date: '2026-03-31' }),
      term('base_fee', { amountMinor: 1_000_000, currency: 'USD', frequency: 'monthly' }),
      term('annual_uplift', { percent: 5 }),
      term('payment_terms', { days: 30 })
    ];
    const invoices = [
      invoice({
        id: 'inv_platform',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        servicePeriodStart: '2026-03-01',
        lineItem: 'Monthly platform fee Net 30',
        amountMinor: 1_050_000
      }),
      invoice({
        id: 'inv_seats',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        servicePeriodStart: '2026-03-01',
        lineItem: 'Platform seats Net 30',
        quantity: 100,
        amountMinor: 400_000
      }),
      invoice({
        id: 'inv_overage',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        servicePeriodStart: '2026-03-01',
        lineItem: 'Usage overage Net 30',
        amountMinor: 1_000
      })
    ];
    const records = [
      usage({
        id: 'usage_api',
        customerId: 'customer_alpha',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        metricName: 'api_calls',
        quantity: 110
      }),
      usage({
        id: 'usage_seats',
        customerId: 'customer_alpha',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        metricName: 'seats',
        quantity: 100
      })
    ];

    expect(reconcileLeakage({ customerId: 'customer_alpha', terms, invoices, usage: records })).toEqual([]);
  });

  it('keeps mixed customers isolated during period reconciliation', () => {
    const terms = [term('minimum_commitment', { amountMinor: 1_000_000, currency: 'USD', frequency: 'monthly' })];
    const invoices = [
      invoice({ id: 'inv_alpha', customerId: 'customer_alpha', invoiceDate: '2026-03-31', amountMinor: 1_000_000 }),
      invoice({ id: 'inv_beta', customerId: 'customer_beta', invoiceDate: '2026-03-31', amountMinor: 100_000 })
    ];

    expect(findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices })).toBeNull();
  });

  it('creates a payment terms mismatch finding when invoice evidence conflicts with approved terms', () => {
    const terms = [term('payment_terms', { days: 30 })];
    const invoices = [
      invoice({
        id: 'inv_net_45',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        lineItem: 'Monthly platform fee Net 45',
        amountMinor: 1_000_000
      })
    ];

    const finding = findPaymentTermsMismatch({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.type).toBe('payment_terms_mismatch');
    expect(finding?.estimatedAmount.amountMinor).toBe(0);
    expect(finding?.status).toBe('needs_review');
  });

  it('splits invoice evidence by currency instead of comparing mixed currencies', () => {
    const terms = [term('minimum_commitment', { amountMinor: 1_000_000, currency: 'USD', frequency: 'monthly' })];
    const invoices = [
      invoice({ id: 'inv_usd', customerId: 'customer_alpha', invoiceDate: '2026-03-31', amountMinor: 800_000, currency: 'USD' }),
      invoice({ id: 'inv_eur', customerId: 'customer_alpha', invoiceDate: '2026-03-31', amountMinor: 900_000, currency: 'EUR' })
    ];

    const finding = findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.estimatedAmount).toEqual({ amountMinor: 200_000, currency: 'USD' });
    expect(finding?.citations.some((citation) => citation.sourceId === 'inv_eur')).toBe(false);
  });

  it('ignores negative credit notes when checking minimum commitment underbilling', () => {
    const terms = [term('minimum_commitment', { amountMinor: 1_000_000, currency: 'USD', frequency: 'monthly' })];
    const invoices = [
      invoice({ id: 'inv_platform', customerId: 'customer_alpha', invoiceDate: '2026-03-31', amountMinor: 1_000_000 }),
      invoice({
        id: 'inv_credit',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        lineItem: 'Credit note for service issue',
        amountMinor: -200_000
      })
    ];

    expect(findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices })).toBeNull();
  });

  it('does not apply monthly annual uplift logic to one-time fee rows', () => {
    const terms = [
      term('contract_start_date', { date: '2025-01-01' }),
      term('base_fee', { amountMinor: 100_000, currency: 'USD', frequency: 'monthly' }),
      term('annual_uplift', { percent: 5 })
    ];
    const invoices = [
      invoice({
        id: 'inv_setup',
        customerId: 'customer_alpha',
        invoiceDate: '2026-01-31',
        servicePeriodStart: '2026-01-01',
        lineItem: 'One-time implementation fee',
        amountMinor: 100_000
      })
    ];

    expect(findMissedAnnualUplift({ customerId: 'customer_alpha', terms, invoices })).toBeNull();
  });

  it('does not double count annual uplift when an invoice already includes an uplift line', () => {
    const terms = [
      term('contract_start_date', { date: '2025-01-01' }),
      term('base_fee', { amountMinor: 100_000, currency: 'USD', frequency: 'monthly' }),
      term('annual_uplift', { percent: 5 })
    ];
    const invoices = [
      invoice({
        id: 'inv_base',
        customerId: 'customer_alpha',
        invoiceDate: '2026-01-31',
        servicePeriodStart: '2026-01-01',
        lineItem: 'Monthly platform fee',
        amountMinor: 100_000
      }),
      invoice({
        id: 'inv_uplift',
        customerId: 'customer_alpha',
        invoiceDate: '2026-01-31',
        servicePeriodStart: '2026-01-01',
        lineItem: 'Annual uplift adjustment',
        amountMinor: 5_000
      })
    ];

    expect(findMissedAnnualUplift({ customerId: 'customer_alpha', terms, invoices })).toBeNull();
  });

  it('uses explicit payment terms days before line item text', () => {
    const terms = [term('payment_terms', { days: 30 })];
    const invoices = [
      invoice({
        id: 'inv_explicit_terms',
        customerId: 'customer_alpha',
        invoiceDate: '2026-03-31',
        lineItem: 'Monthly platform fee Net 30',
        paymentTermsDays: 45,
        amountMinor: 1_000_000
      })
    ];

    const finding = findPaymentTermsMismatch({ customerId: 'customer_alpha', terms, invoices });

    expect(finding?.outcomeType).toBe('risk_alert');
    expect(finding?.estimatedAmount.amountMinor).toBe(0);
    expect(finding?.calculation).toMatchObject({
      mismatches: [{ invoiceTermsDays: 45, evidenceSource: 'payment_terms_days' }]
    });
  });

  it('only flags the missing amount when usage overage was partially billed', () => {
    const terms = [
      term('usage_allowance', { metricName: 'api_calls', quantity: 100, frequency: 'monthly' }),
      term('overage_price', { metricName: 'api_calls', amountMinor: 100, currency: 'USD', frequency: 'monthly' })
    ];
    const records = [
      usage({
        id: 'usage_may',
        customerId: 'customer_alpha',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        metricName: 'api_calls',
        quantity: 150
      })
    ];
    const invoices = [
      invoice({
        id: 'inv_may_overage',
        customerId: 'customer_alpha',
        invoiceDate: '2026-05-31',
        servicePeriodStart: '2026-05-01',
        lineItem: 'Usage overage',
        amountMinor: 3_000
      })
    ];

    const finding = findUsageOverageUnbilled({ customerId: 'customer_alpha', terms, usage: records, invoices });

    expect(finding?.estimatedAmount.amountMinor).toBe(2_000);
    expect(finding?.calculation).toMatchObject({
      unbilledMinor: 2_000,
      periodShortfalls: [{ expectedOverageMinor: 5_000, billedOverageMinor: 3_000, unbilledMinor: 2_000 }]
    });
  });
});
