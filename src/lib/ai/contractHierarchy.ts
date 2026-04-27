import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertNoRawSourceText, assertNoSecrets, redactSensitiveAiInput, truncateSafeExcerpt } from './safety';

export const CONTRACT_HIERARCHY_PROMPT_VERSION = 'contract-hierarchy-resolution-v1';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO date format YYYY-MM-DD.');
const shortTextSchema = z.string().trim().min(1).max(1200);
const optionalShortTextSchema = z.string().trim().max(500).optional();
const confidenceSchema = z.number().min(0).max(1);

export const contractDocumentRoleSchema = z.enum([
  'master_agreement',
  'order_form',
  'renewal_order',
  'amendment',
  'statement_of_work',
  'side_letter',
  'pricing_schedule',
  'discount_approval',
  'unknown'
]);

export const contractRelationshipTypeSchema = z.enum([
  'supersedes',
  'amends',
  'renews',
  'incorporates',
  'references',
  'conflicts_with'
]);

export type ContractDocumentRole = z.infer<typeof contractDocumentRoleSchema>;
export type ContractRelationshipType = z.infer<typeof contractRelationshipTypeSchema>;

export type ContractHierarchyDocument = {
  id: string;
  customerId?: string | null;
  documentType: string;
  safeLabel: string;
  createdAt?: string | null;
  roleHint?: ContractDocumentRole | null;
  fileNameHint?: string | null;
};

export type ContractHierarchyTerm = {
  id: string;
  customerId?: string | null;
  sourceDocumentId: string;
  termType: string;
  value: unknown;
  citation?: {
    label?: string | null;
    excerpt?: string | null;
  } | null;
  confidence: number;
  reviewStatus: 'extracted' | 'approved' | 'edited' | 'needs_review' | 'rejected' | string;
};

export type ContractHierarchyInput = {
  customerId: string;
  documents: ContractHierarchyDocument[];
  terms: ContractHierarchyTerm[];
  citations?: Array<{
    sourceDocumentId: string;
    label?: string | null;
    excerpt?: string | null;
  }>;
  generatedAt?: string;
};

const hierarchyCitationSchema = z
  .object({
    sourceDocumentId: z.string().trim().min(1),
    label: z.string().trim().min(1).max(180),
    excerpt: optionalShortTextSchema
  })
  .strict();

export const contractDocumentClassificationSchema = z
  .object({
    sourceDocumentId: z.string().trim().min(1),
    role: contractDocumentRoleSchema,
    confidence: confidenceSchema,
    citation: hierarchyCitationSchema.optional(),
    reason: shortTextSchema
  })
  .strict();

export const contractDocumentRelationshipSchema = z
  .object({
    sourceDocumentId: z.string().trim().min(1),
    relatedSourceDocumentId: z.string().trim().min(1),
    relationshipType: contractRelationshipTypeSchema,
    effectiveDate: isoDateSchema.optional(),
    confidence: confidenceSchema,
    citation: hierarchyCitationSchema.optional(),
    reason: shortTextSchema
  })
  .strict();

export const controllingTermSchema = z
  .object({
    termType: z.string().trim().min(1).max(120),
    controllingTermId: z.string().trim().min(1),
    sourceDocumentId: z.string().trim().min(1),
    documentRole: contractDocumentRoleSchema,
    supersededTermIds: z.array(z.string().trim().min(1)).max(30).default([]),
    reason: shortTextSchema,
    confidence: confidenceSchema,
    needsReview: z.boolean(),
    citation: hierarchyCitationSchema.optional()
  })
  .strict();

export const supersededTermSchema = z
  .object({
    termId: z.string().trim().min(1),
    supersededByTermId: z.string().trim().min(1),
    termType: z.string().trim().min(1).max(120),
    relationshipType: contractRelationshipTypeSchema,
    reason: shortTextSchema,
    confidence: confidenceSchema,
    citation: hierarchyCitationSchema.optional()
  })
  .strict();

export const hierarchyConflictSchema = z
  .object({
    termType: z.string().trim().min(1).max(120),
    termIds: z.array(z.string().trim().min(1)).min(2).max(30),
    recommendedTermId: z.string().trim().min(1).optional(),
    risk: z.enum(['amendment_conflict', 'unresolved_conflict']),
    reason: shortTextSchema,
    needsReview: z.literal(true),
    citation: hierarchyCitationSchema.optional()
  })
  .strict();

export const hierarchyUnresolvedItemSchema = z
  .object({
    kind: z.enum(['missing_effective_date', 'ambiguous_precedence', 'unsupported_relationship', 'no_controlling_term']),
    termType: z.string().trim().min(1).max(120).optional(),
    documentIds: z.array(z.string().trim().min(1)).max(20).default([]),
    termIds: z.array(z.string().trim().min(1)).max(30).default([]),
    reviewerAction: shortTextSchema
  })
  .strict();

export const contractHierarchySafetySchema = z
  .object({
    canApproveTerms: z.literal(false),
    canChangeApprovedTerms: z.literal(false),
    canCreateLeakageFinding: z.literal(false),
    canCalculateLeakage: z.literal(false),
    canExportReport: z.literal(false)
  })
  .strict();

export const contractHierarchyResolutionSchema = z
  .object({
    taskType: z.literal('contract_hierarchy_resolution'),
    status: z.enum(['completed', 'partial', 'needs_review']),
    customerId: z.string().trim().min(1),
    documentRoles: z.array(contractDocumentClassificationSchema).max(80),
    relationships: z.array(contractDocumentRelationshipSchema).max(120),
    controllingTerms: z.array(controllingTermSchema).max(120),
    supersededTerms: z.array(supersededTermSchema).max(120),
    conflicts: z.array(hierarchyConflictSchema).max(80),
    unresolvedItems: z.array(hierarchyUnresolvedItemSchema).max(80),
    reviewerChecklist: z.array(shortTextSchema).min(1).max(16),
    warnings: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    safety: contractHierarchySafetySchema,
    generatedAt: z.string().datetime()
  })
  .strict();

export type ContractHierarchyResolution = z.infer<typeof contractHierarchyResolutionSchema>;
export type ContractDocumentClassification = z.infer<typeof contractDocumentClassificationSchema>;
export type ContractDocumentRelationship = z.infer<typeof contractDocumentRelationshipSchema>;
export type ContractHierarchyConflict = z.infer<typeof hierarchyConflictSchema>;

export type GenerateContractHierarchyAiOutput = (input: {
  prompt: string;
  systemInstruction: string;
  promptVersion: string;
}) => Promise<unknown>;

const rolePrecedence: Record<ContractDocumentRole, number> = {
  unknown: 0,
  master_agreement: 10,
  statement_of_work: 20,
  pricing_schedule: 30,
  side_letter: 40,
  order_form: 50,
  renewal_order: 60,
  discount_approval: 65,
  amendment: 70
};

const humanSafety = {
  canApproveTerms: false,
  canChangeApprovedTerms: false,
  canCreateLeakageFinding: false,
  canCalculateLeakage: false,
  canExportReport: false
} as const;

export async function resolveContractHierarchy(
  input: ContractHierarchyInput,
  generateAiOutput?: GenerateContractHierarchyAiOutput
): Promise<ContractHierarchyResolution> {
  const deterministic = resolveContractHierarchyDeterministic(input);
  if (!generateAiOutput) return deterministic;

  try {
    const rawOutput = await generateAiOutput({
      prompt: buildContractHierarchyPrompt(input),
      systemInstruction: contractHierarchySystemInstruction(),
      promptVersion: CONTRACT_HIERARCHY_PROMPT_VERSION
    });
    const aiResolution = parseContractHierarchyAiOutput(rawOutput);
    return mergeAiHierarchyResolution(input, deterministic, aiResolution);
  } catch {
    return contractHierarchyResolutionSchema.parse({
      ...deterministic,
      status: deterministic.unresolvedItems.length > 0 || deterministic.conflicts.length > 0 ? 'needs_review' : 'partial',
      warnings: [
        'Gemini was unavailable or returned invalid hierarchy JSON, so deterministic hierarchy checks were used.',
        ...deterministic.warnings
      ].slice(0, 12)
    });
  }
}

export function parseContractHierarchyAiOutput(output: unknown): ContractHierarchyResolution {
  const parsed = contractHierarchyResolutionSchema.parse(output);
  assertNoSecrets(parsed);
  return parsed;
}

export function resolveContractHierarchyDeterministic(input: ContractHierarchyInput): ContractHierarchyResolution {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const documentRoles = input.documents.map((document) => classifyDocument(document));
  const roleByDocumentId = new Map(documentRoles.map((classification) => [classification.sourceDocumentId, classification.role]));
  const activeTerms = input.terms.filter((term) => term.reviewStatus !== 'rejected');
  const termsByType = groupBy(activeTerms, (term) => term.termType);
  const controllingTerms: ContractHierarchyResolution['controllingTerms'] = [];
  const supersededTerms: ContractHierarchyResolution['supersededTerms'] = [];
  const conflicts: ContractHierarchyResolution['conflicts'] = [];
  const unresolvedItems: ContractHierarchyResolution['unresolvedItems'] = [];

  for (const [termType, termGroup] of termsByType.entries()) {
    const selected = selectControllingHierarchyTerm(termGroup, roleByDocumentId);
    const hasConflict = distinctValueFingerprints(termGroup).size > 1;

    if (selected) {
      const supersededTermIds = termGroup.filter((term) => term.id !== selected.term.id).map((term) => term.id);
      controllingTerms.push({
        termType,
        controllingTermId: selected.term.id,
        sourceDocumentId: selected.term.sourceDocumentId,
        documentRole: roleByDocumentId.get(selected.term.sourceDocumentId) ?? 'unknown',
        supersededTermIds,
        reason: selected.reason,
        confidence: selected.confidence,
        needsReview: hasConflict || selected.term.reviewStatus === 'needs_review' || selected.term.reviewStatus === 'extracted',
        citation: citationForTerm(selected.term)
      });

      for (const termId of supersededTermIds) {
        supersededTerms.push({
          termId,
          supersededByTermId: selected.term.id,
          termType,
          relationshipType: hasConflict ? 'supersedes' : 'references',
          reason: hasConflict
            ? 'A later or higher-precedence source appears to control this term, but a reviewer must confirm before use.'
            : 'Duplicate or lower-precedence supporting term.',
          confidence: selected.confidence,
          citation: citationForTerm(selected.term)
        });
      }
    } else if (termGroup.length > 1) {
      unresolvedItems.push({
        kind: 'ambiguous_precedence',
        termType,
        documentIds: unique(termGroup.map((term) => term.sourceDocumentId)),
        termIds: termGroup.map((term) => term.id),
        reviewerAction: `Review the ${termType.replaceAll('_', ' ')} terms and decide which document controls before using this term in reconciliation.`
      });
    }

    if (hasConflict) {
      conflicts.push({
        termType,
        termIds: termGroup.map((term) => term.id),
        recommendedTermId: selected?.term.id,
        risk: selected ? 'amendment_conflict' : 'unresolved_conflict',
        reason: selected
          ? `Multiple ${termType.replaceAll('_', ' ')} values exist. LeakProof recommends the higher-precedence term for review but does not update approved terms automatically.`
          : `Multiple ${termType.replaceAll('_', ' ')} values exist without a clear controlling source.`,
        needsReview: true,
        citation: selected ? citationForTerm(selected.term) : citationForTerm(termGroup[0])
      });
    }
  }

  const relationships = relationshipsFromSupersededTerms(input, supersededTerms);
  const reviewerChecklist = buildReviewerChecklist(conflicts, unresolvedItems);

  return contractHierarchyResolutionSchema.parse({
    taskType: 'contract_hierarchy_resolution',
    status: conflicts.length > 0 || unresolvedItems.length > 0 ? 'needs_review' : 'completed',
    customerId: input.customerId,
    documentRoles,
    relationships,
    controllingTerms,
    supersededTerms,
    conflicts,
    unresolvedItems,
    reviewerChecklist,
    warnings: [],
    safety: humanSafety,
    generatedAt
  });
}

export function buildContractHierarchyPrompt(input: ContractHierarchyInput): string {
  const promptPayload = {
    task: 'contract_hierarchy_resolution',
    principle: 'LLM explains and suggests. Code calculates. Human approves.',
    customer: {
      id: input.customerId
    },
    documents: input.documents.map((document, index) => ({
      sourceDocumentId: document.id,
      label: document.safeLabel || `Contract document ${index + 1}`,
      documentType: document.documentType,
      createdAt: document.createdAt ?? null,
      roleHint: document.roleHint ?? null
    })),
    extractedTerms: input.terms.map((term) => ({
      termId: term.id,
      sourceDocumentId: term.sourceDocumentId,
      termType: term.termType,
      valueFingerprint: valueFingerprint(term.value),
      valueSummary: summarizeTermValue(term.value),
      reviewStatus: term.reviewStatus,
      confidence: clampConfidence(term.confidence),
      citation: {
        label: truncateSafeExcerpt(term.citation?.label ?? 'Source citation', 180),
        excerpt: truncateSafeExcerpt(term.citation?.excerpt ?? '', 500)
      }
    }))
  };
  const safePayload = redactSensitiveAiInput(promptPayload);
  assertNoSecrets(safePayload);
  return [
    'Resolve the advisory contract hierarchy from safe extracted term references only.',
    'Do not approve, reject, edit, or replace any term. Do not calculate leakage.',
    JSON.stringify(safePayload)
  ].join('\n');
}

export function contractHierarchySystemInstruction(): string {
  return [
    'You are the Contract Hierarchy and Amendment Resolver for LeakProof AI.',
    'Classify each source contract document as master_agreement, order_form, renewal_order, amendment, statement_of_work, side_letter, pricing_schedule, discount_approval, or unknown.',
    'Suggest relationships between documents using supersedes, amends, renews, incorporates, references, or conflicts_with.',
    'Suggest which extracted term appears controlling when documents conflict, but never approve terms, evidence, findings, reports, emails, or invoices.',
    'Never calculate leakage amounts. Existing deterministic reconciliation output is the source of truth for money.',
    'Use only the provided document IDs, extracted term IDs, term summaries, dates, and citations. Do not invent contract terms or financial values.',
    'If effective dates or relationships are unclear, add unresolvedItems and reviewerChecklist entries.',
    'Set safety.canApproveTerms=false, safety.canChangeApprovedTerms=false, safety.canCreateLeakageFinding=false, safety.canCalculateLeakage=false, and safety.canExportReport=false.',
    'Return only strict JSON matching the configured schema.'
  ].join(' ');
}

export function buildContractHierarchyAuditSummary(input: {
  customerId: string;
  documentCount: number;
  termCount: number;
  resolution: Pick<ContractHierarchyResolution, 'relationships' | 'conflicts' | 'unresolvedItems' | 'status'>;
}): Record<string, unknown> {
  const metadata = {
    task_type: 'contract_hierarchy_resolution',
    customer_id: input.customerId,
    document_count: input.documentCount,
    term_count: input.termCount,
    relationship_count: input.resolution.relationships.length,
    conflict_count: input.resolution.conflicts.length,
    unresolved_count: input.resolution.unresolvedItems.length,
    status: input.resolution.status,
    safety_flags: ['schema_validated', 'human_approval_required', 'code_calculates_money', 'advisory_only']
  };
  assertNoRawSourceText(metadata);
  assertNoSecrets(metadata);
  return metadata;
}

function mergeAiHierarchyResolution(
  input: ContractHierarchyInput,
  deterministic: ContractHierarchyResolution,
  aiResolution: ContractHierarchyResolution
): ContractHierarchyResolution {
  const documentIds = new Set(input.documents.map((document) => document.id));
  const termIds = new Set(input.terms.map((term) => term.id));
  const deterministicRoleByDocumentId = new Map(deterministic.documentRoles.map((role) => [role.sourceDocumentId, role]));
  const aiRoles = aiResolution.documentRoles.filter((role) => documentIds.has(role.sourceDocumentId));
  const roleByDocumentId = new Map(aiRoles.map((role) => [role.sourceDocumentId, role]));

  for (const documentRole of deterministic.documentRoles) {
    if (!roleByDocumentId.has(documentRole.sourceDocumentId)) {
      roleByDocumentId.set(documentRole.sourceDocumentId, documentRole);
    }
  }

  const aiRelationships = aiResolution.relationships.filter(
    (relationship) =>
      documentIds.has(relationship.sourceDocumentId) &&
      documentIds.has(relationship.relatedSourceDocumentId) &&
      relationship.sourceDocumentId !== relationship.relatedSourceDocumentId
  );
  const relationships = dedupeRelationships([...aiRelationships, ...deterministic.relationships]);
  const aiConflicts = aiResolution.conflicts.filter((conflict) => conflict.termIds.every((termId) => termIds.has(termId)));
  const aiUnresolvedItems = aiResolution.unresolvedItems.filter((item) => item.termIds.every((termId) => termIds.has(termId)));
  const warnings = [...aiResolution.warnings];

  for (const aiTerm of aiResolution.controllingTerms) {
    const deterministicTerm = deterministic.controllingTerms.find((term) => term.termType === aiTerm.termType);
    if (deterministicTerm && deterministicTerm.controllingTermId !== aiTerm.controllingTermId) {
      warnings.push(`Gemini recommended a different ${aiTerm.termType} controller; deterministic guardrails kept the safer review recommendation.`);
    }
  }

  return contractHierarchyResolutionSchema.parse({
    ...deterministic,
    status: deterministic.conflicts.length > 0 || deterministic.unresolvedItems.length > 0 || aiConflicts.length > 0 || aiUnresolvedItems.length > 0
      ? 'needs_review'
      : deterministic.status,
    documentRoles: Array.from(roleByDocumentId.values()).map((role) => {
      const deterministicRole = deterministicRoleByDocumentId.get(role.sourceDocumentId);
      return deterministicRole?.role !== 'unknown' && role.role === 'unknown' ? deterministicRole : role;
    }),
    relationships,
    conflicts: dedupeConflicts([...deterministic.conflicts, ...aiConflicts]),
    unresolvedItems: [...deterministic.unresolvedItems, ...aiUnresolvedItems].slice(0, 80),
    reviewerChecklist: unique([...deterministic.reviewerChecklist, ...aiResolution.reviewerChecklist]).slice(0, 16),
    warnings: unique(warnings).slice(0, 12),
    safety: humanSafety,
    generatedAt: deterministic.generatedAt
  });
}

function classifyDocument(document: ContractHierarchyDocument): ContractDocumentClassification {
  const hinted = document.roleHint ? contractDocumentRoleSchema.catch('unknown').parse(document.roleHint) : null;
  const role = hinted ?? inferDocumentRole([document.fileNameHint, document.safeLabel, document.documentType].filter(Boolean).join(' '));
  return {
    sourceDocumentId: document.id,
    role,
    confidence: role === 'unknown' ? 0.45 : hinted ? 0.9 : 0.7,
    reason: role === 'unknown'
      ? 'No clear hierarchy role was detected from safe document metadata.'
      : `Document metadata suggests ${role.replaceAll('_', ' ')}.`
  };
}

function inferDocumentRole(value: string): ContractDocumentRole {
  const normalized = value.toLowerCase();
  if (/renewal|extension order|renew order/.test(normalized)) return 'renewal_order';
  if (/amend|addendum|change order/.test(normalized)) return 'amendment';
  if (/side letter/.test(normalized)) return 'side_letter';
  if (/statement of work|\bsow\b/.test(normalized)) return 'statement_of_work';
  if (/pricing schedule|price schedule|rate card|price list/.test(normalized)) return 'pricing_schedule';
  if (/discount|promo|promotion|approval/.test(normalized)) return 'discount_approval';
  if (/order form|order agreement|subscription order/.test(normalized)) return 'order_form';
  if (/master|msa|main agreement|services agreement/.test(normalized)) return 'master_agreement';
  return 'unknown';
}

function selectControllingHierarchyTerm(
  terms: ContractHierarchyTerm[],
  roleByDocumentId: Map<string, ContractDocumentRole>
): { term: ContractHierarchyTerm; reason: string; confidence: number } | null {
  if (terms.length === 0) return null;
  if (terms.length === 1) {
    const term = terms[0];
    if (!term) return null;
    return {
      term,
      reason: 'Only one active term of this type exists for this customer.',
      confidence: clampConfidence(term.confidence)
    };
  }

  const distinctValues = distinctValueFingerprints(terms);
  const ranked = terms
    .map((term) => {
      const role = roleByDocumentId.get(term.sourceDocumentId) ?? 'unknown';
      const effectiveDate = effectiveDateForTerm(term);
      return {
        term,
        role,
        roleRank: rolePrecedence[role],
        effectiveDate,
        effectiveTime: effectiveDate ? Date.parse(`${effectiveDate}T00:00:00Z`) : null,
        confidence: clampConfidence(term.confidence)
      };
    })
    .sort((left, right) =>
      right.roleRank - left.roleRank ||
      (right.effectiveTime ?? -1) - (left.effectiveTime ?? -1) ||
      right.confidence - left.confidence ||
      left.term.id.localeCompare(right.term.id)
    );

  const top = ranked[0];
  const second = ranked[1];
  if (!top || !second) return top ? { term: top.term, reason: 'Only one ranked term exists.', confidence: top.confidence } : null;
  if (distinctValues.size === 1) {
    return {
      term: top.term,
      reason: 'All active terms of this type carry the same normalized value; the highest-precedence source is listed for review.',
      confidence: Math.min(top.confidence, 0.9)
    };
  }

  const hasClearRolePrecedence = top.roleRank > second.roleRank && top.roleRank > 0;
  const hasClearLaterDate =
    top.effectiveTime !== null &&
    (second.effectiveTime === null || top.effectiveTime > second.effectiveTime) &&
    (top.roleRank >= second.roleRank || top.roleRank > 0);

  if (!hasClearRolePrecedence && !hasClearLaterDate) return null;

  return {
    term: top.term,
    reason: hasClearRolePrecedence
      ? `The ${top.role.replaceAll('_', ' ')} source has higher contract hierarchy precedence.`
      : `The term has the latest effective date (${top.effectiveDate}) among conflicting values.`,
    confidence: Math.min(top.confidence, hasClearRolePrecedence ? 0.86 : 0.82)
  };
}

function relationshipsFromSupersededTerms(
  input: ContractHierarchyInput,
  supersededTerms: ContractHierarchyResolution['supersededTerms']
): ContractHierarchyResolution['relationships'] {
  const termById = new Map(input.terms.map((term) => [term.id, term]));
  const relationships: ContractHierarchyResolution['relationships'] = [];
  for (const superseded of supersededTerms) {
    const term = termById.get(superseded.termId);
    const controllingTerm = termById.get(superseded.supersededByTermId);
    if (!term || !controllingTerm || term.sourceDocumentId === controllingTerm.sourceDocumentId) continue;
    relationships.push({
      sourceDocumentId: controllingTerm.sourceDocumentId,
      relatedSourceDocumentId: term.sourceDocumentId,
      relationshipType: superseded.relationshipType,
      effectiveDate: effectiveDateForTerm(controllingTerm) ?? undefined,
      confidence: superseded.confidence,
      citation: citationForTerm(controllingTerm),
      reason: superseded.reason
    });
  }
  return dedupeRelationships(relationships);
}

function buildReviewerChecklist(
  conflicts: ContractHierarchyResolution['conflicts'],
  unresolvedItems: ContractHierarchyResolution['unresolvedItems']
): string[] {
  const checklist = [
    'Confirm every document belongs to the same customer account before accepting the hierarchy.',
    'Compare effective dates and supersession language before changing any approved term.',
    'Keep conflicting terms in review until a human decides which document controls.'
  ];
  if (conflicts.length > 0) {
    checklist.push('Review each conflict before running or trusting reconciliation results for that term type.');
  }
  if (unresolvedItems.length > 0) {
    checklist.push('Resolve unresolved hierarchy items before marking related findings customer-ready.');
  }
  checklist.push('Do not export reports or customer messages from hierarchy suggestions alone.');
  return unique(checklist).slice(0, 16);
}

function citationForTerm(term: ContractHierarchyTerm): z.infer<typeof hierarchyCitationSchema> | undefined {
  const label = truncateSafeExcerpt(term.citation?.label ?? '', 180);
  if (!label) return undefined;
  const excerpt = truncateSafeExcerpt(term.citation?.excerpt ?? '', 500);
  return {
    sourceDocumentId: term.sourceDocumentId,
    label,
    ...(excerpt ? { excerpt } : {})
  };
}

function effectiveDateForTerm(term: ContractHierarchyTerm): string | null {
  if (term.termType === 'contract_start_date') {
    const date = readStringField(term.value, 'date');
    return isIsoDate(date) ? date : null;
  }
  return firstIsoDate(
    readStringField(term.value, 'effectiveDate'),
    readStringField(term.value, 'effective_date'),
    readStringField(term.value, 'startsAt'),
    readStringField(term.value, 'startDate'),
    readStringField(term.value, 'validFrom')
  );
}

function summarizeTermValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncateSafeExcerpt(value, 180);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 10).map(summarizeTermValue);
  if (!isRecord(value)) return null;

  const allowedKeys = [
    'amountMinor',
    'currency',
    'period',
    'frequency',
    'billingFrequency',
    'metricName',
    'quantity',
    'percent',
    'date',
    'days',
    'dueDays',
    'effectiveDate',
    'effective_date',
    'supersedes',
    'text'
  ];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => key in value)
      .map((key) => [key, typeof value[key] === 'string' ? truncateSafeExcerpt(value[key], 180) : value[key]])
  );
}

function distinctValueFingerprints(terms: ContractHierarchyTerm[]): Set<string> {
  return new Set(terms.map((term) => valueFingerprint(term.value)));
}

function valueFingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(summarizeTermValue(value))).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readStringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === 'string' ? field : null;
}

function firstIsoDate(...values: Array<string | null>): string | null {
  return values.find((value): value is string => isIsoDate(value)) ?? null;
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function groupBy<T>(values: T[], keyForValue: (value: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const value of values) {
    const key = keyForValue(value);
    map.set(key, [...(map.get(key) ?? []), value]);
  }
  return map;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function dedupeRelationships(
  relationships: ContractHierarchyResolution['relationships']
): ContractHierarchyResolution['relationships'] {
  const seen = new Set<string>();
  return relationships.filter((relationship) => {
    const key = [
      relationship.sourceDocumentId,
      relationship.relatedSourceDocumentId,
      relationship.relationshipType,
      relationship.effectiveDate ?? ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeConflicts(conflicts: ContractHierarchyResolution['conflicts']): ContractHierarchyResolution['conflicts'] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.termType}:${[...conflict.termIds].sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
