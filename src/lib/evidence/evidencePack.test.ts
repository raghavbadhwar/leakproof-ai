import { describe, expect, it } from 'vitest';
import { generateEvidencePack } from './evidencePack';
import type { LeakageFinding } from '../leakage/types';

const finding: LeakageFinding = {
  id: 'finding_usage_customer_alpha',
  customerId: 'customer_alpha',
  type: 'usage_overage_unbilled',
  title: 'Usage exceeded allowance without full overage billing',
  summary: 'Usage exceeded the allowance by 25,000 api_calls.',
  outcomeType: 'recoverable_leakage',
  estimatedAmount: { amountMinor: 25_000, currency: 'USD' },
  confidence: 0.92,
  status: 'draft',
  calculation: {
    formula: '(usage - allowance) * overage_price - billed_overage',
    overageQuantity: 25_000,
    overagePriceMinor: 1,
    unbilledMinor: 25_000
  },
  citations: [
    { sourceType: 'contract', sourceId: 'contract_alpha', label: 'Section 4.2', excerpt: 'USD 0.01 per additional API call.' },
    { sourceType: 'usage', sourceId: 'usage_row_1', label: 'usage.csv row 2' }
  ]
};

describe('evidence pack generation', () => {
  it('creates a CFO-ready pack with citations, calculation, and human approval requirement', () => {
    const pack = generateEvidencePack(finding, { customerName: 'Alpha Retail Cloud Ltd.', periodLabel: 'March 2026' });

    expect(pack.summary).toContain('Alpha Retail Cloud Ltd.');
    expect(pack.calculationRows.some((row) => row.label === 'formula')).toBe(true);
    expect(pack.citations).toHaveLength(2);
    expect(pack.draftCustomerMessage).toContain('please confirm');
    expect(pack.requiresHumanApproval).toBe(true);
  });

  it('refuses to create a pack without citations', () => {
    expect(() => generateEvidencePack({ ...finding, citations: [] }, { customerName: 'Alpha Retail Cloud Ltd.' })).toThrow(/citations/i);
  });
});
