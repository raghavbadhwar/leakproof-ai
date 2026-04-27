import { describe, expect, it } from 'vitest';
import { redactAuditMetadata, sanitizeOperationalErrorMessage, shouldWriteAuditEvent } from './auditEvents';

describe('audit event helpers', () => {
  it('redacts raw contracts, invoice rows, prompts, and secrets from audit metadata', () => {
    const redacted = redactAuditMetadata({
      source_document_id: 'doc_1',
      raw_contract_text: 'sensitive contract',
      contractText: 'contract pasted into camel-case metadata',
      invoice_contents: 'invoice CSV contents',
      invoice_rows: [{ amount: '8000.00' }],
      embeddings: [0.12, 0.34],
      model_response: { answer: 'raw model answer' },
      llm_output: 'raw model output',
      prompt: 'full prompt',
      api_key: 'secret',
      access_token: 'token',
      file_name: 'Acme Contract.pdf',
      storage_path: 'org/workspace/contracts/Acme Contract.pdf',
      customer_name: 'Acme Cloud',
      domain: 'acme.example',
      nested: {
        model_output: 'raw model output',
        excerpt: 'raw evidence excerpt',
        citation: { excerpt: 'raw citation excerpt' },
        free_text_note: 'reviewer pasted contract text',
        safe_count: 2
      },
      note: 'contains pasted contract text',
      status: 'uploaded'
    });

    expect(redacted).toEqual({
      source_document_id: 'doc_1',
      raw_contract_text: '[redacted]',
      contractText: '[redacted]',
      invoice_contents: '[redacted]',
      invoice_rows: '[redacted]',
      embeddings: '[redacted]',
      model_response: '[redacted]',
      llm_output: '[redacted]',
      prompt: '[redacted]',
      api_key: '[redacted]',
      access_token: '[redacted]',
      file_name: '[redacted]',
      storage_path: '[redacted]',
      customer_name: '[redacted]',
      domain: '[redacted]',
      nested: {
        model_output: '[redacted]',
        excerpt: '[redacted]',
        citation: '[redacted]',
        free_text_note: '[redacted]',
        safe_count: 2
      },
      note: '[redacted]',
      status: 'uploaded'
    });
  });

  it('sanitizes operational errors before persisting failure metadata', () => {
    expect(sanitizeOperationalErrorMessage(new Error('Gemini response included raw contract text'), 'Extraction failed.')).toBe('Extraction failed.');
    expect(sanitizeOperationalErrorMessage(new Error('network timeout'), 'Extraction failed.')).toBe('network timeout');
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
    expect(shouldWriteAuditEvent('role.changed')).toBe(true);
    expect(shouldWriteAuditEvent('extraction_run_started')).toBe(true);
    expect(shouldWriteAuditEvent('extraction_run_completed')).toBe(true);
    expect(shouldWriteAuditEvent('extraction_run_failed')).toBe(true);
    expect(shouldWriteAuditEvent('reconciliation_run_started')).toBe(true);
    expect(shouldWriteAuditEvent('reconciliation_run_completed')).toBe(true);
    expect(shouldWriteAuditEvent('reconciliation_run_failed')).toBe(true);
    expect(shouldWriteAuditEvent('run_superseded')).toBe(true);
    expect(shouldWriteAuditEvent('invite_created')).toBe(true);
    expect(shouldWriteAuditEvent('invite_cancelled')).toBe(true);
    expect(shouldWriteAuditEvent('invite_accepted')).toBe(true);
    expect(shouldWriteAuditEvent('member_added')).toBe(true);
    expect(shouldWriteAuditEvent('member_removed')).toBe(true);
    expect(shouldWriteAuditEvent('member_role_changed')).toBe(true);
    expect(shouldWriteAuditEvent('finding_assigned')).toBe(true);
    expect(shouldWriteAuditEvent('ai.task_started')).toBe(true);
    expect(shouldWriteAuditEvent('ai.task_completed')).toBe(true);
    expect(shouldWriteAuditEvent('ai.task_failed')).toBe(true);
    expect(shouldWriteAuditEvent('ai.output_rejected')).toBe(true);
    expect(shouldWriteAuditEvent('ai.safety_blocked')).toBe(true);
    expect(shouldWriteAuditEvent('view.loaded')).toBe(false);
  });
});
