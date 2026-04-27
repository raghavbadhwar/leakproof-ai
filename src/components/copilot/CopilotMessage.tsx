import { Bot, UserRound } from 'lucide-react';
import { CopilotActionCard } from './CopilotActionCard';
import { CopilotCitations } from './CopilotCitations';
import type { CopilotActionCardData, CopilotCitation, CopilotConversationMessage } from './types';

export function CopilotMessage({
  message,
  onConfirmAction,
  onCancelAction,
  busyActionId
}: {
  message: CopilotConversationMessage;
  onConfirmAction?: (actionId: string) => void;
  onCancelAction?: (actionId: string) => void;
  busyActionId?: string | null;
}) {
  const cards = message.response ? cardsFromResponse(message.response.data) : [];
  const actionCards = (message.response?.action_cards ?? []).map((action) => ({
    id: `action-${action.id}`,
    title: action.title,
    detail: action.description,
    label: 'Pending action',
    tone: toneForRisk(action.risk_level),
    pendingAction: action
  } satisfies CopilotActionCardData)) ?? [];
  const citations = message.response ? citationsFromResponse(message.response.data, message.response.routed_tool_names) : [];

  return (
    <article className={`copilot-message copilot-message-${message.role}`}>
      <div className="copilot-message-avatar" aria-hidden="true">
        {message.role === 'assistant' ? <Bot size={15} /> : <UserRound size={15} />}
      </div>
      <div className="copilot-message-body">
        <p>{message.content}</p>
        {message.error ? <div className="copilot-error-text">{message.error}</div> : null}
        {message.response?.warnings.length ? (
          <div className="copilot-warning-list">
            {message.response.warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}
        <CopilotCitations citations={citations} />
        {actionCards.length + cards.length > 0 ? (
          <div className="copilot-card-grid">
            {[...actionCards, ...cards].map((card) => (
              <CopilotActionCard
                key={card.id}
                card={card}
                onConfirm={onConfirmAction}
                onCancel={onCancelAction}
                isBusy={card.pendingAction ? busyActionId === card.pendingAction.id : false}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function cardsFromResponse(data: Record<string, unknown>): CopilotActionCardData[] {
  const cards: CopilotActionCardData[] = [];
  const analytics = recordValue(data.getAnalyticsSummary);
  if (analytics) {
    const currency = stringValue(analytics.currency) ?? 'USD';
    cards.push({
      id: 'customer-facing-leakage',
      title: 'Customer-facing leakage',
      value: formatMinor(numberValue(analytics.total_customer_facing_leakage_minor), currency),
      detail: 'Approved, customer-ready, and recovered findings only.',
      href: '/app/analytics',
      label: 'Code-calculated',
      tone: 'danger'
    });
    cards.push({
      id: 'internal-exposure',
      title: 'Internal pipeline exposure',
      value: formatMinor(numberValue(analytics.internal_unapproved_exposure_minor), currency),
      detail: 'Draft and needs-review findings stay separate.',
      href: '/app/findings',
      label: 'Needs finance review',
      tone: 'warning'
    });
  }

  const findings = arrayValue(recordValue(data.getFindings)?.findings).slice(0, 4);
  for (const finding of findings) {
    const row = recordValue(finding);
    if (!row) continue;
    const id = stringValue(row.finding_id);
    cards.push({
      id: `finding-${id ?? cards.length}`,
      title: stringValue(row.safe_title) ?? stringValue(row.finding_type) ?? 'Finding',
      value: formatMinor(numberValue(row.amount_minor), stringValue(row.currency) ?? 'USD'),
      detail: `${stringValue(row.status) ?? 'unknown'} · ${stringValue(row.outcome_type) ?? 'outcome pending'}`,
      href: id ? `/app/findings/${id}` : '/app/findings',
      label: 'Finding reference',
      tone: stringValue(row.status) === 'needs_review' ? 'warning' : 'default'
    });
  }

  const readiness = recordValue(data.checkReportReadiness);
  if (readiness) {
    const ready = booleanValue(readiness.report_ready);
    cards.push({
      id: 'report-readiness',
      title: ready ? 'Report-ready references exist' : 'Report is blocked',
      value: String(numberValue(readiness.included_findings_count)),
      detail: ready ? 'Only approved evidence-backed findings are counted.' : 'Resolve approved finding and evidence requirements first.',
      href: '/app/reports',
      label: 'Approved evidence only',
      tone: ready ? 'good' : 'warning'
    });
  }

  const missing = recordValue(data.detectMissingData);
  if (missing) {
    const missingItems = [
      booleanValue(missing.no_contract_uploaded) ? 'Contract' : null,
      booleanValue(missing.no_invoice_csv_uploaded) ? 'Invoice CSV' : null,
      booleanValue(missing.no_usage_csv_uploaded) ? 'Usage CSV' : null
    ].filter((item): item is string => Boolean(item));
    cards.push({
      id: 'missing-data',
      title: missingItems.length > 0 ? 'Missing source data' : 'Core source uploads present',
      value: missingItems.length > 0 ? String(missingItems.length) : '0',
      detail: missingItems.length > 0 ? missingItems.join(', ') : 'Check pending terms and evidence before reporting.',
      href: '/app/uploads',
      label: 'Workspace setup',
      tone: missingItems.length > 0 ? 'warning' : 'good'
    });
  }

  const detail = recordValue(data.getFindingDetail);
  if (detail) {
    const id = stringValue(detail.finding_id);
    cards.push({
      id: `detail-${id ?? 'selected'}`,
      title: stringValue(detail.finding_title) ?? 'Selected finding',
      value: formatMinor(numberValue(detail.amount_minor), stringValue(detail.currency) ?? 'USD'),
      detail: `Formula: ${stringValue(detail.formula) ?? 'not available'}`,
      href: id ? `/app/findings/${id}` : '/app/findings',
      label: 'Formula view',
      tone: 'default'
    });
  }

  const cfo = recordValue(data.prepareCfoSummaryData);
  if (cfo) {
    cards.push({
      id: 'cfo-summary',
      title: 'CFO summary data prepared',
      detail: 'Safe structured data with tool-grounded explanation.',
      href: '/app/analytics',
      label: 'Read-only',
      tone: 'default'
    });
  }

  const evidenceQuality = recordValue(data.evidenceQualityReview);
  if (evidenceQuality) {
    const needsMore = arrayValue(evidenceQuality.needs_more_evidence).length;
    const conflicts = arrayValue(evidenceQuality.conflicting_evidence).length;
    cards.push({
      id: 'evidence-quality-review',
      title: 'Evidence quality',
      value: stringValue(evidenceQuality.overall)?.replaceAll('_', ' ') ?? 'reviewed',
      detail: needsMore > 0 ? `${needsMore} evidence gap${needsMore === 1 ? '' : 's'} to resolve.` : conflicts > 0 ? `${conflicts} possible conflict${conflicts === 1 ? '' : 's'} found.` : 'Advisory review only; approvals stay human-controlled.',
      href: '/app/evidence',
      label: 'Advisory only',
      tone: needsMore + conflicts > 0 ? 'warning' : 'good'
    });
  }

  const falsePositive = recordValue(data.falsePositiveRiskCheck);
  if (falsePositive) {
    const risk = stringValue(falsePositive.riskLevel) ?? 'unknown';
    cards.push({
      id: 'false-positive-risk',
      title: 'False-positive risk',
      value: risk,
      detail: stringValue(falsePositive.recommended_next_step) ?? 'Review before approval.',
      href: '/app/findings',
      label: 'Reviewer aid',
      tone: risk === 'high' ? 'danger' : risk === 'medium' ? 'warning' : 'good'
    });
  }

  const checklist = recordValue(data.reviewerChecklist);
  if (checklist) {
    const blockers = arrayValue(checklist.blocks_customer_ready).length;
    cards.push({
      id: 'reviewer-checklist',
      title: 'Reviewer checklist',
      value: String(arrayValue(checklist.verify_before_approving).length),
      detail: blockers > 0 ? `${blockers} blocker${blockers === 1 ? '' : 's'} before customer-ready.` : 'No advisory blockers returned.',
      href: '/app/findings',
      label: 'Human approval required',
      tone: blockers > 0 ? 'warning' : 'default'
    });
  }

  const cfoSummary = recordValue(data.prepareCfoSummary);
  if (cfoSummary) {
    const customerFacing = recordValue(cfoSummary.customer_facing);
    const internal = recordValue(cfoSummary.internal_pipeline);
    const currency = stringValue(cfoSummary.currency) ?? 'USD';
    cards.push({
      id: 'phase7-cfo-summary',
      title: 'CFO summary',
      value: formatMinor(numberValue(customerFacing?.total_leakage_minor), currency),
      detail: `Internal exposure: ${formatMinor(numberValue(internal?.unapproved_exposure_minor), currency)} kept separate.`,
      href: '/app/analytics',
      label: 'Code-calculated',
      tone: 'default'
    });
  }

  const recoveryNote = recordValue(data.prepareRecoveryNote);
  if (recoveryNote) {
    cards.push({
      id: 'recovery-note-draft',
      title: 'Recovery note draft',
      detail: booleanValue(recoveryNote.auto_send) ? 'Blocked: Copilot cannot auto-send.' : 'Draft only. Human review required before external use.',
      href: '/app/findings',
      label: 'No auto-send',
      tone: 'default'
    });
  }

  return cards.slice(0, 6);
}

function citationsFromResponse(data: Record<string, unknown>, tools: string[]): CopilotCitation[] {
  const citations: CopilotCitation[] = [];
  if (tools.includes('getAnalyticsSummary') || data.getAnalyticsSummary) {
    citations.push({ label: 'Analytics', href: '/app/analytics', tone: 'approved' });
  }
  if (tools.includes('getFindings') || data.getFindings || data.getFindingDetail) {
    citations.push({ label: 'Findings', href: '/app/findings' });
  }
  if (tools.includes('checkReportReadiness') || data.checkReportReadiness) {
    citations.push({ label: 'Reports', href: '/app/reports', tone: 'warning' });
  }
  if (tools.includes('detectMissingData') || data.detectMissingData) {
    citations.push({ label: 'Uploads', href: '/app/uploads', tone: 'warning' });
  }
  if (tools.includes('evidenceQualityReview') || tools.includes('falsePositiveRiskCheck') || tools.includes('reviewerChecklist') || data.evidenceQualityReview || data.falsePositiveRiskCheck || data.reviewerChecklist) {
    citations.push({ label: 'Evidence', href: '/app/evidence', tone: 'warning' });
  }
  if (tools.includes('prepareCfoSummary') || data.prepareCfoSummary) {
    citations.push({ label: 'Analytics', href: '/app/analytics', tone: 'approved' });
  }
  if (tools.includes('prepareRecoveryNote') || data.prepareRecoveryNote) {
    citations.push({ label: 'Recovery draft', href: '/app/findings' });
  }

  const detail = recordValue(data.getFindingDetail);
  const detailCitations = arrayValue(detail?.citations).slice(0, 4);
  for (const citation of detailCitations) {
    const row = recordValue(citation);
    if (!row) continue;
    const evidenceType = stringValue(row.evidence_type) ?? 'evidence';
    citations.push({
      label: `${evidenceType.replaceAll('_', ' ')} · ${stringValue(row.approval_state) ?? 'state unknown'}`,
      href: '/app/evidence',
      tone: stringValue(row.approval_state) === 'approved' ? 'approved' : 'warning'
    });
  }

  return citations;
}

function formatMinor(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value / 100);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function toneForRisk(risk: string): CopilotActionCardData['tone'] {
  if (risk === 'critical' || risk === 'high') return 'danger';
  if (risk === 'medium') return 'warning';
  return 'default';
}
