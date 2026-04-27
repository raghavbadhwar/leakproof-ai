import { describe, expect, it } from 'vitest';
import { buildAuditReadiness, type AuditReadinessInput } from './auditReadiness';

const generatedAt = '2026-04-27T10:00:00.000Z';
const customerId = 'customer_alpha';

describe('audit readiness engine', () => {
  it('returns needs_data when no uploads exist', () => {
    const readiness = buildAuditReadiness({ generatedAt });

    expect(readiness.readinessScore).toBe(0);
    expect(readiness.readinessLabel).toBe('needs_data');
    expect(readiness.nextBestAction.action).toBe('upload_contracts');
    expect(readiness.blockers.map((item) => item.category)).toEqual(
      expect.arrayContaining(['missing_contracts', 'missing_invoices', 'missing_usage'])
    );
  });

  it('flags missing invoices and usage when only contracts exist', () => {
    const readiness = buildAuditReadiness({
      generatedAt,
      documents: [document('contract_1', 'contract')]
    });

    expect(readiness.readinessLabel).toBe('needs_data');
    expect(readiness.nextBestAction.action).toBe('upload_invoices');
    expect(readiness.blockers.map((item) => item.category)).toEqual(
      expect.arrayContaining(['missing_invoices', 'missing_usage'])
    );
  });

  it('sends extracted but unapproved terms to term review', () => {
    const readiness = buildAuditReadiness({
      ...readyData(),
      generatedAt,
      terms: [term('term_1', 'extracted', 0.92)]
    });

    expect(readiness.readinessLabel).toBe('needs_review');
    expect(readiness.nextBestAction.action).toBe('review_terms');
    expect(readiness.blockers.map((item) => item.category)).toContain('unapproved_terms');
  });

  it('asks reviewers to attach evidence when findings have no evidence', () => {
    const readiness = buildAuditReadiness({
      ...readyForReconciliation(),
      generatedAt,
      findings: [finding('finding_1', 'approved')]
    });

    expect(readiness.readinessLabel).toBe('needs_review');
    expect(readiness.nextBestAction.action).toBe('attach_evidence');
    expect(readiness.blockers.map((item) => item.category)).toContain('missing_evidence');
  });

  it('marks approved findings with approved evidence as report ready', () => {
    const readiness = buildAuditReadiness({
      ...reportReadyInput(),
      generatedAt
    });

    expect(readiness.readinessLabel).toBe('report_ready');
    expect(readiness.readinessScore).toBe(100);
    expect(readiness.nextBestAction.action).toBe('generate_report');
    expect(readiness.blockers).toEqual([]);
  });

  it('keeps the next best action deterministic', () => {
    const input = {
      ...readyForReconciliation(),
      generatedAt,
      findings: [finding('finding_1', 'approved')]
    };

    expect(buildAuditReadiness(input).nextBestAction).toEqual(buildAuditReadiness(input).nextBestAction);
  });

  it('preserves customer-facing leakage rules by not treating draft findings as report ready', () => {
    const readiness = buildAuditReadiness({
      ...reportReadyInput(),
      generatedAt,
      findings: [
        finding('finding_1', 'approved'),
        finding('finding_2', 'draft')
      ],
      evidenceItems: [
        approvedEvidence('evidence_1', 'finding_1', 'contract_term'),
        approvedEvidence('evidence_2', 'finding_1', 'invoice_row'),
        approvedEvidence('evidence_3', 'finding_2', 'contract_term'),
        approvedEvidence('evidence_4', 'finding_2', 'invoice_row')
      ]
    });

    expect(readiness.readinessLabel).toBe('needs_review');
    expect(readiness.nextBestAction.action).toBe('approve_findings');
    expect(readiness.blockers.map((item) => item.category)).toContain('report_blockers');
  });
});

function readyData(): AuditReadinessInput {
  return {
    documents: [
      document('contract_1', 'contract'),
      document('invoice_doc_1', 'invoice_csv'),
      document('usage_doc_1', 'usage_csv')
    ],
    invoiceRecords: [
      {
        id: 'invoice_1',
        customerId,
        sourceDocumentId: 'invoice_doc_1',
        servicePeriodStart: '2026-01-01',
        servicePeriodEnd: '2026-01-31'
      }
    ],
    usageRecords: [
      {
        id: 'usage_1',
        customerId,
        sourceDocumentId: 'usage_doc_1',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31'
      }
    ]
  };
}

function readyForReconciliation(): AuditReadinessInput {
  return {
    ...readyData(),
    terms: [term('term_1', 'approved', 0.94)]
  };
}

function reportReadyInput(): AuditReadinessInput {
  return {
    ...readyForReconciliation(),
    findings: [finding('finding_1', 'approved')],
    evidenceItems: [
      approvedEvidence('evidence_1', 'finding_1', 'contract_term'),
      approvedEvidence('evidence_2', 'finding_1', 'invoice_row')
    ]
  };
}

function document(id: string, documentType: string) {
  return {
    id,
    documentType,
    customerId: documentType === 'contract' ? customerId : null,
    parseStatus: 'parsed',
    chunkingStatus: 'chunked',
    embeddingStatus: 'embedded'
  };
}

function term(id: string, reviewStatus: string, confidence: number) {
  return {
    id,
    customerId,
    sourceDocumentId: 'contract_1',
    reviewStatus,
    confidence
  };
}

function finding(id: string, status: string) {
  return {
    id,
    customerId,
    status,
    outcomeType: 'recoverable_leakage',
    evidenceCoverageStatus: 'complete',
    calculation: {
      formula: 'approved_minimum_commitment_minor - invoiced_amount_minor',
      approved_minimum_commitment_minor: 100_000,
      invoiced_amount_minor: 75_000
    }
  };
}

function approvedEvidence(id: string, findingId: string, evidenceType: string) {
  return {
    id,
    findingId,
    evidenceType,
    approvalState: 'approved',
    reviewedBy: 'reviewer_user',
    reviewedAt: '2026-04-27T09:00:00.000Z'
  };
}
