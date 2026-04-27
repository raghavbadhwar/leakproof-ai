import { describe, expect, it } from 'vitest';
import { parseFalsePositiveReview } from './falsePositiveSchema';

describe('false positive schema', () => {
  it('accepts strict advisory false-positive review output', () => {
    expect(
      parseFalsePositiveReview({
        riskLevel: 'medium',
        riskReasons: ['Possible credit note should be checked.'],
        suggestedChecks: ['Check credit memos and refunds before customer use.'],
        blockingIssues: [],
        recommendation: 'ready_for_review'
      })
    ).toMatchObject({ riskLevel: 'medium' });
  });

  it('rejects unsupported risk levels and automatic approval language', () => {
    expect(() =>
      parseFalsePositiveReview({
        riskLevel: 'none',
        riskReasons: [],
        suggestedChecks: ['No review required.'],
        blockingIssues: [],
        recommendation: 'auto_approve'
      })
    ).toThrow();
  });
});
