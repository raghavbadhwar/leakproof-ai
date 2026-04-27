import { describe, expect, it } from 'vitest';
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFinding } from '../analytics/workspaceAnalytics';
import { generateExecutiveAuditReport, type ReportFinding } from '../evidence/report';
import {
  activeCompletedRuns,
  activeLatestRows,
  AUDIT_RUN_STATUSES,
  buildFindingLogicalKey,
  readFindingPeriod
} from './runVersions';
import type { LeakageFinding } from '../leakage/types';

describe('audit run idempotency helpers', () => {
  it('keeps a second reconciliation run from doubling customer-facing totals', () => {
    const activeFindings = activeLatestRows([
      reportFinding('first_run_duplicate', 100_000, false),
      reportFinding('second_run_latest', 100_000, true)
    ]);

    const report = generateExecutiveAuditReport({
      organizationName: 'LeakProof Demo',
      workspaceName: 'April audit',
      findings: activeFindings
    });
    const analytics = buildWorkspaceAnalytics({
      findings: activeFindings.map((finding): WorkspaceAnalyticsFinding => ({
        id: finding.id,
        title: finding.title,
        findingType: finding.findingType,
        outcomeType: finding.outcomeType,
        status: finding.status,
        amountMinor: finding.amountMinor,
        currency: finding.currency,
        confidence: finding.confidence
      }))
    });

    expect(report.totalPotentialLeakageMinor).toBe(100_000);
    expect(analytics.customerFacing.totalLeakageMinor).toBe(100_000);
  });

  it('excludes superseded findings from reports after a later run is promoted', () => {
    const activeFindings = activeLatestRows([
      reportFinding('old_approved', 250_000, false, '2026-04-27T10:00:00.000Z'),
      reportFinding('new_approved', 175_000, true)
    ]);

    const report = generateExecutiveAuditReport({
      organizationName: 'LeakProof Demo',
      workspaceName: 'April audit',
      findings: activeFindings
    });

    expect(report.topFindings.map((finding) => finding.id)).toEqual(['new_approved']);
    expect(report.totalPotentialLeakageMinor).toBe(175_000);
  });

  it('leaves the last good run visible when a new run fails before promotion', () => {
    const visibleRows = activeLatestRows([
      reportFinding('last_good_run', 90_000, true),
      reportFinding('failed_staged_run', 500_000, false)
    ]);

    const completedRuns = activeCompletedRuns([
      { id: 'run_1', status: 'completed' },
      { id: 'run_2', status: 'failed' }
    ]);

    expect(visibleRows.map((finding) => finding.id)).toEqual(['last_good_run']);
    expect(completedRuns.map((run) => run.id)).toEqual(['run_1']);
  });

  it('keeps run history auditable while separating latest active rows', () => {
    const runs = [
      { id: 'run_1', status: 'superseded' as const },
      { id: 'run_2', status: 'completed' as const },
      { id: 'run_3', status: 'failed' as const }
    ];

    expect(AUDIT_RUN_STATUSES).toEqual(['queued', 'processing', 'completed', 'failed', 'superseded']);
    expect(runs).toHaveLength(3);
    expect(activeCompletedRuns(runs).map((run) => run.id)).toEqual(['run_2']);
  });

  it('builds stable logical finding keys from customer, type, period, and source ids', () => {
    const finding = leakageFinding({
      sourceIds: ['usage_row_2', 'invoice_row_1'],
      calculation: { periodStart: '2026-03-01', periodEnd: '2026-03-31' }
    });

    expect(buildFindingLogicalKey(finding)).toBe(buildFindingLogicalKey({ ...finding, citations: [...finding.citations].reverse() }));
    expect(buildFindingLogicalKey(finding)).not.toBe(
      buildFindingLogicalKey(leakageFinding({ sourceIds: ['usage_row_3'], calculation: { periodStart: '2026-03-01', periodEnd: '2026-03-31' } }))
    );
    expect(readFindingPeriod(finding.calculation)).toEqual(['2026-03-01', '2026-03-31']);
  });
});

function reportFinding(id: string, amountMinor: number, isActive: boolean, supersededAt: string | null = null): ReportFinding & { is_active: boolean; superseded_at: string | null } {
  return {
    id,
    title: 'Minimum commitment shortfall',
    findingType: 'minimum_commitment_shortfall',
    outcomeType: 'recoverable_leakage',
    status: 'approved',
    amountMinor,
    currency: 'USD',
    confidence: 0.94,
    calculation: { formula: 'minimum_commitment - invoiced_amount', minimum_commitment_minor: 150_000, invoiced_amount_minor: 50_000 },
    evidenceCitations: [
      { label: 'Contract section 4.1', sourceType: 'contract', approvalState: 'approved' },
      { label: 'Invoice row 12', sourceType: 'invoice', approvalState: 'approved' }
    ],
    is_active: isActive,
    superseded_at: supersededAt
  };
}

function leakageFinding(input: { sourceIds: string[]; calculation: Record<string, unknown> }): LeakageFinding {
  return {
    id: 'finding_minimum_customer_alpha',
    customerId: 'customer_alpha',
    type: 'minimum_commitment_shortfall',
    title: 'Invoice total is below contractual minimum commitment',
    summary: 'Shortfall identified.',
    outcomeType: 'recoverable_leakage',
    estimatedAmount: { amountMinor: 100_000, currency: 'USD' },
    confidence: 0.94,
    status: 'draft',
    calculation: input.calculation,
    citations: input.sourceIds.map((sourceId) => ({
      sourceType: sourceId.startsWith('invoice') ? 'invoice' : 'usage',
      sourceId,
      label: sourceId
    }))
  };
}
