import { describe, expect, it } from 'vitest';
import {
  applyFindingCritiqueGuardrails,
  deriveFindingCritiqueGuardrails,
  parseFindingCritiqueOutput,
  type FindingCritiqueContext,
  type FindingCritiqueOutput
} from './findingCritique';

const baseCritique: FindingCritiqueOutput = {
  evidenceQuality: {
    score: 92,
    summary: 'Approved evidence supports the finding.',
    strengths: ['Contract and invoice references are present.'],
    gaps: []
  },
  falsePositiveRisks: [],
  reviewerChecklist: ['Confirm the billing period matches the approved evidence.'],
  recommendation: 'strong_evidence',
  recommendationRationale: 'The approved evidence appears consistent.',
  safety: {
    canApproveFinding: false,
    canChangeFindingAmount: false,
    canChangeFindingStatus: false
  }
};

const baseContext: FindingCritiqueContext = {
  finding: {
    id: 'finding_1',
    type: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    title: 'Minimum commitment shortfall',
    summary: 'Customer was billed below the approved minimum.',
    status: 'draft',
    estimatedAmountMinor: 40_000,
    currency: 'USD',
    confidence: 0.91,
    evidenceCoverageStatus: 'complete',
    calculation: {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    }
  },
  citations: [],
  approvedEvidence: [
    {
      evidenceId: 'evidence_contract',
      evidenceType: 'contract_term',
      sourceType: 'contract',
      label: 'MSA section 4.1',
      snippet: 'Minimum commitment is USD 1,000.',
      approvalState: 'approved'
    },
    {
      evidenceId: 'evidence_invoice',
      evidenceType: 'invoice_row',
      sourceType: 'invoice',
      label: 'invoice.csv row 8',
      snippet: 'Billed USD 600.',
      approvalState: 'approved'
    }
  ]
};

describe('finding AI critique schema and guardrails', () => {
  it('validates safe critique output', () => {
    expect(parseFindingCritiqueOutput(baseCritique)).toEqual(baseCritique);
  });

  it('rejects unsafe AI output that claims it can approve or mutate a finding', () => {
    expect(() =>
      parseFindingCritiqueOutput({
        ...baseCritique,
        safety: {
          canApproveFinding: true,
          canChangeFindingAmount: false,
          canChangeFindingStatus: false
        }
      })
    ).toThrow();

    expect(() =>
      parseFindingCritiqueOutput({
        ...baseCritique,
        safety: {
          canApproveFinding: false,
          canChangeFindingAmount: false,
          canChangeFindingStatus: true
        }
      })
    ).toThrow();
  });

  it('flags missing invoice or usage evidence as a false-positive risk', () => {
    const context = {
      ...baseContext,
      approvedEvidence: baseContext.approvedEvidence.filter((item) => item.sourceType !== 'invoice')
    };

    const guarded = applyFindingCritiqueGuardrails(baseCritique, context);

    expect(guarded.recommendation).toBe('needs_more_evidence');
    expect(guarded.evidenceQuality.score).toBeLessThanOrEqual(60);
    expect(guarded.falsePositiveRisks.map((risk) => risk.risk).join(' ')).toMatch(/invoice or usage evidence/i);
    expect(guarded.safety).toEqual({
      canApproveFinding: false,
      canChangeFindingAmount: false,
      canChangeFindingStatus: false
    });
  });

  it('flags conflicting evidence with a warning and conflicting recommendation', () => {
    const context = {
      ...baseContext,
      finding: {
        ...baseContext.finding,
        evidenceCoverageStatus: 'conflicting'
      }
    };

    const guardrails = deriveFindingCritiqueGuardrails(context);
    const guarded = applyFindingCritiqueGuardrails(baseCritique, context);

    expect(guardrails.risks[0]?.risk).toMatch(/conflicting/i);
    expect(guardrails.risks[0]?.severity).toBe('high');
    expect(guarded.recommendation).toBe('conflicting_evidence');
    expect(guarded.evidenceQuality.score).toBeLessThanOrEqual(50);
  });
});
