import 'server-only';

import { normalizeContractExtraction } from './contractExtractionNormalizer';
import { buildContractExtractionPasses, mergeContractExtractions } from './contractExtractionStrategy';
import type { ContractExtraction } from './contractSchema';
import { generateGeminiJson, type GeminiProvenance } from '../ai/geminiClient';

const CONTRACT_EXTRACTION_PROMPT_VERSION = 'contract-extraction-v3-full-document-gemini';

export async function extractContractTerms(input: {
  contractText: string;
  sourceDocumentId: string;
  retrievedContext?: Array<{ chunkId: string; label: string; text: string }>;
}): Promise<ContractExtraction & { provenance: GeminiProvenance }> {
  const sourceLabelsById = Object.fromEntries(input.retrievedContext?.map((chunk) => [chunk.chunkId, chunk.label]) ?? []);
  const passes = buildContractExtractionPasses({
    contractText: input.contractText,
    chunks: input.retrievedContext
  });
  if (passes.length === 0) {
    return {
      terms: [],
      provenance: emptyProvenance()
    };
  }

  const passResults = [];
  for (const pass of passes) {
    passResults.push(
      await generateGeminiJson<ContractExtraction>({
        promptVersion: CONTRACT_EXTRACTION_PROMPT_VERSION,
        systemInstruction: extractionSystemInstruction(),
        prompt: [
          `Source document ID: ${input.sourceDocumentId}`,
          `Extraction pass: ${pass.passIndex + 1} of ${passes.length}`,
          'Extract only terms supported by this pass. Duplicate terms across passes will be merged by code.',
          '',
          pass.chunks.length ? 'Contract chunks:' : 'Contract text:',
          pass.text
        ].join('\n')
      })
    );
  }

  const mergedExtraction = mergeContractExtractions(
    passResults.map((result) =>
      normalizeContractExtraction(result.data, {
        sourceDocumentId: input.sourceDocumentId,
        sourceLabelsById
      })
    )
  );
  const provenance = passResults[passResults.length - 1]?.provenance ?? emptyProvenance();
  return {
    ...mergedExtraction,
    provenance
  };
}

function extractionSystemInstruction(): string {
  return [
    'You extract commercial contract terms for revenue leakage review.',
    'Return only JSON with a top-level terms array.',
    'Do not calculate leakage amounts.',
    'Do not guess missing terms; mark uncertain terms as needs_review.',
    'Every term must include citation, citation.excerpt, source_excerpt, confidence, needs_review, and reasoning_summary.',
    'Citations must point to the provided source document or chunk IDs.',
    'When a chunk label includes a page or image label, copy that exact label into citation.label.',
    'normalized_value must use deterministic typed shapes, for example money uses amountMinor and currency, dates use ISO YYYY-MM-DD, percentages use percent, payment terms use dueDays, and unresolved values use kind="unresolved" with rawText and reason.',
    'If a value or citation is incomplete, set needs_review true.'
  ].join(' ');
}

function emptyProvenance(): GeminiProvenance {
  return {
    provider: 'gemini',
    model: 'not-run',
    promptVersion: CONTRACT_EXTRACTION_PROMPT_VERSION
  };
}
