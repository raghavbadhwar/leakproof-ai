import 'server-only';

import { contractExtractionSchema, type ContractExtraction } from './contractSchema';
import { generateGeminiJson, type GeminiProvenance } from '../ai/geminiClient';

const CONTRACT_EXTRACTION_PROMPT_VERSION = 'contract-extraction-v2-gemini';

export async function extractContractTerms(input: {
  contractText: string;
  sourceDocumentId: string;
  retrievedContext?: Array<{ chunkId: string; label: string; text: string }>;
}): Promise<ContractExtraction & { provenance: GeminiProvenance }> {
  const result = await generateGeminiJson<ContractExtraction>({
    promptVersion: CONTRACT_EXTRACTION_PROMPT_VERSION,
    systemInstruction: [
      'You extract commercial contract terms for revenue leakage review.',
      'Return only JSON with a top-level terms array.',
      'Do not calculate leakage amounts.',
      'Do not guess missing terms; mark uncertain terms as needs_review.',
      'Every term must include citation, source_excerpt, confidence, needs_review, and reasoning_summary.',
      'Citations must point to the provided source document or retrieved chunk IDs.'
    ].join(' '),
    prompt: [
      `Source document ID: ${input.sourceDocumentId}`,
      '',
      input.retrievedContext?.length ? formatRetrievedContext(input.retrievedContext) : 'Retrieved context: none supplied.',
      '',
      'Contract text:',
      input.contractText
    ].join('\n')
  });

  return {
    ...contractExtractionSchema.parse(result.data),
    provenance: result.provenance
  };
}

function formatRetrievedContext(context: Array<{ chunkId: string; label: string; text: string }>): string {
  return [
    'Retrieved context candidates:',
    ...context.map((chunk) => [`Chunk ID: ${chunk.chunkId}`, `Label: ${chunk.label}`, chunk.text].join('\n'))
  ].join('\n\n');
}
