import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { getServerEnv } from '../env';
import { validateAiConfig } from '../ai/config';
import { parseGeminiJsonResponse } from '../ai/gemini';

export type ExtractedDocumentText = {
  text: string;
  modality: 'text' | 'pdf' | 'image';
  confidence?: number;
  pageMap?: Array<{ page: number; text: string; confidence?: number }>;
};

export const SCANNED_EXTRACTION_MIN_CONFIDENCE = 0.55;
export const SCANNED_EXTRACTION_LOW_CONFIDENCE_ERROR = 'scanned_document_low_confidence';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

const multimodalExtractionSchema = z.object({
  text: z.string().min(20),
  confidence: z.number().min(0).max(1).optional(),
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1),
        text: z.string().min(1),
        confidence: z.number().min(0).max(1).optional()
      })
    )
    .optional()
});

export async function extractDocumentText(input: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<ExtractedDocumentText> {
  if (input.mimeType === 'text/plain') {
    return {
      text: assertUsableText(input.bytes.toString('utf8')),
      modality: 'text'
    };
  }

  if (input.mimeType === 'application/pdf' || input.fileName.toLowerCase().endsWith('.pdf')) {
    try {
      return {
        text: await extractPdfText(input.bytes),
        modality: 'pdf'
      };
    } catch {
      return extractTextWithGeminiMultimodal(input, 'pdf');
    }
  }

  if (input.mimeType === DOCX_MIME_TYPE || input.fileName.toLowerCase().endsWith('.docx')) {
    return {
      text: await extractDocxText(input.bytes),
      modality: 'text'
    };
  }

  if (IMAGE_MIME_TYPES.has(input.mimeType)) {
    return extractTextWithGeminiMultimodal(input, 'image');
  }

  throw new Error('unsupported_document_parser');
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText({
        pageJoiner: '\n\n',
        parseHyperlinks: false
      });
      return assertUsableText(result.text);
    } finally {
      await parser.destroy();
    }
  } catch {
    throw new Error('document_parse_failed');
  }
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: bytes });
    return assertUsableText(result.value);
  } catch {
    throw new Error('document_parse_failed');
  }
}

async function extractTextWithGeminiMultimodal(
  input: { bytes: Buffer; mimeType: string; fileName: string },
  modality: 'pdf' | 'image'
): Promise<ExtractedDocumentText> {
  try {
    const env = getServerEnv();
    const config = validateAiConfig(env);
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: config.generation.fastModel,
      contents: [
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.bytes.toString('base64')
          }
        },
        {
          text: [
            'Extract readable commercial contract text from this file.',
            'Return strict JSON with text, confidence from 0 to 1, and pages with page-level text when page boundaries are available.',
            'Preserve section labels, table text, amounts, dates, customer names, billing terms, and citation-friendly page references.',
            'Do not summarize and do not invent missing text.'
          ].join(' ')
        }
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        systemInstruction: 'You are a contract ingestion engine. Extract source text faithfully for later human review.'
      }
    });

    const parsed = multimodalExtractionSchema.parse(parseGeminiJsonResponse(response.text));
    const normalizedText = assertUsableText(parsed.text);
    const extracted = {
      text: normalizedText,
      modality,
      confidence: parsed.confidence,
      pageMap: parsed.pages?.map((page) => ({
        page: page.page,
        text: page.text,
        confidence: page.confidence
      }))
    };
    assertScannedExtractionConfidence(extracted);
    return extracted;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('scanned_document_requires_ocr');
    }
    if (isLowConfidenceScannedExtractionError(error)) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('environment')) {
      throw error;
    }
    throw new Error('document_parse_failed');
  }
}

export function assertScannedExtractionConfidence(extracted: ExtractedDocumentText): void {
  const decision = evaluateScannedExtractionConfidence(extracted);
  if (!decision.ok) {
    throw new Error(SCANNED_EXTRACTION_LOW_CONFIDENCE_ERROR);
  }
}

export function evaluateScannedExtractionConfidence(extracted: ExtractedDocumentText): {
  ok: boolean;
  confidence?: number;
  threshold?: number;
} {
  if (extracted.modality !== 'pdf' && extracted.modality !== 'image') {
    return { ok: true };
  }

  const confidence = extracted.confidence ?? minimumPageConfidence(extracted.pageMap);
  if (confidence === undefined) {
    return { ok: true };
  }

  return {
    ok: confidence >= SCANNED_EXTRACTION_MIN_CONFIDENCE,
    confidence,
    threshold: SCANNED_EXTRACTION_MIN_CONFIDENCE
  };
}

export function isLowConfidenceScannedExtractionError(error: unknown): boolean {
  return error instanceof Error && error.message === SCANNED_EXTRACTION_LOW_CONFIDENCE_ERROR;
}

function minimumPageConfidence(pageMap: ExtractedDocumentText['pageMap']): number | undefined {
  const confidences = pageMap?.map((page) => page.confidence).filter((confidence): confidence is number => typeof confidence === 'number' && Number.isFinite(confidence));
  if (!confidences || confidences.length === 0) return undefined;
  return Math.min(...confidences);
}

function assertUsableText(text: string): string {
  const normalized = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (normalized.length < 20) {
    throw new Error('empty_document_text');
  }

  return normalized;
}

export function getScannedPdfImageIngestionStrategy() {
  return {
    selectedOption: 'Option B: Gemini file/multimodal ingestion',
    supportedNow: true,
    productionPath: [
      'Detect low-text PDFs and contract images during upload.',
      'Send the original file bytes to Gemini multimodal extraction server-side only.',
      'Validate extracted text and page-level references with Zod before chunking.',
      'Store confidence and page mapping for reviewer-visible citations.',
      'Block scanned extraction when document-level confidence is too low for audit evidence.'
    ],
    reviewerMessage:
      'Scanned PDFs and images use Gemini multimodal extraction so reviewers can see citation-backed evidence before approving terms or findings.'
  };
}
