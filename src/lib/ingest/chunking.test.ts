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

  it('creates page-aware chunks from scanned PDF page maps', () => {
    const chunks = chunkTextDocument({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      sourceDocumentId: 'doc_1',
      modality: 'pdf',
      text: 'flattened fallback text',
      extractionConfidence: 0.88,
      pageMap: [
        { page: 4, text: ['Section 4. Minimum commitment is USD 12,000 per month.', '', 'Section 5. Payment terms are Net 30.'].join('\n'), confidence: 0.91 }
      ]
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      modality: 'pdf',
      sourceLabel: 'Page 4, chunk 1',
      sourceLocator: { page: 4, chunk: 1, confidence: 0.91 }
    });
    expect(chunks[1]).toMatchObject({
      chunkIndex: 1,
      sourceLabel: 'Page 4, chunk 2',
      sourceLocator: { page: 4, chunk: 2, confidence: 0.91 }
    });
  });

  it('uses image labels and confidence for image extractions', () => {
    const chunks = chunkTextDocument({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      sourceDocumentId: 'doc_1',
      modality: 'image',
      text: 'Image extraction says the discount is 20% until 2026-03-31.',
      extractionConfidence: 0.76
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      modality: 'image',
      sourceLabel: 'Image 1',
      sourceLocator: { image: 1, chunk: 1, extraction: 'Image extraction', confidence: 0.76 }
    });
  });

  it('falls back to paragraph labels when no page map is available for text PDFs', () => {
    const chunks = chunkTextDocument({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      sourceDocumentId: 'doc_1',
      modality: 'pdf',
      text: 'Section 1. Text-based PDF extraction kept normal text.'
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      modality: 'pdf',
      sourceLabel: 'paragraph 1',
      sourceLocator: { paragraph: 1 }
    });
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
