export type AuditEventType =
  | 'auth.login'
  | 'auth.login_failed'
  | 'organization.created'
  | 'workspace.created'
  | 'upload.created'
  | 'ingestion.completed'
  | 'chunking.started'
  | 'chunking.completed'
  | 'embedding.started'
  | 'embedding.completed'
  | 'semantic_search.ran'
  | 'extraction.started'
  | 'extraction.completed'
  | 'extraction.failed'
  | 'extraction_run_started'
  | 'extraction_run_completed'
  | 'extraction_run_failed'
  | 'term.approved'
  | 'term.edited'
  | 'term.rejected'
  | 'term.needs_review'
  | 'customer.assignment_changed'
  | 'reconciliation.started'
  | 'reconciliation.completed'
  | 'reconciliation_run_started'
  | 'reconciliation_run_completed'
  | 'reconciliation_run_failed'
  | 'run_superseded'
  | 'finding.created'
  | 'finding.approved'
  | 'finding.exported'
  | 'finding.status_changed'
  | 'evidence_candidate.attached'
  | 'evidence_candidate.approved'
  | 'evidence_candidate.rejected'
  | 'evidence_item.removed'
  | 'report.generated'
  | 'report.exported'
  | 'role.changed'
  | 'view.loaded';

const REQUIRED_AUDIT_EVENTS = new Set<AuditEventType>([
  'auth.login',
  'auth.login_failed',
  'organization.created',
  'workspace.created',
  'upload.created',
  'ingestion.completed',
  'chunking.started',
  'chunking.completed',
  'embedding.started',
  'embedding.completed',
  'semantic_search.ran',
  'extraction.started',
  'extraction.completed',
  'extraction.failed',
  'extraction_run_started',
  'extraction_run_completed',
  'extraction_run_failed',
  'term.approved',
  'term.edited',
  'term.rejected',
  'term.needs_review',
  'customer.assignment_changed',
  'reconciliation.started',
  'reconciliation.completed',
  'reconciliation_run_started',
  'reconciliation_run_completed',
  'reconciliation_run_failed',
  'run_superseded',
  'finding.created',
  'finding.approved',
  'finding.exported',
  'finding.status_changed',
  'evidence_candidate.attached',
  'evidence_candidate.approved',
  'evidence_candidate.rejected',
  'evidence_item.removed',
  'report.generated',
  'report.exported',
  'role.changed'
]);

const SENSITIVE_METADATA_KEYS = [
  /raw.*contract/i,
  /raw.*invoice/i,
  /invoice_rows?/i,
  /contract_text/i,
  /prompt/i,
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /full_content/i,
  /embedding/i,
  /email/i,
  /query/i,
  /model_response/i
];

export function shouldWriteAuditEvent(eventType: AuditEventType | string): boolean {
  return REQUIRED_AUDIT_EVENTS.has(eventType as AuditEventType);
}

export function redactAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SENSITIVE_METADATA_KEYS.some((pattern) => pattern.test(key)) ? '[redacted]' : value
    ])
  );
}
