import type { Citation } from '../leakage/types';

export function formatCitation(citation: Citation): string {
  const base = `${citation.sourceType.toUpperCase()} · ${citation.label}`;
  return citation.excerpt ? `${base}: ${citation.excerpt}` : base;
}

export function assertHasEvidence(citations: Citation[]): void {
  if (citations.length === 0) {
    throw new Error('A leakage finding cannot be created without evidence citations.');
  }
}
