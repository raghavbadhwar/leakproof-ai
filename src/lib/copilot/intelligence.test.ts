import { describe, expect, it } from 'vitest';
import type { CopilotDataContext } from './context';
import {
  evidenceQualityReview,
  falsePositiveRiskCheck,
  prepareCfoSummary,
  prepareRecoveryNote,
  reviewerChecklist
} from './intelligence';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('Copilot finding intelligence', () => {
  it('requires contract evidence for money findings', () => {
    const review = evidenceQualityReview(contextWithFindings([finding()]), scopedFindingInput());

    expect(review.needs_more_evidence).toContain('Approved contract evidence is required for money findings.');
    expect(review.overall).toBe('needs_more_evidence');
    expect(review.advisory_only).toBe(true);
  });

  it('flags missing invoice or usage evidence', () => {
    const review = evidenceQualityReview(contextWithFindings([finding()], {
      evidenceItems: [evidenceItem({ evidenceType: 'contract_term', sourceType: 'contract' })]
    }), scopedFindingInput());

    expect(review.needs_more_evidence).toContain('Approved invoice or usage evidence is required to support the calculated amount.');
  });

  it('warns when finding context suggests conflicting evidence', () => {
    const review = evidenceQualityReview(contextWithFindings([
      finding({ reviewNote: 'Possible amendment conflict needs checking.' })
    ], {
      evidenceItems: [
        evidenceItem({ evidenceType: 'contract_term', sourceType: 'contract' }),
        evidenceItem({ evidenceType: 'invoice_row', sourceType: 'invoice' })
      ]
    }), scopedFindingInput());

    expect(review.conflicting_evidence).toContain('Finding context references a possible amendment or conflicting term.');
    expect(review.overall).toBe('conflicting_evidence');
  });

  it('flags amendment conflict in false-positive risk checks', () => {
    const risk = falsePositiveRiskCheck(contextWithFindings([
      finding({ summary: 'An addendum may supersede the minimum commitment.' })
    ], {
      evidenceItems: [
        evidenceItem({ evidenceType: 'contract_term', sourceType: 'contract' }),
        evidenceItem({ evidenceType: 'invoice_row', sourceType: 'invoice' })
      ]
    }), scopedFindingInput());

    expect(risk.riskLevel).toBe('high');
    expect(risk.reasons.join(' ')).toContain('amendment');
    expect(risk.advisory_only).toBe(true);
  });

  it('prepares reviewer checklist blockers without approving anything', () => {
    const checklist = reviewerChecklist(contextWithFindings([finding({ status: 'needs_review' })]), scopedFindingInput());

    expect(checklist.verify_before_approving).toContain('Verify the formula uses the stored deterministic calculation amount.');
    expect(checklist.blocks_customer_ready.join(' ')).toContain('human approval is required first');
  });

  it('separates CFO customer-facing leakage from internal exposure', () => {
    const summary = prepareCfoSummary(contextWithFindings([
      finding({ id: findingId, status: 'approved', amountMinor: 100_000, outcomeType: 'recoverable_leakage' }),
      finding({ id: '33333333-3333-4333-8333-333333333334', status: 'customer_ready', amountMinor: 50_000, outcomeType: 'prevented_future_leakage' }),
      finding({ id: '33333333-3333-4333-8333-333333333335', status: 'needs_review', amountMinor: 900_000 }),
      finding({ id: '33333333-3333-4333-8333-333333333336', status: 'draft', amountMinor: 800_000 })
    ]), scopedInput());

    expect(summary.customer_facing.total_leakage_minor).toBe(150_000);
    expect(summary.internal_pipeline.unapproved_exposure_minor).toBe(1_700_000);
    expect(summary.advisory_only).toBe(true);
  });

  it('drafts recovery notes without auto-send or legal threats', () => {
    const draft = prepareRecoveryNote(contextWithFindings([finding({ status: 'approved' })], {
      evidenceItems: [
        evidenceItem({ evidenceType: 'contract_term', sourceType: 'contract' }),
        evidenceItem({ evidenceType: 'invoice_row', sourceType: 'invoice' })
      ]
    }), scopedFindingInput());
    const serialized = JSON.stringify(draft).toLowerCase();

    expect(draft.auto_send).toBe(false);
    expect(draft.human_review_disclaimer).toContain('human reviewer');
    expect(serialized).not.toMatch(/\b(sue|lawsuit|threat|legal action)\b/);
  });

  it('does not mutate finding amount or status', () => {
    const context = contextWithFindings([finding({ status: 'needs_review', amountMinor: 40_000 })]);
    const before = JSON.stringify(context.findings[0]);

    evidenceQualityReview(context, scopedFindingInput());
    falsePositiveRiskCheck(context, scopedFindingInput());
    prepareRecoveryNote(context, scopedFindingInput());

    expect(JSON.stringify(context.findings[0])).toBe(before);
  });
});

function scopedInput() {
  return {
    organization_id: organizationId,
    workspace_id: workspaceId
  };
}

function scopedFindingInput() {
  return {
    ...scopedInput(),
    finding_id: findingId
  };
}

function contextWithFindings(
  findings: CopilotDataContext['findings'],
  overrides: Partial<Omit<CopilotDataContext, 'organization' | 'workspace' | 'findings'>> = {}
): CopilotDataContext {
  return {
    organization: {
      id: organizationId,
      name: 'Acme Audit Co.'
    },
    workspace: {
      id: workspaceId,
      organizationId,
      name: 'Q1 Revenue Audit',
      status: 'ready'
    },
    documents: overrides.documents ?? [],
    terms: overrides.terms ?? [],
    findings,
    evidenceItems: overrides.evidenceItems ?? [],
    evidenceCandidates: overrides.evidenceCandidates ?? [],
    evidencePacks: overrides.evidencePacks ?? [],
    invoiceRecords: overrides.invoiceRecords ?? [],
    usageRecords: overrides.usageRecords ?? []
  };
}

function finding(overrides: Partial<CopilotDataContext['findings'][number]> = {}): CopilotDataContext['findings'][number] {
  return {
    id: overrides.id ?? findingId,
    organizationId,
    workspaceId: overrides.workspaceId ?? workspaceId,
    customerId: overrides.customerId ?? customerId,
    findingType: overrides.findingType ?? 'minimum_commitment_shortfall',
    outcomeType: overrides.outcomeType ?? 'recoverable_leakage',
    severity: overrides.severity ?? 'high',
    title: overrides.title ?? 'Minimum commitment shortfall',
    summary: overrides.summary ?? 'Customer was billed below the approved minimum commitment.',
    amountMinor: overrides.amountMinor ?? 40_000,
    currency: overrides.currency ?? 'USD',
    confidence: overrides.confidence ?? 0.92,
    status: overrides.status ?? 'approved',
    evidenceCoverageStatus: overrides.evidenceCoverageStatus ?? 'complete',
    calculation: overrides.calculation ?? {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    },
    reviewerUserId: overrides.reviewerUserId ?? '77777777-7777-4777-8777-777777777777',
    reviewedAt: overrides.reviewedAt ?? '2026-04-27T00:00:00.000Z',
    reviewNote: overrides.reviewNote ?? null,
    createdAt: overrides.createdAt ?? '2026-04-26T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-27T00:00:00.000Z',
    customerSegment: overrides.customerSegment ?? 'Enterprise',
    billingModel: overrides.billingModel ?? 'Annual',
    contractType: overrides.contractType ?? 'Usage + minimum',
    customerRenewalDate: overrides.customerRenewalDate ?? null
  };
}

function evidenceItem(overrides: Partial<CopilotDataContext['evidenceItems'][number]> = {}): CopilotDataContext['evidenceItems'][number] {
  return {
    id: overrides.id ?? '44444444-4444-4444-8444-444444444444',
    organizationId,
    workspaceId,
    findingId,
    evidenceType: overrides.evidenceType ?? 'contract_term',
    sourceId: overrides.sourceId ?? '55555555-5555-4555-8555-555555555555',
    documentChunkId: overrides.documentChunkId ?? '66666666-6666-4666-8666-666666666666',
    sourceType: overrides.sourceType ?? 'contract',
    approvalState: overrides.approvalState ?? 'approved',
    reviewedBy: overrides.reviewedBy ?? '77777777-7777-4777-8777-777777777777',
    reviewedAt: overrides.reviewedAt ?? '2026-04-27T00:00:00.000Z'
  };
}
