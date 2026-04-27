import { describe, expect, it } from 'vitest';
import {
  checkReportReadiness,
  detectMissingData,
  getAnalyticsSummary,
  getFindingDetail,
  getFindings,
  routeCopilotTools,
  runCopilotTool
} from './tools';
import { redactCopilotOutput } from './redaction';
import type { CopilotDataContext } from './context';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const otherWorkspaceId = '99999999-9999-4999-8999-999999999999';
const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('read-only Copilot tools', () => {
  it('separates customer-facing leakage from internal exposure', () => {
    const context = contextWithFindings([
      finding({ id: findingId, status: 'approved', amountMinor: 100_000, outcomeType: 'recoverable_leakage' }),
      finding({ id: '33333333-3333-4333-8333-333333333334', status: 'customer_ready', amountMinor: 50_000, outcomeType: 'prevented_future_leakage' }),
      finding({ id: '33333333-3333-4333-8333-333333333335', status: 'recovered', amountMinor: 25_000, outcomeType: 'recoverable_leakage' }),
      finding({ id: '33333333-3333-4333-8333-333333333336', status: 'draft', amountMinor: 900_000 }),
      finding({ id: '33333333-3333-4333-8333-333333333337', status: 'needs_review', amountMinor: 800_000 }),
      finding({ id: '33333333-3333-4333-8333-333333333338', status: 'dismissed', amountMinor: 700_000 }),
      finding({ id: '33333333-3333-4333-8333-333333333339', status: 'not_recoverable', amountMinor: 600_000 })
    ]);

    const summary = getAnalyticsSummary(context, scopedInput());

    expect(summary.total_customer_facing_leakage_minor).toBe(175_000);
    expect(summary.recoverable_leakage_minor).toBe(125_000);
    expect(summary.prevented_leakage_minor).toBe(50_000);
    expect(summary.recovered_amount_minor).toBe(25_000);
    expect(summary.internal_unapproved_exposure_minor).toBe(1_700_000);
    expect(summary.review_burden.needs_review_count).toBe(1);
  });

  it('does not return findings outside the active workspace context', () => {
    const context = contextWithFindings([
      finding({ id: findingId, status: 'needs_review', amountMinor: 100_000 }),
      finding({
        id: '33333333-3333-4333-8333-333333333340',
        workspaceId: otherWorkspaceId,
        status: 'needs_review',
        amountMinor: 999_999
      })
    ]);

    const result = getFindings(context, { ...scopedInput(), status: 'needs_review' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.finding_id).toBe(findingId);
    expect(result.findings[0]?.workspace_id).toBe(workspaceId);
  });

  it('returns formula inputs and evidence references for finding detail', () => {
    const context = contextWithFindings([finding({ id: findingId, status: 'approved', amountMinor: 40_000 })], {
      evidenceItems: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          organizationId,
          workspaceId,
          findingId,
          evidenceType: 'contract_term',
          sourceId: '55555555-5555-4555-8555-555555555555',
          documentChunkId: '66666666-6666-4666-8666-666666666666',
          sourceType: 'contract',
          approvalState: 'approved',
          reviewedBy: '77777777-7777-4777-8777-777777777777',
          reviewedAt: '2026-04-27T00:00:00.000Z'
        }
      ]
    });

    const detail = getFindingDetail(context, { ...scopedInput(), finding_id: findingId });

    expect(detail.formula).toBe('minimum_commitment_minor - billed_minor');
    expect(detail.calculation_inputs).toEqual({
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    });
    expect(detail.citations).toEqual([
      {
        evidence_item_id: '44444444-4444-4444-8444-444444444444',
        evidence_type: 'contract_term',
        source_type: 'contract',
        source_id: '55555555-5555-4555-8555-555555555555',
        document_chunk_id: '66666666-6666-4666-8666-666666666666',
        approval_state: 'approved'
      }
    ]);
  });

  it('blocks report readiness when approved evidence is missing', () => {
    const context = contextWithFindings([finding({ id: findingId, status: 'approved', amountMinor: 40_000 })]);

    const readiness = checkReportReadiness(context, scopedInput());

    expect(readiness.report_ready).toBe(false);
    expect(readiness.missing_approved_evidence).toEqual([findingId]);
    expect(readiness.findings_excluded_from_report).toEqual([
      { finding_id: findingId, blocker: 'approved_evidence_required' }
    ]);
  });

  it('detects missing source uploads and review gaps', () => {
    const context = contextWithFindings([finding({ id: findingId, status: 'needs_review', amountMinor: 40_000 })], {
      documents: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          organizationId,
          workspaceId,
          customerId: null,
          documentType: 'contract',
          parseStatus: 'parsed',
          chunkingStatus: 'chunked',
          embeddingStatus: 'embedded'
        }
      ],
      terms: [
        {
          id: '99999999-9999-4999-8999-999999999991',
          organizationId,
          workspaceId,
          customerId,
          sourceDocumentId: '88888888-8888-4888-8888-888888888888',
          termType: 'minimum_commitment',
          confidence: 0.5,
          reviewStatus: 'needs_review'
        }
      ],
      invoiceRecords: [
        {
          id: '99999999-9999-4999-8999-999999999992',
          organizationId,
          workspaceId,
          customerId: null,
          sourceDocumentId: null,
          amountMinor: 10_000,
          currency: 'USD'
        }
      ]
    });

    const missing = detectMissingData(context, scopedInput());

    expect(missing.no_contract_uploaded).toBe(false);
    expect(missing.no_invoice_csv_uploaded).toBe(true);
    expect(missing.no_usage_csv_uploaded).toBe(true);
    expect(missing.contracts_without_customer).toEqual(['88888888-8888-4888-8888-888888888888']);
    expect(missing.invoices_without_customer).toEqual(['99999999-9999-4999-8999-999999999992']);
    expect(missing.terms_pending_review).toEqual(['99999999-9999-4999-8999-999999999991']);
    expect(missing.low_confidence_extraction_terms).toEqual([
      { term_id: '99999999-9999-4999-8999-999999999991', confidence: 0.5 }
    ]);
    expect(missing.findings_missing_evidence).toEqual([findingId]);
  });

  it('redacts raw source fields from tool output', () => {
    const output = runCopilotTool(contextWithFindings([finding({ id: findingId })]), 'getFindingDetail', {
      ...scopedInput(),
      finding_id: findingId
    });
    const manuallyRedacted = redactCopilotOutput({
      source: {
        content: 'Raw contract text should never appear.',
        excerpt: 'Invoice CSV row contents should never appear.',
        storage_path: 'org/private/source.pdf'
      },
      finding_id: findingId
    });

    expect(JSON.stringify(output.output)).not.toContain('Raw contract text');
    expect(JSON.stringify(manuallyRedacted)).not.toContain('Raw contract text');
    expect(JSON.stringify(manuallyRedacted)).not.toContain('Invoice CSV row contents');
    expect(JSON.stringify(manuallyRedacted)).not.toContain('org/private/source.pdf');
  });

  it('routes simple messages to deterministic read-only tools', () => {
    expect(routeCopilotTools({ organizationId, workspaceId, message: 'What is the total leakage?' }).map((tool) => tool.toolName)).toEqual([
      'getAnalyticsSummary'
    ]);
    expect(routeCopilotTools({ organizationId, workspaceId, message: 'What is the biggest leakage?' }).map((tool) => tool.toolName)).toEqual([
      'getAnalyticsSummary',
      'getFindings'
    ]);
    expect(routeCopilotTools({ organizationId, workspaceId, message: 'Is the report ready?' }).map((tool) => tool.toolName)).toEqual([
      'checkReportReadiness'
    ]);
    expect(
      routeCopilotTools({
        organizationId,
        workspaceId,
        message: 'Explain selected finding formula',
        selectedFindingId: findingId
      }).map((tool) => tool.toolName)
    ).toEqual(['getFindingDetail', 'explainFindingFormulaDeterministic']);
    expect(
      routeCopilotTools({
        organizationId,
        workspaceId,
        message: 'Check false-positive risk',
        selectedFindingId: findingId
      }).map((tool) => tool.toolName)
    ).toEqual(['falsePositiveRiskCheck']);
    expect(
      routeCopilotTools({
        organizationId,
        workspaceId,
        message: 'Draft recovery note',
        selectedFindingId: findingId
      }).map((tool) => tool.toolName)
    ).toEqual(['prepareRecoveryNote']);
    expect(routeCopilotTools({ organizationId, workspaceId, message: 'Prepare CFO summary.' }).map((tool) => tool.toolName)).toEqual([
      'prepareCfoSummary'
    ]);
  });

  it('runs advisory finding intelligence tools through the registry', () => {
    const output = runCopilotTool(contextWithFindings([finding({ id: findingId })]), 'evidenceQualityReview', {
      ...scopedInput(),
      finding_id: findingId
    });

    expect(output.outputRefs).toEqual({ finding_id: findingId, advisory_only: true });
    expect(JSON.stringify(output.output)).not.toContain('Raw contract text');
  });
});

function scopedInput() {
  return {
    organization_id: organizationId,
    workspace_id: workspaceId
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
