import { assertHasEvidence, formatCitation } from './citations';
import type { Citation, LeakageFinding } from '../leakage/types';

export type EvidencePack = {
  findingId: string;
  title: string;
  summary: string;
  amountLabel: string;
  confidenceLabel: string;
  status: LeakageFinding['status'];
  calculationRows: Array<{ label: string; value: string }>;
  citations: Citation[];
  citationLabels: string[];
  recommendedAction: string;
  draftInternalNote: string;
  draftCustomerMessage: string;
  requiresHumanApproval: true;
};

export function generateEvidencePack(
  finding: LeakageFinding,
  context: { customerName: string; periodLabel?: string }
): EvidencePack {
  assertHasEvidence(finding.citations);

  const periodText = context.periodLabel ? ` for ${context.periodLabel}` : '';
  const amountLabel = formatMoney(finding.estimatedAmount.amountMinor, finding.estimatedAmount.currency);

  return {
    findingId: finding.id,
    title: finding.title,
    summary: `${context.customerName}${periodText}: ${finding.summary}`,
    amountLabel,
    confidenceLabel: `${Math.round(finding.confidence * 100)}%`,
    status: finding.status,
    calculationRows: Object.entries(finding.calculation).map(([label, value]) => ({
      label,
      value: String(value)
    })),
    citations: finding.citations,
    citationLabels: finding.citations.map(formatCitation),
    recommendedAction: recommendedActionFor(finding),
    draftInternalNote: `Review ${amountLabel} in potential ${finding.type.replaceAll('_', ' ')} for ${context.customerName}. Verify the cited source rows before customer outreach.`,
    draftCustomerMessage: [
      `Hi ${context.customerName},`,
      '',
      `During our regular billing reconciliation, we noticed that ${periodText.trim() || 'the latest billing period'} may not have reflected the terms in our agreement.`,
      `The current calculation shows a possible ${amountLabel} adjustment. We have attached the supporting contract and billing references for review.`,
      '',
      'Could you please confirm whether we should include this adjustment on the next invoice?'
    ].join('\n'),
    requiresHumanApproval: true
  };
}

function recommendedActionFor(finding: LeakageFinding): string {
  if (finding.status === 'approved') {
    return 'Prepare the approved invoice note or customer message for finance review.';
  }

  if (finding.status === 'customer_ready') {
    return 'Share the approved evidence report with the customer through the manual audit process.';
  }

  if (finding.status === 'needs_review') {
    return 'Resolve the flagged evidence or calculation uncertainty before approving.';
  }

  return 'Review the evidence pack and approve, dismiss, or mark the finding as needs review.';
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code'
  }).format(amountMinor / 100);
}
