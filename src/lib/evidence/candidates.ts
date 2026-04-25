import type { Citation } from '../leakage/types';

export type EvidenceType = 'contract_term' | 'invoice_row' | 'usage_row' | 'calculation' | 'human_note';
export type SourceDocumentType = 'contract' | 'invoice_csv' | 'usage_csv' | 'customer_csv' | 'other';

export function evidenceTypeForSourceDocument(documentType: SourceDocumentType | string): EvidenceType {
  if (documentType === 'contract') return 'contract_term';
  if (documentType === 'invoice_csv') return 'invoice_row';
  if (documentType === 'usage_csv') return 'usage_row';
  return 'human_note';
}

export function citationForEvidenceCandidate(input: {
  documentType: SourceDocumentType | string;
  chunkId: string;
  sourceLabel: string;
  content: string;
}): Citation {
  return {
    sourceType: sourceTypeForDocument(input.documentType),
    sourceId: input.chunkId,
    label: input.sourceLabel,
    excerpt: excerptForEvidence(input.content)
  };
}

export function excerptForEvidence(content: string, maxLength = 500): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function sourceTypeForDocument(documentType: SourceDocumentType | string): Citation['sourceType'] {
  if (documentType === 'contract') return 'contract';
  if (documentType === 'invoice_csv') return 'invoice';
  if (documentType === 'usage_csv') return 'usage';
  return 'calculation';
}
