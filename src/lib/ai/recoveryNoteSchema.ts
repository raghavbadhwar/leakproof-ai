import { z } from 'zod';
import { aiSafeEntityReferenceSchema, type AiSafeEntityReference } from './taskTypes';
import { safeEntityReference, truncateSafeExcerpt } from './safety';

export const RECOVERY_NOTE_PROMPT_VERSION = 'recovery-note-draft-v1';

const draftTextSchema = z.string().trim().min(1).max(1800);
const optionalDraftTextSchema = z.string().trim().max(1800).nullable();
const warningSchema = z.string().trim().min(1).max(500);

export const recoveryNoteOutputSchema = z
  .object({
    internalNote: draftTextSchema,
    customerFacingDraft: optionalDraftTextSchema,
    evidenceSummary: draftTextSchema,
    calculationSummary: draftTextSchema,
    recommendedTone: z.enum(['collaborative', 'neutral', 'firm_but_polite']),
    humanReviewRequired: z.literal(true),
    warnings: z.array(warningSchema).max(12).default([]),
    referencedEntities: z.array(aiSafeEntityReferenceSchema).max(40).default([])
  })
  .strict();

export type RecoveryNoteOutput = z.infer<typeof recoveryNoteOutputSchema>;

export type RecoveryNoteContext = {
  finding: {
    id: string;
    workspaceId: string;
    type: string;
    outcomeType: string;
    title: string;
    summary: string;
    status: string;
    estimatedAmountMinor: number;
    currency: string;
    confidence: number;
    calculation: Record<string, unknown>;
    recommendedAction?: string | null;
  };
  approvedEvidence: Array<{
    id: string;
    evidenceType: string;
    sourceType?: string;
    label: string;
    excerpt?: string | null;
  }>;
  includeCustomerFacingDraft: boolean;
  customerName?: string | null;
};

const forbiddenRecoveryLanguage = [
  /\blawsuit\b/i,
  /\bsue\b/i,
  /\blegal action\b/i,
  /\bcourt\b/i,
  /\battorney\b/i,
  /\bcounsel\b/i,
  /\bbreach of contract\b/i,
  /\byou are in breach\b/i,
  /\bfraud\b/i,
  /\bdamages\b/i,
  /\bpenalt(?:y|ies)\b/i,
  /\bcollections?\b/i,
  /\bliable\b/i,
  /\bdefault\b/i,
  /\bthreat\b/i,
  /\bmust pay\b/i,
  /\bimmediate payment\b/i
] as const;

export function parseRecoveryNoteOutput(output: unknown): RecoveryNoteOutput {
  return recoveryNoteOutputSchema.parse(output);
}

export function buildRecoveryNoteDraft(context: RecoveryNoteContext, aiOutput?: unknown): RecoveryNoteOutput {
  const fallback = deterministicRecoveryNoteDraft(context);
  if (!aiOutput) return fallback;

  try {
    return applyRecoveryNoteGuardrails(parseRecoveryNoteOutput(aiOutput), context, fallback);
  } catch {
    return {
      ...fallback,
      warnings: uniqueWarnings([
        'Gemini was unavailable or returned invalid recovery-note JSON, so a deterministic safe draft was used.',
        ...fallback.warnings
      ])
    };
  }
}

export function applyRecoveryNoteGuardrails(
  draft: RecoveryNoteOutput,
  context: RecoveryNoteContext,
  fallback: RecoveryNoteOutput = deterministicRecoveryNoteDraft(context)
): RecoveryNoteOutput {
  const warnings = [...draft.warnings];
  const internalNote = safeDraftText(draft.internalNote, fallback.internalNote, warnings);
  let customerFacingDraft = context.includeCustomerFacingDraft
    ? safeDraftText(draft.customerFacingDraft, fallback.customerFacingDraft, warnings)
    : null;

  if (!context.includeCustomerFacingDraft && draft.customerFacingDraft) {
    warnings.push('Customer-facing draft was removed because this finding is not ready for external use.');
  }

  if (customerFacingDraft && containsForbiddenRecoveryLanguage(customerFacingDraft)) {
    customerFacingDraft = fallback.customerFacingDraft;
    warnings.push('Customer-facing draft was replaced because it contained aggressive or legal language.');
  }

  return recoveryNoteOutputSchema.parse({
    internalNote,
    customerFacingDraft,
    evidenceSummary: safeDraftText(draft.evidenceSummary, fallback.evidenceSummary, warnings),
    calculationSummary: calculationSummary(context),
    recommendedTone: draft.recommendedTone,
    humanReviewRequired: true,
    warnings: uniqueWarnings([
      ...warnings,
      'Draft only. No email was sent, no invoice was created, and no report was exported.'
    ]),
    referencedEntities: referencedEntities(context)
  });
}

export function deterministicRecoveryNoteDraft(context: RecoveryNoteContext): RecoveryNoteOutput {
  const amountText = formatMinor(context.finding.estimatedAmountMinor, context.finding.currency);
  const findingType = labelize(context.finding.type);
  const evidenceSummaryText = evidenceSummary(context);
  const calculationSummaryText = calculationSummary(context);
  const recommendedAction =
    context.finding.recommendedAction ??
    'Review the approved evidence and decide the appropriate recovery or correction path.';
  const internalNote = [
    `Internal recovery review for ${context.finding.title}: ${amountText} is the stored deterministic amount for ${findingType}.`,
    evidenceSummaryText,
    calculationSummaryText,
    `Recommended reviewer action: ${recommendedAction}`,
    'Human review is required before any customer communication, invoice change, or report use.'
  ].join(' ');

  const customerFacingDraft = context.includeCustomerFacingDraft
    ? [
        'Hi,',
        '',
        `During our billing reconciliation, we noticed a possible ${amountText} adjustment related to ${findingType}.`,
        `${evidenceSummaryText} ${calculationSummaryText}`,
        'Could you please review the referenced materials and confirm the appropriate correction path?'
      ].join('\n')
    : null;

  return recoveryNoteOutputSchema.parse({
    internalNote,
    customerFacingDraft,
    evidenceSummary: evidenceSummaryText,
    calculationSummary: calculationSummaryText,
    recommendedTone: 'collaborative',
    humanReviewRequired: true,
    warnings: [
      'Draft only. No email was sent, no invoice was created, and no report was exported.',
      ...(context.includeCustomerFacingDraft ? [] : ['Customer-facing draft is disabled until the finding and approved evidence are ready.'])
    ],
    referencedEntities: referencedEntities(context)
  });
}

export function buildRecoveryNotePrompt(context: RecoveryNoteContext): string {
  return [
    'Draft a LeakProof recovery note from the provided safe references only.',
    'Use the deterministic finding amount and calculation summary exactly; do not calculate or infer money.',
    'Use polite reconciliation language. Do not make legal threats, legal conclusions, accusations, or demands.',
    'Return strict JSON matching the configured schema.',
    '',
    JSON.stringify({
      finding: {
        id: context.finding.id,
        type: context.finding.type,
        outcomeType: context.finding.outcomeType,
        title: context.finding.title,
        summary: truncateSafeExcerpt(context.finding.summary, 500),
        status: context.finding.status,
        deterministicAmount: formatMinor(context.finding.estimatedAmountMinor, context.finding.currency),
        calculationSummary: calculationSummary(context),
        recommendedAction: truncateSafeExcerpt(context.finding.recommendedAction ?? '', 300)
      },
      approvedEvidence: context.approvedEvidence.map((item) => ({
        id: item.id,
        evidenceType: item.evidenceType,
        sourceType: item.sourceType,
        label: item.label,
        excerpt: truncateSafeExcerpt(item.excerpt ?? '', 300)
      })),
      includeCustomerFacingDraft: context.includeCustomerFacingDraft
    })
  ].join('\n');
}

export function recoveryNoteSystemInstruction(): string {
  return [
    'You are the Recovery Note and CFO Narrative Generator for LeakProof AI.',
    'Your role is advisory. LLM explains and suggests. Code calculates. Human approves.',
    'Draft internal and customer-facing recovery language for human review only.',
    'Never calculate amounts, change amounts, approve findings, approve evidence, mark customer-ready, send email, create invoices, or export reports.',
    'Do not use aggressive legal language, threats, legal conclusions, accusations, or jurisdiction-specific legal advice.',
    'Use only provided contract, invoice, usage, finding, and calculation references.',
    'Set humanReviewRequired=true and return only JSON.'
  ].join(' ');
}

export function containsForbiddenRecoveryLanguage(value: string | null | undefined): boolean {
  if (!value) return false;
  return forbiddenRecoveryLanguage.some((pattern) => pattern.test(value));
}

function safeDraftText(value: string | null | undefined, fallback: string | null, warnings: string[]): string;
function safeDraftText(value: string | null | undefined, fallback: null, warnings: string[]): string | null;
function safeDraftText(value: string | null | undefined, fallback: string | null, warnings: string[]): string | null {
  const normalized = truncateSafeExcerpt(value ?? '', 1800);
  if (!normalized) return fallback;
  if (containsForbiddenRecoveryLanguage(normalized)) {
    warnings.push('Draft text containing aggressive or legal language was replaced with a safe fallback.');
    return fallback;
  }
  return normalized;
}

function evidenceSummary(context: RecoveryNoteContext): string {
  if (context.approvedEvidence.length === 0) {
    return 'No approved evidence references are available for customer-facing use yet.';
  }

  const contractLabels = context.approvedEvidence
    .filter((item) => item.sourceType === 'contract' || item.evidenceType === 'contract_term')
    .map((item) => item.label);
  const invoiceUsageLabels = context.approvedEvidence
    .filter((item) => ['invoice', 'usage'].includes(item.sourceType ?? '') || ['invoice_row', 'usage_row'].includes(item.evidenceType))
    .map((item) => item.label);
  const parts = [
    contractLabels.length > 0 ? `Contract reference: ${contractLabels.slice(0, 3).join('; ')}.` : null,
    invoiceUsageLabels.length > 0 ? `Invoice or usage reference: ${invoiceUsageLabels.slice(0, 3).join('; ')}.` : null
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(' ') : `Approved evidence references: ${context.approvedEvidence.map((item) => item.label).slice(0, 4).join('; ')}.`;
}

function calculationSummary(context: RecoveryNoteContext): string {
  const formula = typeof context.finding.calculation.formula === 'string' && context.finding.calculation.formula.trim()
    ? context.finding.calculation.formula.trim()
    : 'stored reconciliation formula';
  return `Calculation uses the existing ${formula} output and the stored deterministic amount of ${formatMinor(context.finding.estimatedAmountMinor, context.finding.currency)}. AI did not calculate or change this amount.`;
}

function referencedEntities(context: RecoveryNoteContext): AiSafeEntityReference[] {
  return [
    safeEntityReference({ type: 'workspace', id: context.finding.workspaceId }),
    safeEntityReference({ type: 'finding', id: context.finding.id, label: context.finding.title }),
    ...context.approvedEvidence.map((item) =>
      safeEntityReference({
        type: 'evidence_item',
        id: item.id,
        label: item.label
      })
    )
  ].slice(0, 40);
}

function formatMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' })
    .format(amountMinor / 100)
    .replace(/\u00a0/g, ' ');
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function uniqueWarnings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => truncateSafeExcerpt(value, 500)).filter(Boolean))).slice(0, 12);
}
