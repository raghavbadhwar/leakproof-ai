import { describe, expect, it } from 'vitest';
import {
  SCANNED_EXTRACTION_LOW_CONFIDENCE_ERROR,
  assertScannedExtractionConfidence,
  evaluateScannedExtractionConfidence,
  extractDocumentText,
  getScannedPdfImageIngestionStrategy
} from './documentText';

describe('extractDocumentText', () => {
  it('extracts usable plain text contracts', async () => {
    const result = await extractDocumentText({
      bytes: Buffer.from('Master services agreement\n\nMinimum commitment is $12,000 per month.'),
      mimeType: 'text/plain',
      fileName: 'contract.txt'
    });

    expect(result).toEqual({
      text: 'Master services agreement\n\nMinimum commitment is $12,000 per month.',
      modality: 'text'
    });
  });

  it('rejects empty or unsafe text extraction results', async () => {
    await expect(
      extractDocumentText({
        bytes: Buffer.from('short'),
        mimeType: 'text/plain',
        fileName: 'contract.txt'
      })
    ).rejects.toThrow('empty_document_text');
  });

  it('blocks low-confidence scanned extraction before creating audit chunks', () => {
    expect(() =>
      assertScannedExtractionConfidence({
        text: 'Scanned contract text with uncertain OCR but enough characters.',
        modality: 'pdf',
        confidence: 0.41,
        pageMap: [{ page: 1, text: 'Scanned contract text with uncertain OCR but enough characters.', confidence: 0.41 }]
      })
    ).toThrow(SCANNED_EXTRACTION_LOW_CONFIDENCE_ERROR);
  });

  it('allows scanned extraction without confidence but marks page confidence when available elsewhere', () => {
    const decision = evaluateScannedExtractionConfidence({
      text: 'Readable scanned contract text without a model confidence score.',
      modality: 'image'
    });

    expect(decision.ok).toBe(true);
  });

  it('documents the selected scanned PDF and image production ingestion strategy', () => {
    const strategy = getScannedPdfImageIngestionStrategy();

    expect(strategy.supportedNow).toBe(true);
    expect(strategy.selectedOption).toContain('Gemini');
    expect(strategy.productionPath.join(' ')).toContain('page-level');
    expect(strategy.reviewerMessage).toContain('citation-backed evidence');
  });
});
