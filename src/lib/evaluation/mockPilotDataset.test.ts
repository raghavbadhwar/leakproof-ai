import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import contractsFixture from '../../../sample-data/mock-pilot/contracts.json';
import expectedFixture from '../../../sample-data/mock-pilot/expected_findings.json';
import { contractExtractionSchema, type ContractExtraction } from '../agents/contractSchema';
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFinding } from '../analytics/workspaceAnalytics';
import { generateExecutiveAuditReport, type ReportFinding } from '../evidence/report';
import { parseCustomerCsv, parseInvoiceCsv, parseUsageCsv } from '../ingest/csv';
import { reconcileLeakage } from '../leakage/reconcile';
import type { Citation, ContractTerm, InvoiceRecord, LeakageFinding, UsageRecord } from '../leakage/types';

type ContractFixture = {
  customer_external_id: string;
  customer_name: string;
  expected_extracted_terms: ContractExtraction['terms'];
};

type ExpectedFinding = {
  type: LeakageFinding['type'];
  amount_minor: number;
  currency: string;
};

type ExpectedCustomer = {
  customer_external_id: string;
  customer_name: string;
  expected_findings: ExpectedFinding[];
};

const contracts = contractsFixture as ContractFixture[];
const expected = expectedFixture as {
  expected_total_leakage_minor: number;
  currency: string;
  customers: ExpectedCustomer[];
};

describe('mock pilot evaluation dataset', () => {
  it('keeps contracts, invoices, usage, customer metadata, and expected findings parseable', () => {
    const dataset = loadDataset();

    expect(dataset.customers).toHaveLength(expected.customers.length);
    expect(dataset.terms.length).toBeGreaterThan(0);
    expect(dataset.invoices.length).toBeGreaterThan(0);
    expect(dataset.usage.length).toBeGreaterThan(0);
    expect(expected.expected_total_leakage_minor).toBe(2_669_000);
  });

  it('validates the expected extraction terms against the production extraction schema', () => {
    for (const contract of contracts) {
      const parsed = contractExtractionSchema.parse({ terms: contract.expected_extracted_terms });

      expect(parsed.terms.every((term) => term.citation.sourceType === 'contract')).toBe(true);
      expect(parsed.terms.every((term) => term.confidence >= 0.9)).toBe(true);
    }
  });

  it('reconciles the provided mock set to final leakage USD 26,690', () => {
    const findings = reconcileMockDataset();
    const total = findings.reduce((sum, finding) => sum + finding.estimatedAmount.amountMinor, 0);

    expect(total).toBe(expected.expected_total_leakage_minor);
    expect(total / 100).toBe(26_690);
  });

  it('matches expected finding type and amount per customer', () => {
    const findingsByCustomer = groupFindingsByCustomer(reconcileMockDataset());

    for (const customer of expected.customers) {
      const actual = (findingsByCustomer.get(customer.customer_external_id) ?? [])
        .map((finding) => ({
          type: finding.type,
          amount_minor: finding.estimatedAmount.amountMinor,
          currency: finding.estimatedAmount.currency
        }))
        .sort((a, b) => a.type.localeCompare(b.type));
      const expectedFindings = [...customer.expected_findings].sort((a, b) => a.type.localeCompare(b.type));

      expect(actual, customer.customer_name).toEqual(expectedFindings);
    }
  });

  it('feeds analytics without counting draft or dismissed findings as customer-facing leakage', () => {
    const reportable = reconcileMockDataset().map((finding) => analyticsFinding(finding, 'approved'));
    const analytics = buildWorkspaceAnalytics({
      generatedAt: '2026-04-27T00:00:00.000Z',
      findings: [
        ...reportable,
        analyticsFinding(reportableSource('draft_extra', 999_000), 'draft'),
        analyticsFinding(reportableSource('dismissed_extra', 888_000), 'dismissed')
      ]
    });

    expect(analytics.customerFacing.totalLeakageMinor).toBe(expected.expected_total_leakage_minor);
    expect(analytics.internalPipeline.unapprovedExposureMinor).toBe(999_000);
    expect(analytics.reviewBurden.allStatuses.map((item) => item.label)).toContain('Dismissed');
  });

  it('builds a customer-facing report only from approved findings with approved evidence', () => {
    const findings = reconcileMockDataset();
    const reportFindings = findings.map((finding, index) => {
      const reportFinding = toReportFinding(finding, 'approved');
      if (index === 0) {
        reportFinding.evidenceCitations = [
          ...(reportFinding.evidenceCitations ?? []),
          { label: 'Rejected reviewer note', sourceType: 'calculation', approvalState: 'rejected' }
        ];
      }
      return reportFinding;
    });

    const report = generateExecutiveAuditReport({
      organizationName: 'LeakProof Mock Pilot',
      workspaceName: 'Mock pilot evaluation',
      findings: [
        ...reportFindings,
        toReportFinding(reportableSource('needs_review_extra', 777_000), 'needs_review'),
        toReportFinding(reportableSource('dismissed_extra', 888_000), 'dismissed')
      ],
      generatedAt: '2026-04-27T00:00:00.000Z'
    });

    expect(report.totalPotentialLeakageMinor).toBe(expected.expected_total_leakage_minor);
    expect(report.includedFindingCount).toBe(findings.length);
    expect(report.findingsByStatus).toEqual({ approved: findings.length });
    expect(report.evidenceAppendix.flatMap((item) => item.citations).some((citation) => citation.label === 'Rejected reviewer note')).toBe(false);
  });
});

function loadDataset() {
  const customers = parseCustomerCsv(readSample('customer_metadata.csv'));
  const invoices = parseInvoiceCsv(readSample('invoices.csv'), { sourceDocumentId: 'mock_invoices', workspaceId: 'workspace_mock_pilot' }).map(
    (row): InvoiceRecord => ({
      ...row,
      customerId: row.customerExternalId,
      amountMinor: row.amountMinor,
      currency: row.currency
    })
  );
  const usage = parseUsageCsv(readSample('usage.csv'), { sourceDocumentId: 'mock_usage', workspaceId: 'workspace_mock_pilot' }).map(
    (row): UsageRecord => ({
      ...row,
      customerId: row.customerExternalId
    })
  );
  const terms = contracts.flatMap((contract) =>
    contract.expected_extracted_terms.map((term, index): ContractTerm => ({
      id: `${contract.customer_external_id}_${term.term_type}_${index + 1}`,
      customerId: contract.customer_external_id,
      type: term.term_type as ContractTerm['type'],
      value: term.normalized_value,
      citation: term.citation as Citation,
      confidence: term.confidence,
      reviewStatus: term.needs_review ? 'needs_review' : 'approved'
    }))
  );

  return { customers, invoices, usage, terms };
}

function reconcileMockDataset(): LeakageFinding[] {
  const dataset = loadDataset();
  return expected.customers.flatMap((customer) =>
    reconcileLeakage({
      customerId: customer.customer_external_id,
      terms: dataset.terms,
      invoices: dataset.invoices,
      usage: dataset.usage
    })
  );
}

function groupFindingsByCustomer(findings: LeakageFinding[]): Map<string, LeakageFinding[]> {
  const grouped = new Map<string, LeakageFinding[]>();
  for (const finding of findings) {
    grouped.set(finding.customerId, [...(grouped.get(finding.customerId) ?? []), finding]);
  }
  return grouped;
}

function toReportFinding(finding: LeakageFinding, status: ReportFinding['status']): ReportFinding {
  return {
    id: finding.id,
    title: finding.title,
    findingType: finding.type,
    outcomeType: finding.outcomeType,
    status,
    amountMinor: finding.estimatedAmount.amountMinor,
    currency: finding.estimatedAmount.currency,
    confidence: finding.confidence,
    customerName: expected.customers.find((customer) => customer.customer_external_id === finding.customerId)?.customer_name,
    calculation: finding.calculation,
    evidenceCitations: finding.citations.map((citation) => ({ ...citation, approvalState: 'approved' as const }))
  };
}

function analyticsFinding(finding: LeakageFinding, status: WorkspaceAnalyticsFinding['status']): WorkspaceAnalyticsFinding {
  const customer = expected.customers.find((item) => item.customer_external_id === finding.customerId);
  return {
    id: finding.id,
    title: finding.title,
    findingType: finding.type,
    outcomeType: finding.outcomeType,
    status,
    amountMinor: finding.estimatedAmount.amountMinor,
    currency: finding.estimatedAmount.currency,
    confidence: finding.confidence,
    customerId: finding.customerId,
    customerName: customer?.customer_name ?? finding.customerId,
    evidenceCoverageStatus: 'complete',
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z'
  };
}

function reportableSource(id: string, amountMinor: number): LeakageFinding {
  return {
    id,
    customerId: 'alpha',
    type: 'minimum_commitment_shortfall',
    title: id,
    summary: id,
    outcomeType: 'recoverable_leakage',
    estimatedAmount: { amountMinor, currency: 'USD' },
    confidence: 0.9,
    status: 'draft',
    calculation: { formula: 'fixture_amount' },
    citations: [{ sourceType: 'contract', sourceId: 'contract_alpha', label: 'Fixture contract evidence' }]
  };
}

function readSample(fileName: string): string {
  return readFileSync(new URL(`../../../sample-data/mock-pilot/${fileName}`, import.meta.url), 'utf8');
}
