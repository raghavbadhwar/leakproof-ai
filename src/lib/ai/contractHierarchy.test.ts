import { describe, expect, it } from 'vitest';
import {
  buildContractHierarchyAuditSummary,
  buildContractHierarchyPrompt,
  contractHierarchySafetySchema,
  resolveContractHierarchy,
  resolveContractHierarchyDeterministic,
  type ContractHierarchyInput
} from './contractHierarchy';

const baseCitation = {
  label: 'Section 4',
  excerpt: 'The pricing term is stated in this short cited excerpt.'
};

function input(overrides: Partial<ContractHierarchyInput> = {}): ContractHierarchyInput {
  return {
    customerId: 'customer_alpha',
    generatedAt: '2026-04-27T00:00:00.000Z',
    documents: [],
    terms: [],
    ...overrides
  };
}

describe('contract hierarchy resolver', () => {
  it('recommends a later amendment over an earlier discount without approving either term', async () => {
    const resolution = await resolveContractHierarchy(
      input({
        documents: [
          { id: 'doc_order', documentType: 'contract', safeLabel: 'Order form', roleHint: 'order_form' },
          { id: 'doc_amendment', documentType: 'contract', safeLabel: 'Discount extension amendment', roleHint: 'amendment' }
        ],
        terms: [
          {
            id: 'term_discount_original',
            sourceDocumentId: 'doc_order',
            termType: 'discount',
            value: { percent: 20, effectiveDate: '2026-01-01' },
            citation: baseCitation,
            confidence: 0.92,
            reviewStatus: 'approved'
          },
          {
            id: 'term_discount_amendment',
            sourceDocumentId: 'doc_amendment',
            termType: 'discount',
            value: { percent: 10, effectiveDate: '2026-04-01' },
            citation: { ...baseCitation, label: 'Amendment section 2' },
            confidence: 0.9,
            reviewStatus: 'approved'
          }
        ]
      })
    );

    expect(resolution.controllingTerms).toContainEqual(
      expect.objectContaining({
        termType: 'discount',
        controllingTermId: 'term_discount_amendment',
        needsReview: true
      })
    );
    expect(resolution.supersededTerms).toContainEqual(
      expect.objectContaining({
        termId: 'term_discount_original',
        supersededByTermId: 'term_discount_amendment'
      })
    );
    expect(resolution.safety).toEqual(contractHierarchySafetySchema.parse({
      canApproveTerms: false,
      canChangeApprovedTerms: false,
      canCreateLeakageFinding: false,
      canCalculateLeakage: false,
      canExportReport: false
    }));
  });

  it('uses renewal order precedence for the controlling contract end date', () => {
    const resolution = resolveContractHierarchyDeterministic(
      input({
        documents: [
          { id: 'doc_msa', documentType: 'contract', safeLabel: 'MSA', roleHint: 'master_agreement' },
          { id: 'doc_renewal', documentType: 'contract', safeLabel: 'Renewal order', roleHint: 'renewal_order' }
        ],
        terms: [
          {
            id: 'term_end_msa',
            sourceDocumentId: 'doc_msa',
            termType: 'contract_end_date',
            value: { date: '2026-12-31' },
            citation: baseCitation,
            confidence: 0.93,
            reviewStatus: 'approved'
          },
          {
            id: 'term_end_renewal',
            sourceDocumentId: 'doc_renewal',
            termType: 'contract_end_date',
            value: { date: '2027-12-31' },
            citation: { ...baseCitation, label: 'Renewal order section 1' },
            confidence: 0.91,
            reviewStatus: 'approved'
          }
        ]
      })
    );

    expect(resolution.controllingTerms).toContainEqual(
      expect.objectContaining({
        termType: 'contract_end_date',
        controllingTermId: 'term_end_renewal',
        documentRole: 'renewal_order'
      })
    );
  });

  it('marks conflicting base fee terms for review when precedence is ambiguous', () => {
    const resolution = resolveContractHierarchyDeterministic(
      input({
        documents: [
          { id: 'doc_a', documentType: 'contract', safeLabel: 'Contract document A' },
          { id: 'doc_b', documentType: 'contract', safeLabel: 'Contract document B' }
        ],
        terms: [
          {
            id: 'term_base_a',
            sourceDocumentId: 'doc_a',
            termType: 'base_fee',
            value: { amountMinor: 100_000, currency: 'USD' },
            citation: baseCitation,
            confidence: 0.9,
            reviewStatus: 'extracted'
          },
          {
            id: 'term_base_b',
            sourceDocumentId: 'doc_b',
            termType: 'base_fee',
            value: { amountMinor: 120_000, currency: 'USD' },
            citation: baseCitation,
            confidence: 0.91,
            reviewStatus: 'extracted'
          }
        ]
      })
    );

    expect(resolution.conflicts).toContainEqual(
      expect.objectContaining({
        termType: 'base_fee',
        risk: 'unresolved_conflict',
        needsReview: true
      })
    );
    expect(resolution.unresolvedItems).toContainEqual(
      expect.objectContaining({
        kind: 'ambiguous_precedence',
        termType: 'base_fee'
      })
    );
  });

  it('validates Gemini output and keeps deterministic guardrails when AI disagrees', async () => {
    const resolution = await resolveContractHierarchy(
      input({
        documents: [
          { id: 'doc_msa', documentType: 'contract', safeLabel: 'MSA', roleHint: 'master_agreement' },
          { id: 'doc_amendment', documentType: 'contract', safeLabel: 'Amendment', roleHint: 'amendment' }
        ],
        terms: [
          {
            id: 'term_original',
            sourceDocumentId: 'doc_msa',
            termType: 'minimum_commitment',
            value: { amountMinor: 100_000, currency: 'USD', effectiveDate: '2026-01-01' },
            citation: baseCitation,
            confidence: 0.94,
            reviewStatus: 'approved'
          },
          {
            id: 'term_later',
            sourceDocumentId: 'doc_amendment',
            termType: 'minimum_commitment',
            value: { amountMinor: 80_000, currency: 'USD', effectiveDate: '2026-03-01' },
            citation: baseCitation,
            confidence: 0.93,
            reviewStatus: 'approved'
          }
        ]
      }),
      async () => ({
        taskType: 'contract_hierarchy_resolution',
        status: 'completed',
        customerId: 'customer_alpha',
        documentRoles: [],
        relationships: [],
        controllingTerms: [
          {
            termType: 'minimum_commitment',
            controllingTermId: 'term_original',
            sourceDocumentId: 'doc_msa',
            documentRole: 'master_agreement',
            supersededTermIds: ['term_later'],
            reason: 'AI picked the older MSA.',
            confidence: 0.99,
            needsReview: false
          }
        ],
        supersededTerms: [],
        conflicts: [],
        unresolvedItems: [],
        reviewerChecklist: ['Confirm hierarchy.'],
        warnings: [],
        safety: {
          canApproveTerms: false,
          canChangeApprovedTerms: false,
          canCreateLeakageFinding: false,
          canCalculateLeakage: false,
          canExportReport: false
        },
        generatedAt: '2026-04-27T00:00:00.000Z'
      })
    );

    expect(resolution.controllingTerms.find((term) => term.termType === 'minimum_commitment')?.controllingTermId).toBe('term_later');
    expect(resolution.warnings.join(' ')).toMatch(/different minimum_commitment controller/);
  });

  it('keeps raw contract text out of hierarchy audit metadata', () => {
    const resolution = resolveContractHierarchyDeterministic(input());
    const metadata = buildContractHierarchyAuditSummary({
      customerId: 'customer_alpha',
      documentCount: 2,
      termCount: 3,
      resolution: {
        ...resolution,
        status: 'needs_review'
      }
    });

    expect(JSON.stringify(metadata)).not.toContain('raw contract');
    expect(JSON.stringify(metadata)).not.toContain('This Agreement contains');
    expect(metadata).toMatchObject({
      task_type: 'contract_hierarchy_resolution',
      conflict_count: 0,
      unresolved_count: 0
    });
  });

  it('does not send file names to the Gemini prompt', () => {
    const prompt = buildContractHierarchyPrompt(
      input({
        documents: [
          {
            id: 'doc_secret_name',
            documentType: 'contract',
            safeLabel: 'Contract document 1',
            fileNameHint: 'Acme-private-amendment.pdf'
          }
        ]
      })
    );

    expect(prompt).toContain('Contract document 1');
    expect(prompt).not.toContain('Acme-private-amendment.pdf');
  });
});
