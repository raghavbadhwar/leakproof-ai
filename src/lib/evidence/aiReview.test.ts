import { describe, expect, it } from 'vitest';
import {
  evaluateEvidenceQuality,
  evaluateFalsePositiveRisk,
  type EvidenceAiReviewContext
} from './aiReview';

const baseContext: EvidenceAiReviewContext = {
  finding: {
    id: 'finding_1',
    type: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    title: 'Minimum commitment shortfall',
    summary: 'Customer was billed below the reviewed minimum.',
    status: 'draft',
    amountMinor: 40_000,
    currency: 'USD',
    confidence: 0.91,
    evidenceCoverageStatus: 'complete',
    calculation: {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    }
  },
  evidence: [
    {
      id: 'evidence_contract',
      evidenceType: 'contract_term',
      sourceType: 'contract',
      approvalState: 'approved',
      reviewedBy: 'reviewer_1',
      reviewedAt: '2026-04-27T10:00:00.000Z',
      label: 'MSA section 4.1',
      snippet: 'Minimum commitment applies.'
    },
    {
      id: 'evidence_invoice',
      evidenceType: 'invoice_row',
      sourceType: 'invoice',
      approvalState: 'approved',
      reviewedBy: 'reviewer_1',
      reviewedAt: '2026-04-27T10:00:00.000Z',
      label: 'invoice.csv row 8',
      snippet: 'Billed amount is below minimum.'
    }
  ],
  candidates: [],
  relatedTerms: []
};

describe('evidence AI review guardrails', () => {
  it('flags money findings without invoice or usage evidence as needs_more_evidence', () => {
    const quality = evaluateEvidenceQuality({
      ...baseContext,
      evidence: baseContext.evidence.filter((item) => item.sourceType !== 'invoice')
    });

    expect(quality.quality).toBe('needs_more_evidence');
    expect(quality.invoiceOrUsageEvidencePresent).toBe(false);
    expect(quality.recommendation).toBe('needs_more_evidence');
    expect(quality.missingEvidence.join(' ')).toMatch(/invoice or usage evidence/i);
  });

  it('allows a contract-only risk finding to remain medium or strong', () => {
    const quality = evaluateEvidenceQuality({
      ...baseContext,
      finding: {
        ...baseContext.finding,
        type: 'renewal_window_risk',
        outcomeType: 'risk_alert',
        amountMinor: 0,
        calculation: { formula: 'notice_date - current_date' }
      },
      evidence: baseContext.evidence.filter((item) => item.sourceType === 'contract')
    });

    expect(['medium_evidence', 'strong_evidence']).toContain(quality.quality);
    expect(quality.contractEvidencePresent).toBe(true);
    expect(quality.requiredEvidencePresent).toBe(true);
  });

  it('raises high false-positive risk for amendment conflicts', () => {
    const risk = evaluateFalsePositiveRisk({
      ...baseContext,
      relatedTerms: [
        {
          id: 'term_amendment',
          termType: 'amendment',
          reviewStatus: 'approved',
          confidence: 0.9,
          label: 'Amendment 2',
          snippet: 'Amendment overrides previous minimum commitment.'
        }
      ]
    });

    expect(['high', 'critical']).toContain(risk.riskLevel);
    expect(risk.blockingIssues.join(' ')).toMatch(/amendment/i);
    expect(risk.recommendation).toBe('do_not_approve_yet');
  });

  it('warns when a credit note signal could explain the variance', () => {
    const risk = evaluateFalsePositiveRisk({
      ...baseContext,
      candidates: [
        {
          id: 'candidate_credit',
          approvalState: 'suggested',
          label: 'Credit memo row',
          snippet: 'Credit note was issued after the invoice.'
        }
      ]
    });

    expect(risk.riskLevel).toBe('medium');
    expect(risk.riskReasons.join(' ')).toMatch(/credit note/i);
    expect(risk.blockingIssues).toEqual([]);
  });
});
