import { describe, expect, it } from 'vitest';
import { resolveContractHierarchyDeterministic } from '../ai/contractHierarchy';
import { hierarchyBlocksRecoverableLeakage, planContractHierarchyReview } from './contractHierarchyAgent';

const generatedAt = '2026-04-27T00:00:00.000Z';

describe('contract hierarchy review agent guardrails', () => {
  it('marks only non-approved conflicting terms as needs review', () => {
    const resolution = resolveContractHierarchyDeterministic({
      customerId: 'customer_alpha',
      generatedAt,
      documents: [
        { id: 'doc_a', documentType: 'contract', safeLabel: 'Contract A' },
        { id: 'doc_b', documentType: 'contract', safeLabel: 'Contract B' }
      ],
      terms: [
        {
          id: 'term_base_approved',
          sourceDocumentId: 'doc_a',
          termType: 'base_fee',
          value: { amountMinor: 100_000, currency: 'USD' },
          citation: { label: 'Section 1' },
          confidence: 0.9,
          reviewStatus: 'approved'
        },
        {
          id: 'term_base_extracted',
          sourceDocumentId: 'doc_b',
          termType: 'base_fee',
          value: { amountMinor: 120_000, currency: 'USD' },
          citation: { label: 'Section 2' },
          confidence: 0.91,
          reviewStatus: 'extracted'
        }
      ]
    });

    const plan = planContractHierarchyReview({
      resolution,
      terms: [
        { id: 'term_base_approved', reviewStatus: 'approved' },
        { id: 'term_base_extracted', reviewStatus: 'extracted' }
      ]
    });

    expect(plan.termsToMarkNeedsReview).toEqual(['term_base_extracted']);
    expect(plan.approvedTermsLeftUnchanged).toEqual(['term_base_approved']);
    expect(plan.canOverrideApprovedTerms).toBe(false);
  });

  it('does not allow unresolved hierarchy to create recoverable leakage automatically', () => {
    const resolution = resolveContractHierarchyDeterministic({
      customerId: 'customer_alpha',
      generatedAt,
      documents: [
        { id: 'doc_a', documentType: 'contract', safeLabel: 'Contract A' },
        { id: 'doc_b', documentType: 'contract', safeLabel: 'Contract B' }
      ],
      terms: [
        {
          id: 'term_minimum_a',
          sourceDocumentId: 'doc_a',
          termType: 'minimum_commitment',
          value: { amountMinor: 100_000, currency: 'USD' },
          citation: { label: 'Section 1' },
          confidence: 0.9,
          reviewStatus: 'approved'
        },
        {
          id: 'term_minimum_b',
          sourceDocumentId: 'doc_b',
          termType: 'minimum_commitment',
          value: { amountMinor: 80_000, currency: 'USD' },
          citation: { label: 'Section 2' },
          confidence: 0.9,
          reviewStatus: 'approved'
        }
      ]
    });
    const plan = planContractHierarchyReview({
      resolution,
      terms: [
        { id: 'term_minimum_a', reviewStatus: 'approved' },
        { id: 'term_minimum_b', reviewStatus: 'approved' }
      ]
    });

    expect(hierarchyBlocksRecoverableLeakage(plan)).toBe(true);
    expect(plan.canCreateRecoverableLeakage).toBe(false);
    expect(plan.approvedTermsLeftUnchanged).toEqual(['term_minimum_a', 'term_minimum_b']);
  });
});
