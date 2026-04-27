import { describe, expect, it } from 'vitest';
import { buildGuidedAuditSummary, buildReviewQueue, type GuidedAuditFinding } from './guidedAudit';

const now = new Date('2026-04-27T00:00:00.000Z');

const approvedFinding = finding({
  id: 'approved',
  title: 'Approved leakage',
  status: 'approved',
  estimated_amount_minor: 125_000,
  confidence: 0.92,
  updated_at: '2026-04-24T00:00:00.000Z'
});

const draftFinding = finding({
  id: 'draft',
  title: 'Draft exposure',
  status: 'draft',
  estimated_amount_minor: 900_000,
  confidence: 0.62,
  evidence_coverage_status: 'weak',
  updated_at: '2026-04-20T00:00:00.000Z'
});

describe('guided audit summary and review queue', () => {
  it('keeps approved customer-facing leakage separate from internal unapproved exposure', () => {
    const summary = buildGuidedAuditSummary({
      findings: [
        approvedFinding,
        draftFinding,
        finding({
          id: 'needs_review',
          title: 'Needs review exposure',
          status: 'needs_review',
          estimated_amount_minor: 50_000
        }),
        finding({
          id: 'dismissed',
          title: 'Dismissed item',
          status: 'dismissed',
          estimated_amount_minor: 700_000
        })
      ],
      readinessIssues: [
        {
          category: 'report_blockers',
          severity: 'blocker',
          title: 'Report export is blocked',
          affectedEntityIds: ['approved'],
          recommendedAction: 'Approve evidence first.',
          deepLink: '/app/reports'
        }
      ]
    });

    expect(summary.customerFacingApprovedMinor).toBe(125_000);
    expect(summary.internalUnapprovedExposureMinor).toBe(950_000);
    expect(summary.readyToReportCount).toBe(0);
    expect(summary.topCustomerFacingFindings.map((item) => item.id)).toEqual(['approved']);
    expect(summary.topInternalFindings.map((item) => item.id)).toEqual(['draft', 'needs_review']);
  });

  it('creates review queue rows for terms, findings, evidence, report blockers, and unassigned documents', () => {
    const queue = buildReviewQueue({
      now,
      documents: [
        {
          id: 'doc_contract',
          document_type: 'contract',
          file_name: 'contract.pdf',
          customer_id: null,
          parse_status: 'parsed',
          created_at: '2026-04-10T00:00:00.000Z'
        }
      ],
      terms: [
        {
          id: 'term_low',
          term_type: 'annual_uplift',
          confidence: 0.5,
          review_status: 'needs_review',
          updated_at: '2026-04-22T00:00:00.000Z'
        },
        {
          id: 'term_review',
          term_type: 'minimum_commitment',
          confidence: 0.9,
          review_status: 'extracted',
          updated_at: '2026-04-26T00:00:00.000Z'
        }
      ],
      findings: [approvedFinding, draftFinding],
      evidenceCandidates: [
        {
          id: 'candidate',
          finding_id: 'draft',
          retrieval_score: 0.4,
          approval_state: 'suggested',
          created_at: '2026-04-25T00:00:00.000Z'
        }
      ],
      readinessIssues: [
        {
          category: 'report_blockers',
          severity: 'blocker',
          title: 'Report export is blocked',
          affectedEntityIds: ['approved'],
          recommendedAction: 'Attach approved invoice evidence.',
          deepLink: '/app/reports'
        }
      ]
    });

    expect(queue.map((item) => item.kind)).toEqual([
      'finding_review',
      'evidence_approval',
      'report_blocker',
      'low_confidence_term',
      'unassigned_document',
      'term_review'
    ]);
    expect(queue[0]).toMatchObject({
      id: 'finding:draft',
      amountMinor: 900_000
    });
    expect(queue[0]?.falsePositiveRisk).toBeCloseTo(0.38);
    expect(queue.find((item) => item.kind === 'report_blocker')?.amountMinor).toBe(125_000);
  });

  it('does not invent placeholder money when only documents and terms are present', () => {
    const queue = buildReviewQueue({
      now,
      documents: [
        {
          id: 'doc_contract',
          document_type: 'contract',
          file_name: 'contract.pdf',
          customer_id: null,
          parse_status: 'pending'
        }
      ],
      terms: [
        {
          id: 'term_review',
          term_type: 'discount',
          confidence: 0.8,
          review_status: 'needs_review'
        }
      ]
    });

    expect(queue).toHaveLength(2);
    expect(queue.every((item) => item.amountMinor === 0)).toBe(true);
  });
});

function finding(override: Partial<GuidedAuditFinding>): GuidedAuditFinding {
  return {
    id: 'finding',
    customer_id: 'customer_alpha',
    finding_type: 'minimum_commitment_shortfall',
    title: 'Minimum commitment shortfall',
    summary: 'Billed amount is below the approved minimum.',
    estimated_amount_minor: 0,
    currency: 'USD',
    confidence: 0.9,
    status: 'approved',
    severity: 'high',
    evidence_coverage_status: 'complete',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...override
  };
}
