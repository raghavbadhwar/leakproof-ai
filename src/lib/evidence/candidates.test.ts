import { describe, expect, it } from 'vitest';
import { citationForEvidenceCandidate, evidenceTypeForSourceDocument, excerptForEvidence, isEvidenceCandidateExportReady } from './candidates';

describe('evidence candidates', () => {
  it('maps source document types to approved evidence item types', () => {
    expect(evidenceTypeForSourceDocument('contract')).toBe('contract_term');
    expect(evidenceTypeForSourceDocument('invoice_csv')).toBe('invoice_row');
    expect(evidenceTypeForSourceDocument('usage_csv')).toBe('usage_row');
    expect(evidenceTypeForSourceDocument('customer_csv')).toBe('human_note');
  });

  it('builds citation-safe candidate excerpts', () => {
    const citation = citationForEvidenceCandidate({
      documentType: 'invoice_csv',
      chunkId: '11111111-1111-4111-8111-111111111111',
      sourceLabel: 'invoice.csv row 4',
      content: '  Invoice   line item   with   extra spacing.  '
    });

    expect(citation.sourceType).toBe('invoice');
    expect(citation.label).toBe('invoice.csv row 4');
    expect(citation.excerpt).toBe('Invoice line item with extra spacing.');
  });

  it('truncates long excerpts for review UI and audit metadata', () => {
    expect(excerptForEvidence('x'.repeat(700))).toHaveLength(500);
  });

  it('requires evidence candidates to be approved and attached before export', () => {
    expect(
      isEvidenceCandidateExportReady({
        approval_state: 'approved',
        attached_evidence_item_id: '11111111-1111-4111-8111-111111111111'
      })
    ).toBe(true);
    expect(isEvidenceCandidateExportReady({ approval_state: 'suggested', attached_evidence_item_id: '11111111-1111-4111-8111-111111111111' })).toBe(
      false
    );
    expect(isEvidenceCandidateExportReady({ approval_state: 'approved', attached_evidence_item_id: null })).toBe(false);
  });
});
