import { z } from 'zod';

const countSchema = z.number().int().min(0);

export const auditAgentWorkspaceStateSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  documents: z.object({
    contracts: countSchema,
    invoiceCsvs: countSchema,
    usageCsvs: countSchema
  }),
  terms: z.object({
    extracted: countSchema,
    needsReview: countSchema,
    approved: countSchema,
    rejected: countSchema
  }),
  records: z.object({
    invoices: countSchema,
    usage: countSchema
  }),
  findings: z.object({
    draft: countSchema,
    needsReview: countSchema,
    approved: countSchema,
    customerReady: countSchema,
    recovered: countSchema,
    dismissed: countSchema,
    notRecoverable: countSchema
  })
});

export type AuditAgentWorkspaceState = z.infer<typeof auditAgentWorkspaceStateSchema>;

export type AuditAgentPhase =
  | 'needs_uploads'
  | 'ready_for_extraction'
  | 'needs_term_review'
  | 'ready_for_reconciliation'
  | 'needs_finding_review'
  | 'ready_for_report'
  | 'completed';

export type AuditAgentAction = {
  id: string;
  label: string;
  kind: 'upload' | 'extract' | 'review_terms' | 'reconcile' | 'review_findings' | 'export_report';
  humanRequired: boolean;
  blockedReason?: string;
};

export type AuditAgentDecision = {
  phase: AuditAgentPhase;
  canRunExtraction: boolean;
  canRunReconciliation: boolean;
  canExportReport: boolean;
  actions: AuditAgentAction[];
  guardrails: string[];
};

export function planAuditAgentNextStep(rawState: AuditAgentWorkspaceState): AuditAgentDecision {
  const state = auditAgentWorkspaceStateSchema.parse(rawState);
  const hasContract = state.documents.contracts > 0;
  const hasBillingData = state.documents.invoiceCsvs > 0 || state.documents.usageCsvs > 0;
  const hasNormalizedBilling = state.records.invoices > 0 || state.records.usage > 0;
  const hasReviewedTerms = state.terms.approved > 0;
  const hasUnreviewedTerms = state.terms.extracted > 0 || state.terms.needsReview > 0;
  const hasReviewableFindings = state.findings.draft > 0 || state.findings.needsReview > 0;
  const hasApprovedFindings = state.findings.approved > 0 || state.findings.customerReady > 0 || state.findings.recovered > 0;

  const canRunExtraction = hasContract;
  const canRunReconciliation = hasReviewedTerms && hasNormalizedBilling;
  const canExportReport = hasApprovedFindings;

  if (!hasContract || !hasBillingData) {
    return decision('needs_uploads', canRunExtraction, canRunReconciliation, canExportReport, [
      uploadAction('Upload at least one contract.', hasContract),
      uploadAction('Upload invoice or usage data.', hasBillingData)
    ]);
  }

  if (state.terms.extracted + state.terms.needsReview + state.terms.approved + state.terms.rejected === 0) {
    return decision('ready_for_extraction', canRunExtraction, canRunReconciliation, canExportReport, [
      {
        id: 'run_extraction',
        label: 'Run contract extraction',
        kind: 'extract',
        humanRequired: false
      }
    ]);
  }

  if (hasUnreviewedTerms || !hasReviewedTerms) {
    return decision('needs_term_review', canRunExtraction, canRunReconciliation, canExportReport, [
      {
        id: 'review_terms',
        label: 'Review and approve extracted terms',
        kind: 'review_terms',
        humanRequired: true,
        blockedReason: !hasReviewedTerms ? 'At least one approved or edited term is required before reconciliation.' : undefined
      }
    ]);
  }

  if (state.findings.draft + state.findings.needsReview + state.findings.approved + state.findings.customerReady + state.findings.recovered + state.findings.dismissed + state.findings.notRecoverable === 0) {
    return decision('ready_for_reconciliation', canRunExtraction, canRunReconciliation, canExportReport, [
      {
        id: 'run_reconciliation',
        label: 'Run deterministic reconciliation',
        kind: 'reconcile',
        humanRequired: false,
        blockedReason: canRunReconciliation ? undefined : 'Approved terms and normalized billing or usage records are required.'
      }
    ]);
  }

  if (hasReviewableFindings) {
    return decision('needs_finding_review', canRunExtraction, canRunReconciliation, canExportReport, [
      {
        id: 'review_findings',
        label: 'Review findings and mark approved, dismissed, or needs review',
        kind: 'review_findings',
        humanRequired: true
      }
    ]);
  }

  if (hasApprovedFindings) {
    return decision('ready_for_report', canRunExtraction, canRunReconciliation, canExportReport, [
      {
        id: 'export_report',
        label: 'Export CFO-ready audit report',
        kind: 'export_report',
        humanRequired: true
      }
    ]);
  }

  return decision('completed', canRunExtraction, canRunReconciliation, canExportReport, []);
}

function uploadAction(label: string, satisfied: boolean): AuditAgentAction {
  return {
    id: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    label,
    kind: 'upload',
    humanRequired: true,
    blockedReason: satisfied ? undefined : label
  };
}

function decision(
  phase: AuditAgentPhase,
  canRunExtraction: boolean,
  canRunReconciliation: boolean,
  canExportReport: boolean,
  actions: AuditAgentAction[]
): AuditAgentDecision {
  return {
    phase,
    canRunExtraction,
    canRunReconciliation,
    canExportReport,
    actions,
    guardrails: [
      'LLM extracts contract terms only.',
      'Deterministic TypeScript calculates all money amounts in integer minor units.',
      'Human approval is required before findings become customer-ready.',
      'Every customer-facing report must include source evidence.'
    ]
  };
}
