import type { LeakageFinding } from '../leakage/types';

export const EVIDENCE_APPROVAL_RULE =
  'Evidence is export-ready only after a reviewer approves it. Draft, suggested, rejected, and system-created evidence are excluded from customer-facing reports and evidence packs.';

export type EvidenceExportBlocker =
  | 'approved_evidence_required'
  | 'contract_evidence_required'
  | 'invoice_or_usage_evidence_required'
  | 'calculation_required';

export type ExportReadyEvidenceCitation = {
  sourceType?: string | null;
  evidenceType?: string | null;
  approvalState?: string | null;
  citation?: unknown;
};

export type ExportCalculation = {
  formula: string;
  inputValues: Record<string, unknown>;
};

export type ExportFindingReadinessInput = {
  status: LeakageFinding['status'] | string;
  outcomeType: LeakageFinding['outcomeType'] | string;
  calculation?: Record<string, unknown> | null;
  evidenceCitations: ExportReadyEvidenceCitation[];
};

export function approvedEvidenceCitations<T extends ExportReadyEvidenceCitation>(citations: T[]): T[] {
  return citations.filter(isApprovedEvidenceCitation);
}

export function isApprovedEvidenceCitation(citation: ExportReadyEvidenceCitation): boolean {
  return citation.approvalState === 'approved';
}

export function evidenceSourceType(citation: ExportReadyEvidenceCitation): string | undefined {
  if (typeof citation.sourceType === 'string' && citation.sourceType.trim().length > 0) {
    return citation.sourceType;
  }

  if (typeof citation.evidenceType !== 'string') return undefined;
  if (citation.evidenceType === 'contract_term') return 'contract';
  if (citation.evidenceType === 'invoice_row') return 'invoice';
  if (citation.evidenceType === 'usage_row') return 'usage';
  if (citation.evidenceType === 'calculation') return 'calculation';
  return undefined;
}

export function isContractEvidence(citation: ExportReadyEvidenceCitation): boolean {
  return evidenceSourceType(citation) === 'contract';
}

export function isInvoiceOrUsageEvidence(citation: ExportReadyEvidenceCitation): boolean {
  const sourceType = evidenceSourceType(citation);
  return sourceType === 'invoice' || sourceType === 'usage';
}

export function exportBlockerForFinding(input: ExportFindingReadinessInput): EvidenceExportBlocker | null {
  const approvedEvidence = approvedEvidenceCitations(input.evidenceCitations);
  if (approvedEvidence.length === 0) return 'approved_evidence_required';
  if (!approvedEvidence.some(isContractEvidence)) return 'contract_evidence_required';

  if (input.outcomeType === 'risk_alert') return null;

  if (!approvedEvidence.some(isInvoiceOrUsageEvidence)) return 'invoice_or_usage_evidence_required';
  if (!normalizeExportCalculation(input.calculation)) return 'calculation_required';

  return null;
}

export function normalizeExportCalculation(calculation: Record<string, unknown> | null | undefined): ExportCalculation | null {
  if (!isRecord(calculation)) return null;

  const formulaValue = calculation.formula;
  if (typeof formulaValue !== 'string' || formulaValue.trim().length === 0) return null;

  const inputValues = { ...calculation };
  delete inputValues.formula;
  if (Object.keys(inputValues).length === 0) return null;

  return {
    formula: formulaValue,
    inputValues
  };
}

export function exportCitationForEvidenceRow(row: {
  approval_state?: string | null;
  evidence_type?: string | null;
  citation?: unknown;
}): ExportReadyEvidenceCitation {
  const citation = isRecord(row.citation) ? row.citation : {};
  return {
    sourceType: typeof citation.sourceType === 'string' ? citation.sourceType : undefined,
    evidenceType: row.evidence_type,
    approvalState: row.approval_state
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
