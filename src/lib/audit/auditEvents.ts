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
  | 'invite_created'
  | 'invite_cancelled'
  | 'invite_accepted'
  | 'member_added'
  | 'member_removed'
  | 'member_role_changed'
  | 'finding_assigned'
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
  'role.changed',
  'invite_created',
  'invite_cancelled',
  'invite_accepted',
  'member_added',
  'member_removed',
  'member_role_changed',
  'finding_assigned'
]);

const SENSITIVE_METADATA_KEYS = [
  /raw.*contract/i,
  /raw.*invoice/i,
  /contract.*text/i,
  /contract.*content/i,
  /invoice.*text/i,
  /invoice.*content/i,
  /invoice_rows?/i,
  /contract_text/i,
  /prompt/i,
  /api[_-]?key/i,
  /authorization/i,
  /secret/i,
  /token/i,
  /session/i,
  /full_content/i,
  /content/i,
  /excerpt/i,
  /embedding/i,
  /vector/i,
  /email/i,
  /query/i,
  /llm_response/i,
  /llm_output/i,
  /model_response/i,
  /model_output/i,
  /response/i,
  /^notes?$/i,
  /free.*text/i,
  /reviewer_note/i,
  /review_note/i,
  /citation/i,
  /row_citation/i,
  /term_value/i
];

export function shouldWriteAuditEvent(eventType: AuditEventType | string): boolean {
  return REQUIRED_AUDIT_EVENTS.has(eventType as AuditEventType);
}

export function redactAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return redactRecord(metadata);
}

export function sanitizeOperationalErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message) return fallback;

  if (/gemini|google|model|prompt|response|content|contract|invoice|embedding|api[_-]?key|secret|token/i.test(message)) {
    return fallback;
  }

  return message.slice(0, 240);
}

function redactRecord(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, redactValue(key, value)]));
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_METADATA_KEYS.some((pattern) => pattern.test(key))) {
    return '[redacted]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactNestedValue(item));
  }

  return redactNestedValue(value);
}

function redactNestedValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return redactRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
