import { createHash } from 'node:crypto';
import {
  ROOT_CAUSE_PROMPT_VERSION,
  ROOT_CAUSE_SAFETY,
  rootCauseOutputSchema,
  type RootCauseCategory,
  type RootCauseOutput,
  type RootCauseSupportingEvidence
} from './rootCauseSchema';
import { assertNoRawSourceText, assertNoSecrets, truncateSafeExcerpt } from './safety';
import { sharedAiPromptRulesText } from './promptRules';

export type RootCauseFindingContext = {
  finding: {
    id: string;
    type: string;
    outcomeType: string;
    title: string;
    summary: string;
    status: string;
    estimatedAmountMinor: number;
    currency: string;
    confidence: number;
    evidenceCoverageStatus?: string | null;
    calculation?: Record<string, unknown> | null;
  };
  approvedEvidence?: Array<{
    evidenceId: string;
    evidenceType: string;
    sourceType?: string | null;
    label?: string | null;
    approvalState?: 'approved' | string | null;
  }>;
};

export type RootCauseClassificationSource = 'gemini' | 'deterministic_fallback';

export type RootCauseClassificationResult = {
  rootCause: RootCauseOutput;
  classificationSource: RootCauseClassificationSource;
  promptVersion: typeof ROOT_CAUSE_PROMPT_VERSION;
};

export type GenerateRootCauseAiOutput = (input: {
  prompt: string;
  systemInstruction: string;
  promptVersion: typeof ROOT_CAUSE_PROMPT_VERSION;
}) => Promise<unknown>;

const rootCauseLabels: Record<RootCauseCategory, string> = {
  expired_discount_not_removed: 'Expired discount not removed',
  annual_uplift_not_configured: 'Annual uplift not configured',
  usage_overage_not_billed: 'Usage overage not billed',
  seat_count_not_synced: 'Seat count not synced',
  minimum_commitment_not_monitored: 'Minimum commitment not monitored',
  amendment_not_reflected: 'Amendment not reflected',
  contract_term_not_visible: 'Contract term not visible',
  manual_invoice_error: 'Manual invoice error',
  customer_master_data_mismatch: 'Customer master data mismatch',
  missing_usage_feed: 'Missing usage feed',
  renewal_notice_missed: 'Renewal notice missed',
  payment_terms_setup_error: 'Payment terms setup error',
  unclear_contract_language: 'Unclear contract language',
  unknown: 'Unknown'
};

const ownerSuggestions: Record<RootCauseCategory, string> = {
  expired_discount_not_removed: 'Billing operations',
  annual_uplift_not_configured: 'Revenue operations',
  usage_overage_not_billed: 'Revenue operations and data engineering',
  seat_count_not_synced: 'Customer success operations and billing operations',
  minimum_commitment_not_monitored: 'Finance operations',
  amendment_not_reflected: 'Deal desk and contract operations',
  contract_term_not_visible: 'Contract operations',
  manual_invoice_error: 'Billing operations',
  customer_master_data_mismatch: 'Revenue operations',
  missing_usage_feed: 'Data engineering',
  renewal_notice_missed: 'Customer success operations',
  payment_terms_setup_error: 'Finance operations',
  unclear_contract_language: 'Deal desk and contract operations',
  unknown: 'Finance operations'
};

const preventionRecommendations: Record<RootCauseCategory, string> = {
  expired_discount_not_removed: 'Add an automated discount-expiry control that reviews active invoices against approved discount end dates before each billing run.',
  annual_uplift_not_configured: 'Configure uplift schedules in billing operations and add a monthly exception review for contracts with approved annual uplift terms.',
  usage_overage_not_billed: 'Reconcile usage feeds against invoice quantities before invoice close and alert reviewers when billable overage usage has no matching invoice line.',
  seat_count_not_synced: 'Sync seat counts from the source-of-truth system into billing and require review when active seats exceed billed seats for the same service period.',
  minimum_commitment_not_monitored: 'Create a minimum-commitment monitor that compares billing-period invoices with approved commitment terms before revenue close.',
  amendment_not_reflected: 'Require amendment intake into the billing checklist and block close when a signed amendment is not reflected in active billing rules.',
  contract_term_not_visible: 'Add a contract-term visibility check so billing reviewers can see the governing clause, citation, and billing-period rule before reconciliation.',
  manual_invoice_error: 'Add a maker-checker review for manual invoice edits and compare final invoice lines against deterministic entitlement checks before release.',
  customer_master_data_mismatch: 'Reconcile customer identifiers across CRM, billing, contracts, and usage feeds so rows resolve to the same customer before leakage analysis.',
  missing_usage_feed: 'Add a usage-feed completeness control that flags missing or stale usage imports before overage and seat checks run.',
  renewal_notice_missed: 'Track renewal and notice dates with owner assignment and reminders before notice windows close.',
  payment_terms_setup_error: 'Compare invoice due dates and payment-term settings against approved contract terms before invoice issuance.',
  unclear_contract_language: 'Send unclear billing clauses to contract operations for clarification and standardize future clause language for deterministic billing rules.',
  unknown: 'Route the finding to finance review, capture the confirmed cause, and add the pattern to the root-cause taxonomy when it recurs.'
};

const categoryPatterns: Array<{
  category: RootCauseCategory;
  confidence: number;
  patterns: RegExp[];
}> = [
  {
    category: 'expired_discount_not_removed',
    confidence: 0.94,
    patterns: [/expired[_\s-]?discount/i, /discount[_\s-]?expiry/i, /discount.*still.*applied/i, /expired.*promo/i]
  },
  {
    category: 'annual_uplift_not_configured',
    confidence: 0.94,
    patterns: [/annual[_\s-]?uplift/i, /missed[_\s-]?uplift/i, /uplift.*not.*applied/i, /price.*increase.*missed/i]
  },
  {
    category: 'seat_count_not_synced',
    confidence: 0.92,
    patterns: [/seat[_\s-]?underbilling/i, /seat.*not.*sync/i, /billed.*seat/i, /license.*count/i, /active.*users/i]
  },
  {
    category: 'usage_overage_not_billed',
    confidence: 0.91,
    patterns: [/usage[_\s-]?overage/i, /overage.*unbilled/i, /usage.*not.*billed/i, /billable.*usage/i]
  },
  {
    category: 'minimum_commitment_not_monitored',
    confidence: 0.91,
    patterns: [/minimum[_\s-]?commitment/i, /committed.*minimum/i, /billed.*below.*minimum/i]
  },
  {
    category: 'amendment_not_reflected',
    confidence: 0.88,
    patterns: [/amendment/i, /change[_\s-]?order/i, /order[_\s-]?form.*not.*reflected/i]
  },
  {
    category: 'payment_terms_setup_error',
    confidence: 0.88,
    patterns: [/payment[_\s-]?terms/i, /due[_\s-]?date/i, /net\s?\d+/i, /terms.*mismatch/i]
  },
  {
    category: 'renewal_notice_missed',
    confidence: 0.84,
    patterns: [/renewal.*notice/i, /notice.*missed/i, /renewal[_\s-]?window/i]
  },
  {
    category: 'missing_usage_feed',
    confidence: 0.82,
    patterns: [/missing.*usage.*feed/i, /usage.*feed.*missing/i, /stale.*usage/i]
  },
  {
    category: 'customer_master_data_mismatch',
    confidence: 0.8,
    patterns: [/customer.*mismatch/i, /master.*data/i, /unassigned.*customer/i, /customer[_\s-]?id/i, /external[_\s-]?id/i]
  },
  {
    category: 'contract_term_not_visible',
    confidence: 0.78,
    patterns: [/contract.*term.*not.*visible/i, /missing.*contract.*term/i, /clause.*not.*visible/i]
  },
  {
    category: 'manual_invoice_error',
    confidence: 0.76,
    patterns: [/manual.*invoice/i, /invoice.*error/i, /manual.*adjustment/i]
  },
  {
    category: 'unclear_contract_language',
    confidence: 0.72,
    patterns: [/unclear.*contract/i, /ambiguous.*clause/i, /unclear.*language/i]
  }
];

export function parseRootCauseOutput(output: unknown): RootCauseOutput {
  const parsed = rootCauseOutputSchema.parse(output);
  assertNoSecrets(parsed);
  assertNoRawSourceText(parsed);
  return parsed;
}

export async function classifyFindingRootCause(
  context: RootCauseFindingContext,
  generateAiOutput?: GenerateRootCauseAiOutput
): Promise<RootCauseClassificationResult> {
  const deterministic = classifyRootCauseDeterministic(context);
  if (!generateAiOutput) {
    return {
      rootCause: deterministic,
      classificationSource: 'deterministic_fallback',
      promptVersion: ROOT_CAUSE_PROMPT_VERSION
    };
  }

  try {
    const output = await generateAiOutput({
      prompt: buildRootCausePrompt(context),
      systemInstruction: rootCauseSystemInstruction(),
      promptVersion: ROOT_CAUSE_PROMPT_VERSION
    });
    return {
      rootCause: normalizeAiRootCause(parseRootCauseOutput(output), deterministic),
      classificationSource: 'gemini',
      promptVersion: ROOT_CAUSE_PROMPT_VERSION
    };
  } catch {
    return {
      rootCause: {
        ...deterministic,
        caveats: [
          'Gemini was unavailable or returned invalid root-cause JSON, so deterministic classification was used.',
          ...deterministic.caveats
        ].slice(0, 8)
      },
      classificationSource: 'deterministic_fallback',
      promptVersion: ROOT_CAUSE_PROMPT_VERSION
    };
  }
}

export function classifyRootCauseDeterministic(context: RootCauseFindingContext): RootCauseOutput {
  const signals = rootCauseSignals(context);
  const primarySignals = [
    context.finding.type,
    context.finding.title,
    context.finding.summary
  ].join(' ');
  const matches = categoryPatterns
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(signals)))
    .map((rule) => ({
      ...rule,
      confidence: rule.confidence + (rule.patterns.some((pattern) => pattern.test(primarySignals)) ? 0.03 : 0)
    }))
    .sort((left, right) => right.confidence - left.confidence);
  const primary = matches[0]?.category ?? 'unknown';
  const secondary = Array.from(new Set(matches.slice(1).map((match) => match.category))).slice(0, 3);
  const confidence = matches[0]?.confidence ?? 0.35;

  return rootCauseOutputSchema.parse({
    primaryRootCause: primary,
    secondaryRootCauses: secondary,
    confidence,
    preventionRecommendation: preventionRecommendations[primary],
    operationalOwnerSuggestion: ownerSuggestions[primary],
    supportingEvidence: supportingEvidenceFor(context, primary),
    caveats: caveatsFor(context, primary),
    safety: ROOT_CAUSE_SAFETY
  });
}

export function buildRootCausePrompt(context: RootCauseFindingContext): string {
  return [
    'Classify the likely operational root cause for this LeakProof finding.',
    sharedAiPromptRulesText(),
    'Use only safe finding metadata, calculation signal names, status context, and approved evidence labels.',
    'Do not calculate or change money. Do not approve findings or evidence. Do not mark anything customer-ready.',
    'Do not include raw contract clauses, raw invoice rows, raw usage rows, customer PII, prompts, or full model output in the response.',
    'Return strict JSON matching the root-cause schema.',
    '',
    JSON.stringify(safePromptContext(context))
  ].join('\n');
}

export function rootCauseSystemInstruction(): string {
  return [
    'You are the Root Cause Classifier and Prevention Advisor for LeakProof AI.',
    'LLM explains and suggests. Code calculates. Human approves.',
    'Classify why leakage likely happened and recommend operational controls.',
    'Use deterministic finding metadata as context, but never calculate final leakage amounts.',
    'Never approve findings, approve evidence, mark findings customer-ready, export reports, send emails, or create invoices.',
    'Do not include raw source evidence, customer PII, secrets, prompts, or full model output.',
    'Set every safety boolean to false, including storesRawEvidence.',
    'Return only JSON.'
  ].join(' ');
}

export function fingerprintRootCauseInput(context: RootCauseFindingContext): string {
  return createHash('sha256').update(stableStringify(safePromptContext(context))).digest('hex');
}

export function rootCauseLabel(category: RootCauseCategory): string {
  return rootCauseLabels[category];
}

export function preventionRecommendationFor(category: RootCauseCategory): string {
  return preventionRecommendations[category];
}

export function operationalOwnerFor(category: RootCauseCategory): string {
  return ownerSuggestions[category];
}

function normalizeAiRootCause(aiOutput: RootCauseOutput, deterministic: RootCauseOutput): RootCauseOutput {
  const primary = aiOutput.primaryRootCause === 'unknown' && deterministic.primaryRootCause !== 'unknown'
    ? deterministic.primaryRootCause
    : aiOutput.primaryRootCause;
  const secondaryRootCauses = Array.from(new Set([
    ...aiOutput.secondaryRootCauses,
    deterministic.primaryRootCause
  ])).filter((category) => category !== primary && category !== 'unknown').slice(0, 5);

  return rootCauseOutputSchema.parse({
    primaryRootCause: primary,
    secondaryRootCauses,
    confidence: Math.max(Math.min(aiOutput.confidence, 1), deterministic.confidence >= 0.9 ? 0.75 : 0),
    preventionRecommendation: aiOutput.preventionRecommendation,
    operationalOwnerSuggestion: aiOutput.operationalOwnerSuggestion,
    supportingEvidence: [...deterministic.supportingEvidence, ...aiOutput.supportingEvidence].slice(0, 10),
    caveats: Array.from(new Set([
      ...aiOutput.caveats,
      'Root cause is advisory and must be confirmed by a human reviewer before process changes are treated as complete.'
    ])).slice(0, 8),
    safety: ROOT_CAUSE_SAFETY
  });
}

function rootCauseSignals(context: RootCauseFindingContext): string {
  return [
    context.finding.type,
    context.finding.title,
    context.finding.summary,
    context.finding.evidenceCoverageStatus ?? '',
    ...Object.keys(context.finding.calculation ?? {}),
    ...(context.approvedEvidence ?? []).map((item) => `${item.evidenceType} ${item.sourceType ?? ''} ${item.label ?? ''}`)
  ].join(' ');
}

function supportingEvidenceFor(
  context: RootCauseFindingContext,
  primary: RootCauseCategory
): RootCauseSupportingEvidence[] {
  const evidence: RootCauseSupportingEvidence[] = [
    {
      type: 'finding_type',
      reference: context.finding.type,
      note: `Finding type maps to ${rootCauseLabels[primary]}.`
    }
  ];

  const calculationKeys = Object.keys(context.finding.calculation ?? {});
  if (calculationKeys.length > 0) {
    evidence.push({
      type: 'calculation_signal',
      reference: calculationKeys.slice(0, 8).join(', '),
      note: 'Only calculation field names are used for classification; deterministic code remains the source of truth for money.'
    });
  }

  if (context.finding.evidenceCoverageStatus) {
    evidence.push({
      type: 'status_context',
      reference: context.finding.evidenceCoverageStatus,
      note: 'Evidence coverage status is used as review context, not as automatic approval.'
    });
  }

  for (const item of (context.approvedEvidence ?? []).slice(0, 4)) {
    evidence.push({
      type: 'evidence_reference',
      reference: truncateSafeExcerpt(item.label ?? item.evidenceType, 180) || item.evidenceType,
      note: `Approved ${item.sourceType ?? item.evidenceType} evidence label was available for reviewer context.`
    });
  }

  return evidence.slice(0, 10);
}

function caveatsFor(context: RootCauseFindingContext, primary: RootCauseCategory): string[] {
  const caveats = ['Root cause classification is advisory; a human reviewer must confirm the operational cause.'];
  if (primary === 'unknown') {
    caveats.push('No high-confidence taxonomy signal matched this finding, so finance review should capture the confirmed cause.');
  }
  if ((context.approvedEvidence ?? []).length === 0) {
    caveats.push('No approved evidence labels were available to support the root-cause explanation.');
  }
  if (context.finding.status === 'draft' || context.finding.status === 'needs_review') {
    caveats.push('This finding is still internal pipeline exposure and is not customer-facing leakage.');
  }
  return caveats.slice(0, 8);
}

function safePromptContext(context: RootCauseFindingContext) {
  return {
    finding: {
      id: context.finding.id,
      type: context.finding.type,
      outcomeType: context.finding.outcomeType,
      title: truncateSafeExcerpt(context.finding.title, 220),
      summary: truncateSafeExcerpt(context.finding.summary, 400),
      status: context.finding.status,
      currency: context.finding.currency,
      confidence: context.finding.confidence,
      evidenceCoverageStatus: context.finding.evidenceCoverageStatus ?? null,
      calculationSignalKeys: Object.keys(context.finding.calculation ?? {}).slice(0, 20)
    },
    approvedEvidence: (context.approvedEvidence ?? []).slice(0, 8).map((item) => ({
      evidenceId: item.evidenceId,
      evidenceType: item.evidenceType,
      sourceType: item.sourceType ?? null,
      label: truncateSafeExcerpt(item.label ?? item.evidenceType, 180),
      approvalState: item.approvalState ?? 'approved'
    }))
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
