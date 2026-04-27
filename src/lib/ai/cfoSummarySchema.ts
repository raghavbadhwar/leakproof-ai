import { z } from 'zod';
import type { AnalyticsPoint } from '../analytics/workspaceAnalytics';
import type { ExecutiveAuditReport } from '../evidence/report';
import { aiSafeEntityReferenceSchema, type AiSafeEntityReference } from './taskTypes';
import { safeEntityReference, truncateSafeExcerpt } from './safety';

export const CFO_SUMMARY_PROMPT_VERSION = 'cfo-summary-draft-v1';

const narrativeTextSchema = z.string().trim().min(1).max(1800);
const shortTextSchema = z.string().trim().min(1).max(500);

export const cfoSummaryDriverScopeSchema = z.enum([
  'customer_facing_leakage',
  'internal_unapproved_exposure',
  'dismissed_or_not_recoverable',
  'risk_only'
]);

export const cfoSummaryTopDriverSchema = z
  .object({
    scope: cfoSummaryDriverScopeSchema,
    label: z.string().trim().min(1).max(180),
    amountText: z.string().trim().min(1).max(120),
    findingCount: z.number().int().min(0),
    reference: z.string().trim().min(1).max(240)
  })
  .strict();

export const cfoSummaryReadinessSchema = z
  .object({
    customerFacingLeakageText: shortTextSchema,
    internalUnapprovedExposureText: shortTextSchema,
    dismissedNotRecoverableText: shortTextSchema,
    riskOnlyItemsText: shortTextSchema,
    exportable: z.boolean(),
    blockers: z.array(shortTextSchema).max(12),
    narrative: narrativeTextSchema
  })
  .strict();

export const cfoSummaryOutputSchema = z
  .object({
    executiveSummary: narrativeTextSchema,
    totalApprovedLeakageText: shortTextSchema,
    internalExposureText: shortTextSchema,
    topDrivers: z.array(cfoSummaryTopDriverSchema).max(12),
    priorityActions: z.array(shortTextSchema).min(1).max(8),
    reportReadiness: cfoSummaryReadinessSchema,
    caveats: z.array(shortTextSchema).max(12),
    humanReviewRequired: z.literal(true),
    referencedEntities: z.array(aiSafeEntityReferenceSchema).max(40).default([])
  })
  .strict();

export type CfoSummaryOutput = z.infer<typeof cfoSummaryOutputSchema>;
export type CfoSummaryDriverScope = z.infer<typeof cfoSummaryDriverScopeSchema>;
type CfoSummaryTopDriver = CfoSummaryOutput['topDrivers'][number];

export type CfoSummaryContext = {
  organizationName: string;
  workspace: {
    id: string;
    name: string;
  };
  currency: string;
  report: Pick<
    ExecutiveAuditReport,
    | 'totalPotentialLeakageMinor'
    | 'totalApprovedRecoverableMinor'
    | 'totalPreventedLeakageMinor'
    | 'totalRecoveredMinor'
    | 'totalRiskOnlyItems'
    | 'includedFindingCount'
    | 'categoryBreakdown'
    | 'customerBreakdown'
    | 'exportability'
  >;
  internalPipeline: {
    unapprovedExposureMinor: number;
    findingCount: number;
    needsReviewCount: number;
    topUnapproved: AnalyticsPoint[];
  };
  closedReview: {
    dismissedCount: number;
    notRecoverableCount: number;
  };
  riskOnly: {
    count: number;
  };
};

const currencyOrNumberPattern = /\b(?:USD|EUR|GBP|INR|CAD|AUD|\$|€|£|₹)\s?\d|[\d][\d,]*(?:\.\d+)?\b/i;

export function parseCfoSummaryOutput(output: unknown): CfoSummaryOutput {
  return cfoSummaryOutputSchema.parse(output);
}

export function buildCfoSummaryDraft(context: CfoSummaryContext, aiOutput?: unknown): CfoSummaryOutput {
  const fallback = deterministicCfoSummaryDraft(context);
  if (!aiOutput) return fallback;

  try {
    return applyCfoSummaryGuardrails(parseCfoSummaryOutput(aiOutput), context, fallback);
  } catch {
    return {
      ...fallback,
      caveats: uniqueText([
        'Gemini was unavailable or returned invalid CFO-summary JSON, so a deterministic safe summary was used.',
        ...fallback.caveats
      ])
    };
  }
}

export function applyCfoSummaryGuardrails(
  draft: CfoSummaryOutput,
  context: CfoSummaryContext,
  fallback: CfoSummaryOutput = deterministicCfoSummaryDraft(context)
): CfoSummaryOutput {
  const executiveSummary = containsCurrencyOrNumber(draft.executiveSummary)
    ? fallback.executiveSummary
    : truncateSafeExcerpt(draft.executiveSummary, 1800) || fallback.executiveSummary;

  return cfoSummaryOutputSchema.parse({
    executiveSummary,
    totalApprovedLeakageText: fallback.totalApprovedLeakageText,
    internalExposureText: fallback.internalExposureText,
    topDrivers: fallback.topDrivers,
    priorityActions: uniqueText(draft.priorityActions.length > 0 ? draft.priorityActions : fallback.priorityActions).slice(0, 8),
    reportReadiness: fallback.reportReadiness,
    caveats: uniqueText([
      ...fallback.caveats,
      ...draft.caveats.filter((item) => !containsCurrencyOrNumber(item))
    ]).slice(0, 12),
    humanReviewRequired: true,
    referencedEntities: referencedEntities(context)
  });
}

export function deterministicCfoSummaryDraft(context: CfoSummaryContext): CfoSummaryOutput {
  const reportReadyAmount = formatMinor(context.report.totalPotentialLeakageMinor, context.currency);
  const recoverableAmount = formatMinor(context.report.totalApprovedRecoverableMinor, context.currency);
  const preventedAmount = formatMinor(context.report.totalPreventedLeakageMinor, context.currency);
  const recoveredAmount = formatMinor(context.report.totalRecoveredMinor, context.currency);
  const internalAmount = formatMinor(context.internalPipeline.unapprovedExposureMinor, context.currency);
  const exportable = context.report.exportability.exportable;
  const blockers = context.report.exportability.blockers.map((blocker) => labelize(blocker));

  return cfoSummaryOutputSchema.parse({
    executiveSummary: exportable
      ? `${context.workspace.name} has ${reportReadyAmount} in customer-facing leakage backed by approved evidence and deterministic calculations. The internal pipeline remains separate at ${internalAmount} and still requires finance review before any customer use.`
      : `${context.workspace.name} is not report-ready yet. Customer-facing leakage that passes current report rules is ${reportReadyAmount}, while ${internalAmount} remains internal unapproved exposure for finance review.`,
    totalApprovedLeakageText: `Customer-facing leakage: ${reportReadyAmount} across ${context.report.includedFindingCount} report-ready finding${context.report.includedFindingCount === 1 ? '' : 's'}; recoverable ${recoverableAmount}, prevented future leakage ${preventedAmount}, recovered ${recoveredAmount}.`,
    internalExposureText: `Internal unapproved exposure: ${internalAmount} across ${context.internalPipeline.findingCount} draft or needs-review finding${context.internalPipeline.findingCount === 1 ? '' : 's'}; ${context.internalPipeline.needsReviewCount} need review.`,
    topDrivers: topDrivers(context),
    priorityActions: priorityActions(context),
    reportReadiness: {
      customerFacingLeakageText: `Customer-facing leakage is ${reportReadyAmount} and uses approved/customer-ready/recovered findings that passed evidence rules.`,
      internalUnapprovedExposureText: `Internal unapproved exposure is ${internalAmount} and must not be presented as customer-facing leakage.`,
      dismissedNotRecoverableText: `Dismissed findings: ${context.closedReview.dismissedCount}; not recoverable findings: ${context.closedReview.notRecoverableCount}. Their amounts are excluded from reports and not displayed as recovery totals.`,
      riskOnlyItemsText: `Risk-only items: ${context.riskOnly.count} report-ready item${context.riskOnly.count === 1 ? '' : 's'}, listed separately from recoverable actions without a recovery total.`,
      exportable,
      blockers,
      narrative: exportable
        ? 'The report can be reviewed for customer-facing use after a human confirms tone, audience, and final delivery.'
        : 'Resolve report blockers before using this summary externally.'
    },
    caveats: caveats(context),
    humanReviewRequired: true,
    referencedEntities: referencedEntities(context)
  });
}

export function buildCfoSummaryPrompt(context: CfoSummaryContext): string {
  return [
    'Draft a CFO summary using only the deterministic metrics below.',
    'Do not create new numbers. Do not combine customer-facing leakage with internal unapproved exposure.',
    'Keep dismissed, not recoverable, and risk-only items separate.',
    'Return strict JSON matching the configured schema.',
    '',
    JSON.stringify({
      organizationName: context.organizationName,
      workspace: context.workspace,
      deterministicTexts: {
        totalApprovedLeakageText: deterministicCfoSummaryDraft(context).totalApprovedLeakageText,
        internalExposureText: deterministicCfoSummaryDraft(context).internalExposureText,
        reportReadiness: deterministicCfoSummaryDraft(context).reportReadiness
      },
      topDrivers: topDrivers(context)
    })
  ].join('\n');
}

export function cfoSummarySystemInstruction(): string {
  return [
    'You are the Recovery Note and CFO Narrative Generator for LeakProof AI.',
    'Your role is advisory. LLM explains and suggests. Code calculates. Human approves.',
    'Draft CFO-facing narrative from deterministic analytics and report data only.',
    'Never fabricate numbers, calculate final leakage, approve findings, approve evidence, mark customer-ready, export reports, send emails, or create invoices.',
    'Always separate customer-facing leakage from internal unapproved exposure, dismissed/not recoverable items, and risk-only items.',
    'Return only JSON.'
  ].join(' ');
}

function topDrivers(context: CfoSummaryContext): CfoSummaryOutput['topDrivers'] {
  const customerDrivers = context.report.categoryBreakdown.slice(0, 4).map((item) => ({
    scope: 'customer_facing_leakage' as const,
    label: labelize(item.label),
    amountText: formatMinor(item.amountMinor, context.currency),
    findingCount: item.findingCount,
    reference: 'Customer-facing report category'
  }));
  const internalDrivers = context.internalPipeline.topUnapproved.slice(0, 4).map((item) => ({
    scope: 'internal_unapproved_exposure' as const,
    label: item.label,
    amountText: formatMinor(item.amountMinor ?? item.value, context.currency),
    findingCount: item.count ?? 1,
    reference: 'Internal pipeline finding'
  }));
  const closedDrivers: CfoSummaryTopDriver[] = [];
  if (context.closedReview.dismissedCount > 0) {
    closedDrivers.push({
      scope: 'dismissed_or_not_recoverable',
      label: 'Dismissed findings',
      amountText: 'Excluded from recovery totals',
      findingCount: context.closedReview.dismissedCount,
      reference: 'Review-closed findings'
    });
  }
  if (context.closedReview.notRecoverableCount > 0) {
    closedDrivers.push({
      scope: 'dismissed_or_not_recoverable',
      label: 'Not recoverable findings',
      amountText: 'Excluded from recovery totals',
      findingCount: context.closedReview.notRecoverableCount,
      reference: 'Review-closed findings'
    });
  }
  const riskDriver: CfoSummaryTopDriver[] = context.riskOnly.count > 0
    ? [{
        scope: 'risk_only',
        label: 'Risk-only items',
        amountText: 'Not counted as recoverable leakage',
        findingCount: context.riskOnly.count,
        reference: 'Risk-only report section'
      }]
    : [];

  return [...customerDrivers, ...internalDrivers, ...closedDrivers, ...riskDriver].slice(0, 12);
}

function priorityActions(context: CfoSummaryContext): string[] {
  const actions = [
    context.report.exportability.exportable
      ? 'Review the customer-facing report and approve final delivery tone manually.'
      : 'Resolve report blockers before any customer-facing use.',
    context.internalPipeline.findingCount > 0
      ? 'Triage draft and needs-review findings before moving them into approved customer-facing totals.'
      : null,
    context.report.exportability.excludedAfterEvidenceReviewCount > 0
      ? 'Approve missing contract, invoice, or usage evidence for status-eligible findings that were excluded from the report.'
      : null,
    context.riskOnly.count > 0
      ? 'Handle risk-only items as operational follow-up, not recoverable leakage.'
      : null
  ].filter((item): item is string => Boolean(item));

  return actions.length > 0 ? actions : ['No immediate CFO action is available until findings and evidence are reviewed.'];
}

function caveats(context: CfoSummaryContext): string[] {
  return [
    'All money is sourced from deterministic reconciliation and report data.',
    'AI did not calculate, approve, export, send, or invoice anything.',
    'Customer-facing leakage excludes draft and needs-review findings.',
    context.report.exportability.excludedAfterEvidenceReviewCount > 0
      ? `${context.report.exportability.excludedAfterEvidenceReviewCount} status-eligible finding${context.report.exportability.excludedAfterEvidenceReviewCount === 1 ? ' was' : 's were'} excluded after evidence review.`
      : null,
    context.report.exportability.blockers.length > 0
      ? `Current report blockers: ${context.report.exportability.blockers.map(labelize).join(', ')}.`
      : null
  ].filter((item): item is string => Boolean(item));
}

function referencedEntities(context: CfoSummaryContext): AiSafeEntityReference[] {
  return [
    safeEntityReference({ type: 'workspace', id: context.workspace.id, label: context.workspace.name }),
    safeEntityReference({ type: 'analytics_snapshot', id: `${context.workspace.id}:cfo-summary`, label: 'CFO summary metrics' }),
    safeEntityReference({ type: 'report', id: `${context.workspace.id}:executive-report`, label: 'Executive audit report data' })
  ];
}

function containsCurrencyOrNumber(value: string): boolean {
  return currencyOrNumberPattern.test(value);
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => truncateSafeExcerpt(value, 500)).filter(Boolean)));
}

function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' })
    .format(amountMinor / 100)
    .replace(/\u00a0/g, ' ');
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}
