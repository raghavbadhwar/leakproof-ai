export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';

export function assertVectorDimension(values: number[], expectedDimension: number): number[] {
  if (values.length !== expectedDimension) {
    throw new Error(`Embedding dimension mismatch: expected ${expectedDimension}, received ${values.length}.`);
  }

  return values;
}

export function buildEmbeddingRecord(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  chunkId: string;
  contentHash: string;
  values: number[];
  model: string;
  dimension: number;
  taskType: EmbeddingTaskType;
}) {
  return {
    organization_id: input.organizationId,
    workspace_id: input.workspaceId,
    source_document_id: input.sourceDocumentId,
    document_chunk_id: input.chunkId,
    provider: 'gemini' as const,
    model: input.model,
    dimension: input.dimension,
    task_type: input.taskType,
    content_hash: input.contentHash,
    embedding: assertVectorDimension(input.values, input.dimension)
  };
}
