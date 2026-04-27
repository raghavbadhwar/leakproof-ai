import { describe, expect, it } from 'vitest';
import { parseEvidenceQualityReview } from './evidenceQualitySchema';

describe('evidence quality schema', () => {
  it('accepts strict advisory evidence quality output', () => {
    expect(
      parseEvidenceQualityReview({
        quality: 'strong_evidence',
        score: 91,
        requiredEvidencePresent: true,
        contractEvidencePresent: true,
        invoiceOrUsageEvidencePresent: true,
        formulaSupported: true,
        missingEvidence: [],
        conflictingSignals: [],
        reviewerChecklist: ['Confirm deterministic formula inputs before approval.'],
        recommendation: 'ready_for_review'
      })
    ).toMatchObject({ quality: 'strong_evidence', recommendation: 'ready_for_review' });
  });

  it('rejects unsupported quality and recommendation values', () => {
    expect(() =>
      parseEvidenceQualityReview({
        quality: 'approved_by_ai',
        score: 100,
        requiredEvidencePresent: true,
        contractEvidencePresent: true,
        invoiceOrUsageEvidencePresent: true,
        formulaSupported: true,
        missingEvidence: [],
        conflictingSignals: [],
        reviewerChecklist: ['Confirm evidence.'],
        recommendation: 'auto_approve'
      })
    ).toThrow();
  });
});
