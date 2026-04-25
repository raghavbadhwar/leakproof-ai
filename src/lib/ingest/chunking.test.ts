import { describe, expect, it } from 'vitest';
import { chunkCsvRows, chunkTextDocument } from './chunking';

describe('document chunking', () => {
  it('creates deterministic citation-ready text chunks with hashes', () => {
    const chunks = chunkTextDocument({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      sourceDocumentId: 'doc_1',
      text: ['Section 1. Base fee is USD 5,000 per month.', '', 'Section 2. Annual uplift is 8%.'].join('\n')
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      modality: 'text',
      sourceLabel: 'paragraph 1'
    });
    expect(chunks[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves CSV row labels and column names', () => {
    const chunks = chunkCsvRows({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      sourceDocumentId: 'doc_1',
      csv: ['invoice_id,amount,currency', 'INV-001,5000,USD'].join('\n'),
      labelPrefix: 'invoices.csv'
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sourceLabel).toBe('invoices.csv row 2');
    expect(chunks[0]?.content).toContain('invoice_id: INV-001');
  });
});
