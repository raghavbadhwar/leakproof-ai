import { describe, expect, it } from 'vitest';
import { findExpiredDiscountStillApplied, findMinimumCommitmentShortfall, reconcileLeakage } from './reconcile';
import type { Citation, ContractTerm, InvoiceRecord } from './types';

const contractCitation: Citation = {
  sourceType: 'contract',
  sourceId: 'contract_doc',
  label: 'Contract section'
};

const invoiceCitation: Citation = {
  sourceType: 'invoice',
  sourceId: 'invoice_row',
  label: 'invoices.csv row'
};

function term(input: {
  id: string;
  type: ContractTerm['type'];
  value: unknown;
  customerId?: string;
  sourceId?: string;
}): ContractTerm {
  return {
    id: input.id,
    customerId: input.customerId ?? 'customer_alpha',
    type: input.type,
    value: input.value,
    citation: { ...contractCitation, sourceId: input.sourceId ?? 'contract_doc' },
    confidence: 0.94,
    reviewStatus: 'approved'
  };
}

function invoice(amountMinor: number): InvoiceRecord {
  return {
    id: 'invoice_1',
    customerId: 'customer_alpha',
    invoiceId: 'INV-001',
    invoiceDate: '2026-04-30',
    servicePeriodStart: '2026-04-01',
    lineItem: 'Monthly platform fee',
    amountMinor,
    currency: 'USD',
    citation: invoiceCitation
  };
}

describe('contract hierarchy reconciliation safety', () => {
  it('uses a later amendment discount when explicit precedence is present', () => {
    const terms = [
      term({
        id: 'term_discount_original',
        type: 'discount',
        value: { percent: 20, effectiveDate: '2026-01-01', documentRole: 'order_form' }
      }),
      term({
        id: 'term_discount_later',
        type: 'discount',
        value: { percent: 10, effectiveDate: '2026-04-01', documentRole: 'amendment' },
        sourceId: 'amendment_doc'
      }),
      term({
        id: 'term_discount_expiry',
        type: 'discount_expiry',
        value: { date: '2026-03-31' }
      })
    ];

    const finding = findExpiredDiscountStillApplied({
      customerId: 'customer_alpha',
      terms,
      invoices: [
        {
          ...invoice(-100_000),
          lineItem: 'Promotional discount'
        }
      ]
    });

    expect(finding?.estimatedAmount.amountMinor).toBe(100_000);
  });

  it('does not create recoverable leakage from unresolved conflicting minimum commitments', () => {
    const terms = [
      term({
        id: 'term_minimum_a',
        type: 'minimum_commitment',
        value: { amountMinor: 100_000, currency: 'USD' }
      }),
      term({
        id: 'term_minimum_b',
        type: 'minimum_commitment',
        value: { amountMinor: 80_000, currency: 'USD' },
        sourceId: 'other_contract_doc'
      })
    ];

    expect(findMinimumCommitmentShortfall({ customerId: 'customer_alpha', terms, invoices: [invoice(90_000)] })).toBeNull();

    const findings = reconcileLeakage({
      customerId: 'customer_alpha',
      terms,
      invoices: [invoice(90_000)],
      usage: []
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'amendment_conflict',
      outcomeType: 'risk_alert',
      estimatedAmount: { amountMinor: 0 },
      status: 'needs_review'
    });
  });

  it('keeps ambiguous conflicting base fee terms as a zero-dollar review risk', () => {
    const findings = reconcileLeakage({
      customerId: 'customer_alpha',
      terms: [
        term({ id: 'term_base_a', type: 'base_fee', value: { amountMinor: 100_000, currency: 'USD' } }),
        term({ id: 'term_base_b', type: 'base_fee', value: { amountMinor: 120_000, currency: 'USD' } })
      ],
      invoices: [invoice(100_000)],
      usage: []
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        type: 'amendment_conflict',
        estimatedAmount: expect.objectContaining({ amountMinor: 0 })
      })
    );
    expect(findings.some((finding) => finding.outcomeType === 'recoverable_leakage')).toBe(false);
  });
});
