import type { ContractExtraction } from './contractSchema';

export type ContractExtractionChunk = {
  chunkId: string;
  label: string;
  text: string;
};

export type ContractExtractionPass = {
  passIndex: number;
  chunks: ContractExtractionChunk[];
  text: string;
};

const DEFAULT_MAX_PASS_CHARACTERS = 24_000;

export function buildContractExtractionPasses(input: {
  contractText: string;
  chunks?: ContractExtractionChunk[];
  maxPassCharacters?: number;
}): ContractExtractionPass[] {
  const maxPassCharacters = input.maxPassCharacters ?? DEFAULT_MAX_PASS_CHARACTERS;
  const chunks = input.chunks?.filter((chunk) => chunk.text.trim().length > 0) ?? [];

  if (chunks.length === 0) {
    const text = input.contractText.trim();
    return text ? [{ passIndex: 0, chunks: [], text }] : [];
  }

  const passes: ContractExtractionPass[] = [];
  let currentChunks: ContractExtractionChunk[] = [];
  let currentText = '';

  for (const chunk of chunks) {
    const formattedChunk = formatChunkForExtraction(chunk);
    const separator = currentText ? '\n\n' : '';
    const wouldExceed = currentText.length > 0 && currentText.length + separator.length + formattedChunk.length > maxPassCharacters;

    if (wouldExceed) {
      passes.push({ passIndex: passes.length, chunks: currentChunks, text: currentText });
      currentChunks = [];
      currentText = '';
    }

    currentChunks.push(chunk);
    currentText = [currentText, formattedChunk].filter(Boolean).join('\n\n');
  }

  if (currentText) {
    passes.push({ passIndex: passes.length, chunks: currentChunks, text: currentText });
  }

  return passes;
}

export function mergeContractExtractions(extractions: ContractExtraction[]): ContractExtraction {
  const termsByKey = new Map<string, ContractExtraction['terms'][number]>();

  for (const extraction of extractions) {
    for (const term of extraction.terms) {
      const key = dedupeKey(term);
      const existing = termsByKey.get(key);
      if (!existing || rankTerm(term) > rankTerm(existing)) {
        termsByKey.set(key, term);
      }
    }
  }

  return { terms: Array.from(termsByKey.values()) };
}

function formatChunkForExtraction(chunk: ContractExtractionChunk): string {
  return [`Chunk ID: ${chunk.chunkId}`, `Label: ${chunk.label}`, chunk.text].join('\n');
}

function dedupeKey(term: ContractExtraction['terms'][number]): string {
  return [
    term.term_type,
    stableStringify(term.normalized_value),
    term.citation.sourceId,
    normalizeText(term.source_excerpt)
  ].join('|');
}

function rankTerm(term: ContractExtraction['terms'][number]): number {
  return term.confidence + (term.needs_review ? 0 : 1);
}

function stableStringify(value: unknown): string {
  if (!isRecord(value)) return JSON.stringify(value);
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = value[key];
        return accumulator;
      }, {})
  );
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
