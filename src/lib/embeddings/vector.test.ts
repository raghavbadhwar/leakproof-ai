import { describe, expect, it } from 'vitest';
import { assertVectorDimension, buildEmbeddingRecord } from './vector';

describe('embedding vector helpers', () => {
  it('rejects vectors that do not match the configured dimension', () => {
    expect(assertVectorDimension([0.1, 0.2], 2)).toEqual([0.1, 0.2]);
    expect(() => assertVectorDimension([0.1], 2)).toThrow(/dimension/i);
  });

  it('stores embedding provenance metadata with chunk references', () => {
    const record = buildEmbeddingRecord({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      sourceDocumentId: 'doc_1',
      chunkId: 'chunk_1',
      contentHash: 'hash',
      values: [0.1, 0.2],
      model: 'gemini-embedding-2-preview',
      dimension: 2,
      taskType: 'RETRIEVAL_DOCUMENT'
    });

    expect(record).toMatchObject({
      provider: 'gemini',
      model: 'gemini-embedding-2-preview',
      dimension: 2,
      task_type: 'RETRIEVAL_DOCUMENT'
    });
  });
});
