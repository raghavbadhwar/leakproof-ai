import { describe, expect, it } from 'vitest';
import {
  buildRecoveryNoteDraft,
  containsForbiddenRecoveryLanguage,
  recoveryNoteOutputSchema,
  type RecoveryNoteContext
} from './recoveryNoteSchema';

const recoveryContext: RecoveryNoteContext = {
  finding: {
    id: 'finding_1',
    workspaceId: 'workspace_1',
    type: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    title: 'Minimum commitment shortfall',
    summary: 'Customer was billed below the approved minimum.',
    status: 'approved',
    estimatedAmountMinor: 40_000,
    currency: 'USD',
    confidence: 0.92,
    calculation: {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    },
    recommendedAction: 'Review the next invoice adjustment.'
  },
  approvedEvidence: [
    {
      id: 'evidence_contract',
      evidenceType: 'contract_term',
      sourceType: 'contract',
      label: 'MSA section 4.1',
      excerpt: 'Minimum commitment is USD 1,000.'
    },
    {
      id: 'evidence_invoice',
      evidenceType: 'invoice_row',
      sourceType: 'invoice',
      label: 'invoices.csv row 8',
      excerpt: 'Billed USD 600.'
    }
  ],
  includeCustomerFacingDraft: true
};

describe('recovery note schema', () => {
  it('includes the deterministic calculation summary in customer drafts', () => {
    const draft = buildRecoveryNoteDraft(recoveryContext);

    expect(draft.customerFacingDraft).toContain('USD 400.00');
    expect(draft.calculationSummary).toContain('minimum_commitment_minor - billed_minor');
    expect(draft.calculationSummary).toContain('AI did not calculate or change this amount');
    expect(draft.humanReviewRequired).toBe(true);
  });

  it('removes legal threats from model output', () => {
    const draft = buildRecoveryNoteDraft(recoveryContext, {
      internalNote: 'Internal note for review.',
      customerFacingDraft: 'You are in breach and we will sue unless immediate payment is made.',
      evidenceSummary: 'Contract and invoice references are attached.',
      calculationSummary: 'Incorrect model calculation summary.',
      recommendedTone: 'firm_but_polite',
      humanReviewRequired: true,
      warnings: [],
      referencedEntities: []
    });

    expect(containsForbiddenRecoveryLanguage(draft.customerFacingDraft)).toBe(false);
    expect(draft.customerFacingDraft).toContain('During our billing reconciliation');
    expect(draft.warnings.join(' ')).toMatch(/aggressive|legal/i);
  });

  it('returns an internal-only note when customer-facing drafting is disabled', () => {
    const draft = buildRecoveryNoteDraft({
      ...recoveryContext,
      includeCustomerFacingDraft: false
    });

    expect(draft.internalNote).toContain('Internal recovery review');
    expect(draft.customerFacingDraft).toBeNull();
    expect(draft.warnings.join(' ')).toContain('Customer-facing draft is disabled');
  });

  it('uses a safe fallback for invalid model output', () => {
    const draft = buildRecoveryNoteDraft(recoveryContext, { unexpected: 'shape' });

    expect(draft.internalNote).toContain('Internal recovery review');
    expect(draft.warnings.join(' ')).toContain('invalid recovery-note JSON');
    expect(() => recoveryNoteOutputSchema.parse(draft)).not.toThrow();
  });
});
