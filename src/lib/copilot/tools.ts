import {
  buildWorkspaceAnalytics,
  isCustomerFacingFindingStatus,
  isInternalPipelineFindingStatus
} from '../analytics/workspaceAnalytics';
import { customerFacingFindingStatuses } from '../analytics/statuses';
import { exportBlockerForFinding } from '../evidence/exportReadiness';
import {
  evidenceQualityReview,
  falsePositiveRiskCheck,
  prepareCfoSummary,
  prepareRecoveryNote,
  reviewerChecklist
} from './intelligence';
import {
  getFindingDetailInputSchema,
  getFindingsInputSchema,
  copilotToolBaseInputSchema,
  type CopilotToolBaseInput,
  type CopilotToolName,
  type GetFindingDetailInput,
  type GetFindingsInput
} from './schema';
import {
  safeCustomerLabel,
  safeFindingLabel,
  toWorkspaceAnalyticsInput,
  type CopilotDataContext,
  type CopilotEvidenceItem,
  type CopilotFinding
} from './context';
import { redactCalculationInputs, redactCopilotOutput, redactSafeText } from './redaction';

export type CopilotToolDefinition<Input, Output> = {
  name: CopilotToolName;
  description: string;
  execute(context: CopilotDataContext, input: Input): Output;
};

export const READ_ONLY_COPILOT_TOOL_NAMES = [
  'getWorkspaceSummary',
  'getAnalyticsSummary',
  'getFindings',
  'getFindingDetail',
  'checkReportReadiness',
  'detectMissingData',
  'prepareCfoSummaryData',
  'explainFindingFormulaDeterministic',
  'evidenceQualityReview',
  'falsePositiveRiskCheck',
  'reviewerChecklist',
  'prepareCfoSummary',
  'prepareRecoveryNote'
] as const satisfies readonly CopilotToolName[];

export type RoutedCopilotToolCall = {
  toolName: CopilotToolName;
  input: Record<string, unknown>;
};

export type CopilotToolExecution = {
  toolName: CopilotToolName;
  inputRefs: Record<string, unknown>;
  output: unknown;
  outputRefs: Record<string, unknown>;
};

export function routeCopilotTools(input: {
  organizationId: string;
  workspaceId: string;
  message: string;
  selectedFindingId?: string;
  selectedReportId?: string;
}): RoutedCopilotToolCall[] {
  const baseInput = {
    organization_id: input.organizationId,
    workspace_id: input.workspaceId
  };
  const normalized = input.message.toLowerCase();

  if (/\b(evidence quality|score evidence|quality.*evidence|weak evidence|conflicting evidence)\b/.test(normalized) && input.selectedFindingId) {
    return [{ toolName: 'evidenceQualityReview', input: { ...baseInput, finding_id: input.selectedFindingId } }];
  }

  if (/\b(false[- ]?positive|false positive|risk check|critic|challenge)\b/.test(normalized) && input.selectedFindingId) {
    return [{ toolName: 'falsePositiveRiskCheck', input: { ...baseInput, finding_id: input.selectedFindingId } }];
  }

  if (/\b(reviewer checklist|review checklist|checklist|before approving|before approval)\b/.test(normalized) && input.selectedFindingId) {
    return [{ toolName: 'reviewerChecklist', input: { ...baseInput, finding_id: input.selectedFindingId } }];
  }

  if (/\b(recovery note|customer note|recovery draft|draft.*recovery|draft.*note)\b/.test(normalized) && input.selectedFindingId) {
    return [{ toolName: 'prepareRecoveryNote', input: { ...baseInput, finding_id: input.selectedFindingId } }];
  }

  if (/\b(cfo|executive|board)\b.*\b(summary|brief|memo)\b/.test(normalized)) {
    return [{ toolName: 'prepareCfoSummary', input: baseInput }];
  }

  if (/\b(biggest|largest|top)\b.*\b(leakage|finding|exposure)\b/.test(normalized)) {
    return [
      { toolName: 'getAnalyticsSummary', input: baseInput },
      { toolName: 'getFindings', input: { ...baseInput, limit: 5 } }
    ];
  }

  if (/\b(report ready|ready for report|export ready|can.*report)\b/.test(normalized)) {
    return [{ toolName: 'checkReportReadiness', input: baseInput }];
  }

  if (/\b(missing|upload|data gap|incomplete|no contract|no invoice|no usage)\b/.test(normalized)) {
    return [{ toolName: 'detectMissingData', input: baseInput }];
  }

  if (/\b(needs? review|review burden|pending review|what.*review)\b/.test(normalized)) {
    return [
      { toolName: 'getFindings', input: { ...baseInput, status: 'needs_review' } },
      { toolName: 'checkReportReadiness', input: baseInput }
    ];
  }

  if (/\b(explain|formula|calculation|why)\b/.test(normalized) && input.selectedFindingId) {
    return [
      { toolName: 'getFindingDetail', input: { ...baseInput, finding_id: input.selectedFindingId } },
      { toolName: 'explainFindingFormulaDeterministic', input: { ...baseInput, finding_id: input.selectedFindingId } }
    ];
  }

  if (/\b(total|sum|amount|leakage|recoverable|recovered|prevented)\b/.test(normalized)) {
    return [{ toolName: 'getAnalyticsSummary', input: baseInput }];
  }

  if (/\b(cfo|executive|summary)\b/.test(normalized)) {
    return [{ toolName: 'prepareCfoSummaryData', input: baseInput }];
  }

  return [{ toolName: 'getWorkspaceSummary', input: baseInput }];
}

export function runCopilotTool(
  context: CopilotDataContext,
  toolName: CopilotToolName,
  input: Record<string, unknown>
): CopilotToolExecution {
  const output = runToolUnsafe(context, toolName, input);
  return {
    toolName,
    inputRefs: safeInputRefs(input),
    output: redactCopilotOutput(output),
    outputRefs: outputRefs(toolName, output)
  };
}

export function getWorkspaceSummary(context: CopilotDataContext, input: CopilotToolBaseInput) {
  const scoped = validateBaseInput(context, input);
  const documents = context.documents.filter((document) => document.workspaceId === scoped.workspace_id);
  const terms = context.terms.filter((term) => term.workspaceId === scoped.workspace_id);
  const findings = context.findings.filter((finding) => finding.workspaceId === scoped.workspace_id);
  const evidencePacks = context.evidencePacks.filter((pack) => pack.workspaceId === scoped.workspace_id);
  const warnings = readinessWarnings(context);

  return {
    organization: {
      id: context.organization.id,
      name: context.organization.name
    },
    workspace: {
      id: context.workspace.id,
      name: context.workspace.name,
      status: context.workspace.status
    },
    documents_count: documents.length,
    parsed_documents_count: documents.filter((document) => document.parseStatus === 'parsed').length,
    terms_count: terms.length,
    approved_terms_count: terms.filter((term) => term.reviewStatus === 'approved' || term.reviewStatus === 'edited').length,
    findings_count: findings.length,
    customer_facing_findings_count: findings.filter((finding) => isCustomerFacingFindingStatus(finding.status)).length,
    internal_pipeline_count: findings.filter((finding) => isInternalPipelineFindingStatus(finding.status)).length,
    report_count: evidencePacks.length,
    readiness_warnings: warnings
  };
}

export function getAnalyticsSummary(context: CopilotDataContext, input: CopilotToolBaseInput) {
  validateBaseInput(context, input);
  const analytics = buildWorkspaceAnalytics(toWorkspaceAnalyticsInput(context));
  return {
    currency: analytics.currency,
    total_customer_facing_leakage_minor: analytics.customerFacing.totalLeakageMinor,
    recoverable_leakage_minor: analytics.customerFacing.recoverableLeakageMinor,
    prevented_leakage_minor: analytics.customerFacing.preventedLeakageMinor,
    recovered_amount_minor: analytics.customerFacing.recoveredLeakageMinor,
    internal_unapproved_exposure_minor: analytics.internalPipeline.unapprovedExposureMinor,
    review_burden: {
      needs_review_count: analytics.internalPipeline.needsReviewCount,
      internal_pipeline_count: analytics.internalPipeline.findingCount,
      all_statuses: analytics.reviewBurden.allStatuses,
      confidence_distribution: analytics.reviewBurden.confidenceDistribution,
      evidence_coverage: analytics.reviewBurden.evidenceCoverage
    },
    top_categories: analytics.customerFacing.byCategory.slice(0, 5),
    top_customers: analytics.customerFacing.byCustomer.slice(0, 5)
  };
}

export function getFindings(context: CopilotDataContext, input: GetFindingsInput) {
  const scoped = getFindingsInputSchema.parse(input);
  validateBaseInput(context, scoped);

  const findings = context.findings
    .filter((finding) => finding.workspaceId === scoped.workspace_id)
    .filter((finding) => !scoped.status || finding.status === scoped.status)
    .filter((finding) => !scoped.customer || finding.customerId === scoped.customer)
    .filter((finding) => !scoped.finding_type || finding.findingType === scoped.finding_type)
    .filter((finding) => scoped.min_amount_minor === undefined || finding.amountMinor >= scoped.min_amount_minor)
    .filter((finding) => !scoped.outcome_type || finding.outcomeType === scoped.outcome_type)
    .filter((finding) => !scoped.confidence_bucket || confidenceBucketFor(finding.confidence) === scoped.confidence_bucket)
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, scoped.limit);

  return {
    findings: findings.map((finding) => ({
      finding_id: finding.id,
      workspace_id: finding.workspaceId,
      customer_ref: customerRef(finding.customerId),
      finding_type: finding.findingType,
      outcome_type: finding.outcomeType,
      status: finding.status,
      amount_minor: finding.amountMinor,
      currency: finding.currency,
      confidence: finding.confidence,
      confidence_bucket: confidenceBucketFor(finding.confidence),
      evidence_status: finding.evidenceCoverageStatus,
      safe_title: safeFindingLabel(finding),
      safe_summary: redactSafeText(finding.summary, `${finding.findingType} finding`)
    })),
    count: findings.length
  };
}

export function getFindingDetail(context: CopilotDataContext, input: GetFindingDetailInput) {
  const scoped = getFindingDetailInputSchema.parse(input);
  validateBaseInput(context, scoped);
  const finding = findScopedFinding(context, scoped.finding_id, scoped.workspace_id);
  const evidence = evidenceForFinding(context, finding.id, scoped.workspace_id);
  const normalizedCalculation = normalizeCalculation(finding.calculation);

  return {
    finding_id: finding.id,
    finding_title: redactSafeText(finding.title, safeFindingLabel(finding)),
    amount_minor: finding.amountMinor,
    currency: finding.currency,
    status: finding.status,
    outcome_type: finding.outcomeType,
    formula: normalizedCalculation.formula,
    calculation_inputs: redactCalculationInputs(normalizedCalculation.inputValues),
    evidence_status: finding.evidenceCoverageStatus,
    citations: evidence.map((item) => evidenceEntityRef(item)),
    reviewer_note: finding.reviewNote ? redactSafeText(finding.reviewNote) : null
  };
}

export function checkReportReadiness(context: CopilotDataContext, input: CopilotToolBaseInput) {
  const scoped = validateBaseInput(context, input);
  const findings = context.findings.filter((finding) => finding.workspaceId === scoped.workspace_id);
  const statusEligible = findings.filter((finding) => isCustomerFacingFindingStatus(finding.status));
  const blockedByStatus = findings.filter((finding) => !isCustomerFacingFindingStatus(finding.status));
  const excludedAfterEvidenceReview: Array<{ finding_id: string; blocker: string }> = [];
  const moneyFindingsMissingInvoiceUsage: string[] = [];
  const missingApprovedEvidence: string[] = [];

  for (const finding of statusEligible) {
    const blocker = exportBlockerForFinding({
      status: finding.status,
      outcomeType: finding.outcomeType,
      calculation: finding.calculation,
      evidenceCitations: evidenceForFinding(context, finding.id, scoped.workspace_id)
        .filter((item) => item.approvalState === 'approved' && item.reviewedBy && item.reviewedAt)
        .map((item) => ({
          sourceType: item.sourceType,
          evidenceType: item.evidenceType,
          approvalState: item.approvalState
        }))
    });

    if (!blocker) continue;

    excludedAfterEvidenceReview.push({ finding_id: finding.id, blocker });
    if (blocker === 'approved_evidence_required' || blocker === 'contract_evidence_required') {
      missingApprovedEvidence.push(finding.id);
    }
    if (blocker === 'invoice_or_usage_evidence_required') {
      moneyFindingsMissingInvoiceUsage.push(finding.id);
    }
  }

  const includedCount = statusEligible.length - excludedAfterEvidenceReview.length;
  return {
    report_ready: includedCount > 0,
    included_findings_count: includedCount,
    status_eligible_findings_count: statusEligible.length,
    missing_approved_findings: blockedByStatus
      .filter((finding) => isInternalPipelineFindingStatus(finding.status))
      .map((finding) => ({
        finding_id: finding.id,
        current_status: finding.status,
        required_statuses: customerFacingFindingStatuses
      })),
    missing_approved_evidence: missingApprovedEvidence,
    money_findings_missing_invoice_or_usage_evidence: moneyFindingsMissingInvoiceUsage,
    findings_blocked_by_status: blockedByStatus.map((finding) => ({
      finding_id: finding.id,
      status: finding.status
    })),
    findings_excluded_from_report: excludedAfterEvidenceReview
  };
}

export function detectMissingData(context: CopilotDataContext, input: CopilotToolBaseInput) {
  const scoped = validateBaseInput(context, input);
  const documents = context.documents.filter((document) => document.workspaceId === scoped.workspace_id);
  const contractDocuments = documents.filter((document) => document.documentType === 'contract');
  const invoiceDocuments = documents.filter((document) => document.documentType === 'invoice_csv');
  const usageDocuments = documents.filter((document) => document.documentType === 'usage_csv');
  const approvedEvidenceByFinding = new Set(
    context.evidenceItems
      .filter((item) => item.workspaceId === scoped.workspace_id && item.approvalState === 'approved' && item.reviewedBy && item.reviewedAt)
      .map((item) => item.findingId)
  );

  return {
    no_contract_uploaded: contractDocuments.length === 0,
    no_invoice_csv_uploaded: invoiceDocuments.length === 0,
    no_usage_csv_uploaded: usageDocuments.length === 0,
    contracts_without_customer: contractDocuments.filter((document) => !document.customerId).map((document) => document.id),
    invoices_without_customer: context.invoiceRecords
      .filter((record) => record.workspaceId === scoped.workspace_id && !record.customerId)
      .map((record) => record.id),
    terms_pending_review: context.terms
      .filter((term) => term.workspaceId === scoped.workspace_id && ['extracted', 'needs_review'].includes(term.reviewStatus))
      .map((term) => term.id),
    findings_missing_evidence: context.findings
      .filter((finding) => finding.workspaceId === scoped.workspace_id && !approvedEvidenceByFinding.has(finding.id))
      .map((finding) => finding.id),
    low_confidence_extraction_terms: context.terms
      .filter((term) => term.workspaceId === scoped.workspace_id && term.reviewStatus !== 'rejected' && term.confidence < 0.75)
      .map((term) => ({ term_id: term.id, confidence: term.confidence }))
  };
}

export function prepareCfoSummaryData(context: CopilotDataContext, input: CopilotToolBaseInput) {
  validateBaseInput(context, input);
  const analytics = getAnalyticsSummary(context, input);
  const readiness = checkReportReadiness(context, input);
  const missingData = detectMissingData(context, input);
  const topFindings = getFindings(context, {
    ...input,
    limit: 5
  });

  return {
    workspace_ref: {
      organization_id: context.organization.id,
      workspace_id: context.workspace.id,
      workspace_status: context.workspace.status
    },
    analytics,
    report_readiness: readiness,
    missing_data: missingData,
    top_finding_refs: topFindings.findings.map((finding) => ({
      finding_id: finding.finding_id,
      amount_minor: finding.amount_minor,
      currency: finding.currency,
      status: finding.status,
      outcome_type: finding.outcome_type
    }))
  };
}

export function explainFindingFormulaDeterministic(context: CopilotDataContext, input: GetFindingDetailInput) {
  const scoped = getFindingDetailInputSchema.parse(input);
  validateBaseInput(context, scoped);
  const finding = findScopedFinding(context, scoped.finding_id, scoped.workspace_id);
  const calculation = normalizeCalculation(finding.calculation);

  return {
    finding_id: finding.id,
    formula: calculation.formula,
    explanation: deterministicFormulaExplanation(finding.findingType, calculation.formula),
    input_keys: Object.keys(calculation.inputValues).sort()
  };
}

export function buildCopilotAnswer(executions: CopilotToolExecution[]): string {
  const primary = executions[0];
  if (!primary) {
    return 'I could not route that read-only request.';
  }

  if (primary.toolName === 'getAnalyticsSummary') {
    const output = primary.output as ReturnType<typeof getAnalyticsSummary>;
    return `Customer-facing leakage is ${output.total_customer_facing_leakage_minor} ${output.currency} minor units. Internal unapproved exposure is ${output.internal_unapproved_exposure_minor} minor units and stays separate from customer-facing totals.`;
  }

  if (primary.toolName === 'getFindings') {
    const output = primary.output as ReturnType<typeof getFindings>;
    return `${output.count} read-only finding reference${output.count === 1 ? '' : 's'} matched. Draft and needs-review items remain internal until a human approves them.`;
  }

  if (primary.toolName === 'checkReportReadiness') {
    const output = primary.output as ReturnType<typeof checkReportReadiness>;
    return output.report_ready
      ? `The report has ${output.included_findings_count} export-ready finding reference${output.included_findings_count === 1 ? '' : 's'} based on approved evidence.`
      : 'The report is not ready yet because approved customer-facing findings and evidence requirements are not fully satisfied.';
  }

  if (primary.toolName === 'detectMissingData') {
    return 'I checked the workspace for missing source data, pending terms, low-confidence terms, and findings without approved evidence.';
  }

  if (primary.toolName === 'getFindingDetail') {
    return 'I loaded the selected finding detail with formula inputs and evidence references only.';
  }

  if (primary.toolName === 'prepareCfoSummaryData') {
    return 'I prepared safe CFO summary data with deterministic totals and readiness flags. No narrative was generated.';
  }

  if (primary.toolName === 'explainFindingFormulaDeterministic') {
    return 'I explained the selected finding formula deterministically from the stored calculation object.';
  }

  if (primary.toolName === 'evidenceQualityReview') {
    return 'I reviewed evidence quality for the selected finding. This is advisory and does not approve evidence or change status.';
  }

  if (primary.toolName === 'falsePositiveRiskCheck') {
    return 'I checked false-positive risk factors for the selected finding. This is a reviewer aid, not an approval decision.';
  }

  if (primary.toolName === 'reviewerChecklist') {
    return 'I drafted a reviewer checklist for the selected finding without changing the finding or evidence.';
  }

  if (primary.toolName === 'prepareCfoSummary') {
    return 'I prepared a CFO summary from code-calculated analytics, keeping customer-facing leakage separate from internal exposure.';
  }

  if (primary.toolName === 'prepareRecoveryNote') {
    return 'I drafted recovery-note content for human review only. Nothing was sent and no status was changed.';
  }

  return 'I loaded the workspace summary and readiness warnings.';
}

function runToolUnsafe(context: CopilotDataContext, toolName: CopilotToolName, input: Record<string, unknown>): unknown {
  if (toolName === 'getWorkspaceSummary') return getWorkspaceSummary(context, copilotToolBaseInputSchema.parse(input));
  if (toolName === 'getAnalyticsSummary') return getAnalyticsSummary(context, copilotToolBaseInputSchema.parse(input));
  if (toolName === 'getFindings') return getFindings(context, getFindingsInputSchema.parse(input));
  if (toolName === 'getFindingDetail') return getFindingDetail(context, getFindingDetailInputSchema.parse(input));
  if (toolName === 'checkReportReadiness') return checkReportReadiness(context, copilotToolBaseInputSchema.parse(input));
  if (toolName === 'detectMissingData') return detectMissingData(context, copilotToolBaseInputSchema.parse(input));
  if (toolName === 'prepareCfoSummaryData') return prepareCfoSummaryData(context, copilotToolBaseInputSchema.parse(input));
  if (toolName === 'explainFindingFormulaDeterministic') return explainFindingFormulaDeterministic(context, getFindingDetailInputSchema.parse(input));
  if (toolName === 'evidenceQualityReview') return evidenceQualityReview(context, getFindingDetailInputSchema.parse(input));
  if (toolName === 'falsePositiveRiskCheck') return falsePositiveRiskCheck(context, getFindingDetailInputSchema.parse(input));
  if (toolName === 'reviewerChecklist') return reviewerChecklist(context, getFindingDetailInputSchema.parse(input));
  if (toolName === 'prepareCfoSummary') return prepareCfoSummary(context, copilotToolBaseInputSchema.parse(input));
  if (toolName === 'prepareRecoveryNote') return prepareRecoveryNote(context, getFindingDetailInputSchema.parse(input));
  throw new Error('unsupported_copilot_tool');
}

function validateBaseInput(context: CopilotDataContext, input: CopilotToolBaseInput): CopilotToolBaseInput {
  const scoped = copilotToolBaseInputSchema.parse(input);
  if (scoped.organization_id !== context.organization.id || scoped.workspace_id !== context.workspace.id) {
    throw new Error('forbidden');
  }
  return scoped;
}

function safeInputRefs(input: Record<string, unknown>): Record<string, unknown> {
  return {
    organization_id: input.organization_id,
    workspace_id: input.workspace_id,
    finding_id: input.finding_id,
    selected_report_id: input.selected_report_id,
    filters: {
      status: input.status,
      customer: input.customer,
      finding_type: input.finding_type,
      min_amount_minor: input.min_amount_minor,
      outcome_type: input.outcome_type,
      confidence_bucket: input.confidence_bucket
    }
  };
}

function outputRefs(toolName: CopilotToolName, output: unknown): Record<string, unknown> {
  if (toolName === 'getFindings' && isRecord(output) && Array.isArray(output.findings)) {
    return { finding_ids: output.findings.map((finding) => (isRecord(finding) ? finding.finding_id : null)).filter(Boolean) };
  }
  if (toolName === 'getFindingDetail' && isRecord(output)) {
    return { finding_id: output.finding_id };
  }
  if (['evidenceQualityReview', 'falsePositiveRiskCheck', 'reviewerChecklist', 'prepareRecoveryNote'].includes(toolName) && isRecord(output)) {
    return { finding_id: output.finding_id, advisory_only: output.advisory_only };
  }
  if (toolName === 'prepareCfoSummary' && isRecord(output)) {
    return {
      workspace_id: output.workspace_id,
      advisory_only: output.advisory_only
    };
  }
  if (toolName === 'checkReportReadiness' && isRecord(output)) {
    return {
      report_ready: output.report_ready,
      included_findings_count: output.included_findings_count
    };
  }
  return { tool_name: toolName };
}

function readinessWarnings(context: CopilotDataContext): string[] {
  const missingData = detectMissingData(context, {
    organization_id: context.organization.id,
    workspace_id: context.workspace.id
  });
  const warnings: string[] = [];
  if (missingData.no_contract_uploaded) warnings.push('No contract document is uploaded.');
  if (missingData.no_invoice_csv_uploaded) warnings.push('No invoice CSV is uploaded.');
  if (missingData.no_usage_csv_uploaded) warnings.push('No usage CSV is uploaded.');
  if (missingData.terms_pending_review.length > 0) warnings.push('Some extracted terms still need finance review.');
  if (missingData.findings_missing_evidence.length > 0) warnings.push('Some findings do not have approved evidence.');
  return warnings;
}

function findScopedFinding(context: CopilotDataContext, findingId: string, workspaceId: string): CopilotFinding {
  const finding = context.findings.find((item) => item.id === findingId && item.workspaceId === workspaceId);
  if (!finding) throw new Error('forbidden');
  return finding;
}

function evidenceForFinding(context: CopilotDataContext, findingId: string, workspaceId: string): CopilotEvidenceItem[] {
  return context.evidenceItems.filter((item) => item.workspaceId === workspaceId && item.findingId === findingId);
}

function evidenceEntityRef(item: CopilotEvidenceItem) {
  return {
    evidence_item_id: item.id,
    evidence_type: item.evidenceType,
    source_type: item.sourceType,
    source_id: item.sourceId,
    document_chunk_id: item.documentChunkId,
    approval_state: item.approvalState
  };
}

function normalizeCalculation(calculation: Record<string, unknown>): { formula: string; inputValues: Record<string, unknown> } {
  const formula = typeof calculation.formula === 'string' && calculation.formula.trim().length > 0 ? calculation.formula : 'formula_not_available';
  const inputValues = { ...calculation };
  delete inputValues.formula;
  return { formula, inputValues };
}

function deterministicFormulaExplanation(findingType: string, formula: string): string {
  const normalized = `${findingType} ${formula}`.toLowerCase();
  if (normalized.includes('minimum') || normalized.includes('commitment')) {
    return 'Compares the approved minimum commitment against billed amount. The difference is the recoverable shortfall when billing is lower than the commitment.';
  }
  if (normalized.includes('usage') || normalized.includes('overage')) {
    return 'Compares approved usage allowance and usage records against invoiced usage. Unbilled overage is calculated from excess units and the approved overage price.';
  }
  if (normalized.includes('seat')) {
    return 'Compares contracted seat pricing or committed seats with invoice quantities. Any underbilled seat amount is kept in minor currency units.';
  }
  if (normalized.includes('discount')) {
    return 'Checks whether a discount was applied after the approved discount period or outside the approved discount terms.';
  }
  if (normalized.includes('uplift')) {
    return 'Applies the approved annual uplift terms to the relevant base amount and compares the expected amount with billed amount.';
  }
  if (normalized.includes('payment')) {
    return 'Compares approved payment terms with invoice due-date data to identify timing or collection-risk mismatches.';
  }
  if (normalized.includes('renewal') || normalized.includes('notice')) {
    return 'Compares renewal and notice-period terms to the current audit window to flag renewal risk. Risk alerts do not create leakage totals.';
  }
  return 'Uses the stored deterministic calculation object for this finding. No AI-generated amount is used.';
}

function confidenceBucketFor(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence < 0.6) return 'low';
  if (confidence < 0.85) return 'medium';
  return 'high';
}

function customerRef(customerId: string | null) {
  return customerId
    ? {
        customer_id: customerId,
        label: safeCustomerLabel(customerId)
      }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
