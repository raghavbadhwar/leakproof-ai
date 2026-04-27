'use client';

import { ClipboardCheck, Download, FileText, Printer } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportSection } from '@/components/ui/report-section';

type ReportEmptyStateKey = 'no_approved_findings' | 'missing_approved_evidence' | 'report_not_exportable_yet';

type ReportCitationViewData = {
  label: string;
  excerpt?: string;
  sourceType?: string;
  approvalState?: 'draft' | 'suggested' | 'approved' | 'rejected';
};

type ReportFindingViewData = {
  id: string;
  title: string;
  findingType: string;
  outcomeType: string;
  status: string;
  amountMinor: number;
  currency: string;
  confidence: number;
  customerName?: string;
  recommendedAction?: string;
  evidenceCitations?: ReportCitationViewData[];
};

type ReportBreakdownViewData = {
  label: string;
  amountMinor: number;
  findingCount: number;
};

export type ExecutiveReportViewData = {
  organizationName: string;
  workspaceName: string;
  generatedAt: string;
  displayLabels?: {
    customerFacingLeakage: string;
    approvedEvidenceOnly: string;
    humanReviewed: string;
    generatedAt: string;
    includedStatuses: string;
  };
  metadata?: {
    generated_at: string;
    generated_by?: string;
    workspace_id?: string;
    report_version: string;
    included_statuses: string[];
    evidence_policy?: string;
    review_policy?: string;
    status_eligible_finding_count?: number;
    excluded_after_evidence_review_count?: number;
  };
  currency: string;
  totalPotentialLeakageMinor: number;
  totalApprovedRecoverableMinor: number;
  totalPreventedLeakageMinor: number;
  totalRecoveredMinor: number;
  totalRiskOnlyItems: number;
  includedFindingCount: number;
  findingsByCategory: Record<string, number>;
  findingsByCustomer: Record<string, number>;
  findingsByStatus: Record<string, number>;
  executiveSummary?: {
    totalLeakageMinor: number;
    recoverableLeakageMinor: number;
    preventedFutureLeakageMinor: number;
    recoveredAmountMinor: number;
    includedFindingCount: number;
    currency: string;
    summary: string;
  };
  includedFindings?: ReportFindingViewData[];
  recoverableLeakage?: { totalMinor: number; findings: ReportFindingViewData[] };
  preventedFutureLeakage?: { totalMinor: number; findings: ReportFindingViewData[] };
  recoveredAmount?: { totalMinor: number; findings: ReportFindingViewData[] };
  riskOnlyItems?: { totalItems: number; findings: ReportFindingViewData[] };
  leakageByCustomer?: Record<string, number>;
  leakageByCategory?: Record<string, number>;
  customerBreakdown?: ReportBreakdownViewData[];
  categoryBreakdown?: ReportBreakdownViewData[];
  topFindings: ReportFindingViewData[];
  methodology?: string[];
  methodologyNote: string;
  appendixWithCitations?: Array<{ findingId: string; title: string; citations: ReportCitationViewData[] }>;
  evidenceAppendix?: Array<{ findingId: string; title: string; citations: ReportCitationViewData[] }>;
  exportability?: {
    exportable: boolean;
    blockers: ReportEmptyStateKey[];
    statusEligibleFindingCount: number;
    includedFindingCount: number;
    excludedAfterEvidenceReviewCount: number;
    emptyStates: Record<ReportEmptyStateKey, { title: string; detail: string }>;
  };
};

const fallbackDisplayLabels = {
  customerFacingLeakage: 'Customer-facing leakage',
  approvedEvidenceOnly: 'Approved evidence only',
  humanReviewed: 'Human reviewed',
  generatedAt: 'Generated at',
  includedStatuses: 'Included statuses'
};

const fallbackEmptyStates: Record<ReportEmptyStateKey, { title: string; detail: string }> = {
  no_approved_findings: {
    title: 'No approved findings',
    detail: 'Approve at least one finding before creating a customer-facing report.'
  },
  missing_approved_evidence: {
    title: 'Missing approved evidence',
    detail: 'Some customer-facing findings still need approved contract, invoice, or usage evidence before export.'
  },
  report_not_exportable_yet: {
    title: 'Report not exportable yet',
    detail: 'Generate a report after findings and evidence are approved, then export it for internal review.'
  }
};

export function ExecutiveReportPreview({
  report,
  reportPackId,
  approvedFindingCount,
  onGenerate,
  onCopy,
  onDownloadJson,
  onExportPdf,
  isBusy
}: {
  report: ExecutiveReportViewData | null;
  reportPackId: string;
  approvedFindingCount: number;
  onGenerate: () => void;
  onCopy: () => void;
  onDownloadJson: () => void;
  onExportPdf: () => void;
  isBusy: boolean;
}) {
  const labels = report?.displayLabels ?? fallbackDisplayLabels;
  const includedStatuses = report?.metadata?.included_statuses ?? ['approved', 'customer_ready', 'recovered'];
  const exportable = Boolean(report?.exportability?.exportable && reportPackId);
  const missingEvidenceCount = report?.exportability?.excludedAfterEvidenceReviewCount ?? 0;

  return (
    <div className="report-layout cfo-report-layout">
      <div className="report-print-surface">
        <header className="report-cover">
          <div>
            <span className="scope-label">{labels.customerFacingLeakage}</span>
            <h2>Executive audit report</h2>
            <p>
              {report?.executiveSummary?.summary ??
                'Generate a customer-ready report after review. The exported version will include only approved findings and approved evidence.'}
            </p>
          </div>
          <dl className="report-meta-grid">
            <div>
              <dt>{labels.generatedAt}</dt>
              <dd>{report ? formatDateTime(report.generatedAt) : 'Not generated'}</dd>
            </div>
            <div>
              <dt>{labels.includedStatuses}</dt>
              <dd>{includedStatuses.map(formatLabel).join(', ')}</dd>
            </div>
            <div>
              <dt>Report version</dt>
              <dd>{report?.metadata?.report_version ?? 'Pending'}</dd>
            </div>
          </dl>
        </header>

        <div className="report-trust-row">
          <span>{labels.customerFacingLeakage}</span>
          <span>{labels.approvedEvidenceOnly}</span>
          <span>{labels.humanReviewed}</span>
        </div>

        {!report ? (
          <EmptyState
            title={approvedFindingCount > 0 ? 'Report not exportable yet' : 'No approved findings'}
            detail={
              approvedFindingCount > 0
                ? 'Generate the report to confirm approved evidence coverage before copying, downloading, or printing.'
                : 'Approve at least one finding and its evidence before creating a customer-facing report.'
            }
          />
        ) : (
          <>
            <ReportBlockers report={report} />

            <ReportSection
              title="Executive summary"
              detail="Customer-facing totals include only findings that passed status, evidence, review, and calculation readiness."
            >
              <div className="report-total-grid">
                <ReportTotalCard
                  label="Total recoverable leakage"
                  value={formatMoney(report.totalApprovedRecoverableMinor, report.currency)}
                  detail={`${report.recoverableLeakage?.findings.length ?? 0} included finding${(report.recoverableLeakage?.findings.length ?? 0) === 1 ? '' : 's'}`}
                />
                <ReportTotalCard
                  label="Total prevented future leakage"
                  value={formatMoney(report.totalPreventedLeakageMinor, report.currency)}
                  detail={`${report.preventedFutureLeakage?.findings.length ?? 0} prevention item${(report.preventedFutureLeakage?.findings.length ?? 0) === 1 ? '' : 's'}`}
                />
                <ReportTotalCard
                  label="Recovered amount"
                  value={formatMoney(report.totalRecoveredMinor, report.currency)}
                  detail={`${report.recoveredAmount?.findings.length ?? 0} marked recovered`}
                />
                <ReportTotalCard
                  label="Risk-only items"
                  value={String(report.totalRiskOnlyItems)}
                  detail="Listed separately from recovery actions"
                />
              </div>
            </ReportSection>

            <ReportSection title="Findings by customer" detail="Customer-level leakage included in this export.">
              <BreakdownTable
                rows={report.customerBreakdown ?? breakdownFromRecords(report.leakageByCustomer ?? {}, report.findingsByCustomer)}
                currency={report.currency}
                emptyTitle="No customer breakdown yet"
              />
            </ReportSection>

            <ReportSection title="Findings by category" detail="Pattern-level view for finance and operating follow-up.">
              <BreakdownTable
                rows={report.categoryBreakdown ?? breakdownFromRecords(report.leakageByCategory ?? {}, report.findingsByCategory)}
                currency={report.currency}
                emptyTitle="No category breakdown yet"
              />
            </ReportSection>

            <ReportSection title="Top 10 findings" detail="Largest customer-facing findings included in the pilot audit report.">
              <FindingsTable findings={report.topFindings} currency={report.currency} />
            </ReportSection>

            <ReportSection title="Methodology" detail={`${labels.approvedEvidenceOnly}. ${labels.humanReviewed}.`}>
              <ol className="report-methodology-list">
                {(report.methodology ?? [report.methodologyNote]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </ReportSection>

            <ReportSection title="Appendix with citations" detail="Approved citations supporting every included finding.">
              <CitationAppendix appendix={report.appendixWithCitations ?? report.evidenceAppendix ?? []} />
            </ReportSection>
          </>
        )}
      </div>

      <aside className="report-controls-panel no-print">
        <h3>Report controls</h3>
        <p className="muted">
          Export stays locked until at least one finding passes the approved evidence rules.
        </p>
        <div className="report-readiness-list">
          <span><strong>{report?.includedFindingCount ?? 0}</strong> included findings</span>
          <span><strong>{report?.exportability?.statusEligibleFindingCount ?? approvedFindingCount}</strong> eligible statuses</span>
          <span><strong>{missingEvidenceCount}</strong> excluded after evidence review</span>
        </div>
        <div className="report-action-stack">
          <button onClick={onGenerate} disabled={isBusy}>
            <FileText size={16} /> Generate customer-ready report
          </button>
          <button className="secondary-button" onClick={onCopy} disabled={!exportable || isBusy}>
            <ClipboardCheck size={16} /> Copy report
          </button>
          <button className="secondary-button" onClick={onDownloadJson} disabled={!exportable || isBusy}>
            <Download size={16} /> Download JSON
          </button>
          <button className="secondary-button" onClick={onExportPdf} disabled={!exportable || isBusy}>
            <Printer size={16} /> Export PDF
          </button>
        </div>
      </aside>
    </div>
  );
}

function ReportBlockers({ report }: { report: ExecutiveReportViewData }) {
  const blockers = report.exportability?.blockers ?? [];
  if (blockers.length === 0) return null;
  const emptyStates = report.exportability?.emptyStates ?? fallbackEmptyStates;
  return (
    <div className="report-empty-grid">
      {blockers.map((blocker) => (
        <EmptyState
          key={blocker}
          title={emptyStates[blocker]?.title ?? fallbackEmptyStates[blocker].title}
          detail={emptyStates[blocker]?.detail ?? fallbackEmptyStates[blocker].detail}
          compact
        />
      ))}
    </div>
  );
}

function ReportTotalCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="report-total-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

function BreakdownTable({
  rows,
  currency,
  emptyTitle
}: {
  rows: ReportBreakdownViewData[];
  currency: string;
  emptyTitle: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} detail="Approved findings will populate this table once the report is exportable." compact />;
  }

  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Findings</th>
            <th>Included leakage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{formatLabel(row.label)}</td>
              <td>{row.findingCount}</td>
              <td>{formatMoney(row.amountMinor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingsTable({ findings, currency }: { findings: ReportFindingViewData[]; currency: string }) {
  if (findings.length === 0) {
    return <EmptyState title="No top findings yet" detail="No findings passed the customer-facing evidence rules for this report." compact />;
  }

  return (
    <div className="report-table-wrap">
      <table className="report-table report-findings-table">
        <thead>
          <tr>
            <th>Finding</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.id}>
              <td>
                <strong>{finding.title}</strong>
                <span>{finding.recommendedAction ?? formatLabel(finding.findingType)}</span>
              </td>
              <td>{finding.customerName ?? 'Unassigned customer'}</td>
              <td>{formatLabel(finding.status)}</td>
              <td>{formatMoney(finding.amountMinor, finding.currency || currency)}</td>
              <td>{finding.evidenceCitations?.length ?? 0} approved</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CitationAppendix({
  appendix
}: {
  appendix: Array<{ findingId: string; title: string; citations: ReportCitationViewData[] }>;
}) {
  if (appendix.length === 0) {
    return <EmptyState title="No approved citations yet" detail="Approved citations will appear after findings pass report readiness." compact />;
  }

  return (
    <div className="report-appendix">
      {appendix.map((entry) => (
        <article key={entry.findingId}>
          <h4>{entry.title}</h4>
          {entry.citations.length > 0 ? (
            <ul>
              {entry.citations.map((citation) => (
                <li key={`${entry.findingId}-${citation.sourceType ?? 'source'}-${citation.label}`}>
                  <strong>{formatLabel(citation.sourceType ?? 'source')}</strong>
                  <span>{citation.label}</span>
                  {citation.excerpt ? <p>{citation.excerpt}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No approved citations attached.</p>
          )}
        </article>
      ))}
    </div>
  );
}

function breakdownFromRecords(amounts: Record<string, number>, counts: Record<string, number>): ReportBreakdownViewData[] {
  return Object.entries(amounts)
    .map(([label, amountMinor]) => ({ label, amountMinor, findingCount: counts[label] ?? 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.label.localeCompare(b.label));
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amountMinor / 100);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
