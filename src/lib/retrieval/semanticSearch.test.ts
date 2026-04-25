import { describe, expect, it } from 'vitest';
import { rankChunksBySimilarity, toRagContext } from './semanticSearch';

const chunks = [
  {
    id: 'chunk_a',
    organizationId: 'org_1',
    workspaceId: 'workspace_1',
    sourceDocumentId: 'doc_1',
    content: 'Annual uplift is 8 percent after the first year.',
    sourceLabel: 'Section 4',
    embedding: [1, 0]
  },
  {
    id: 'chunk_b',
    organizationId: 'org_2',
    workspaceId: 'workspace_2',
    sourceDocumentId: 'doc_2',
    content: 'Payment due net 30.',
    sourceLabel: 'Section 8',
    embedding: [0, 1]
  }
];

describe('semantic retrieval helpers', () => {
  it('ranks only chunks in the requested tenant scope', () => {
    const results = rankChunksBySimilarity({
      organizationId: 'org_1',
      workspaceId: 'workspace_1',
      queryEmbedding: [1, 0],
      chunks,
      limit: 5
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe('chunk_a');
    expect(results[0]?.score).toBeGreaterThan(0.99);
  });

  it('assembles RAG context with chunk IDs and source labels', () => {
    const context = toRagContext([
      {
        chunk: chunks[0]!,
        score: 0.98
      }
    ]);

    expect(context).toContain('chunk_a');
    expect(context).toContain('Section 4');
  });
});
