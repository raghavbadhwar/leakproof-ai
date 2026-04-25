export type SearchableChunk = {
  id: string;
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  content: string;
  sourceLabel: string;
  embedding: number[];
};

export type RankedChunk = {
  chunk: SearchableChunk;
  score: number;
};

export function rankChunksBySimilarity(input: {
  organizationId: string;
  workspaceId: string;
  queryEmbedding: number[];
  chunks: SearchableChunk[];
  limit: number;
}): RankedChunk[] {
  return input.chunks
    .filter((chunk) => chunk.organizationId === input.organizationId && chunk.workspaceId === input.workspaceId)
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(input.queryEmbedding, chunk.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}

export function toRagContext(results: RankedChunk[]): string {
  return results
    .map(({ chunk, score }) =>
      [`Chunk ID: ${chunk.id}`, `Source: ${chunk.sourceLabel}`, `Similarity: ${score.toFixed(4)}`, chunk.content].join('\n')
    )
    .join('\n\n');
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error('Cannot compare embeddings with different dimensions.');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
