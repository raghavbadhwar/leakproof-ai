import { describe, expect, it } from 'vitest';
import { redactAuditMetadata, shouldWriteAuditEvent } from './auditEvents';

describe('audit event helpers', () => {
  it('redacts raw contracts, invoice rows, prompts, and secrets from audit metadata', () => {
    const redacted = redactAuditMetadata({
      source_document_id: 'doc_1',
      raw_contract_text: 'sensitive contract',
      invoice_rows: [{ amount: '8000.00' }],
      prompt: 'full prompt',
      api_key: 'secret',
      status: 'uploaded'
    });

    expect(redacted).toEqual({
      source_document_id: 'doc_1',
      raw_contract_text: '[redacted]',
      invoice_rows: '[redacted]',
      prompt: '[redacted]',
      api_key: '[redacted]',
      status: 'uploaded'
    });
  });

  it('requires audit events for sensitive workflow actions', () => {
    expect(shouldWriteAuditEvent('workspace.created')).toBe(true);
    expect(shouldWriteAuditEvent('ingestion.completed')).toBe(true);
    expect(shouldWriteAuditEvent('chunking.started')).toBe(true);
    expect(shouldWriteAuditEvent('upload.created')).toBe(true);
    expect(shouldWriteAuditEvent('finding.status_changed')).toBe(true);
    expect(shouldWriteAuditEvent('semantic_search.ran')).toBe(true);
    expect(shouldWriteAuditEvent('evidence_candidate.approved')).toBe(true);
    expect(shouldWriteAuditEvent('report.exported')).toBe(true);
    expect(shouldWriteAuditEvent('customer.assignment_changed')).toBe(true);
    expect(shouldWriteAuditEvent('extraction_run_started')).toBe(true);
    expect(shouldWriteAuditEvent('extraction_run_completed')).toBe(true);
    expect(shouldWriteAuditEvent('extraction_run_failed')).toBe(true);
    expect(shouldWriteAuditEvent('reconciliation_run_started')).toBe(true);
    expect(shouldWriteAuditEvent('reconciliation_run_completed')).toBe(true);
    expect(shouldWriteAuditEvent('reconciliation_run_failed')).toBe(true);
    expect(shouldWriteAuditEvent('run_superseded')).toBe(true);
    expect(shouldWriteAuditEvent('view.loaded')).toBe(false);
  });
});
