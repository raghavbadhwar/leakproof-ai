import { NextResponse } from 'next/server';
import { semanticSearchSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { embedGeminiContent } from '@/lib/ai/geminiClient';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { hashContent } from '@/lib/ingest/chunking';

export const runtime = 'nodejs';

type SearchRow = {
  chunk_id: string;
  source_document_id: string;
  source_label: string;
  content: string;
  similarity: number;
};

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = semanticSearchSchema.parse(await request.json());
    const auth = await requireWorkspaceMember(request, body.organization_id, workspaceId);
    const supabase = createSupabaseServiceClient();
    const embedding = await embedGeminiContent({ content: body.query, taskType: 'RETRIEVAL_QUERY' });

    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: vectorLiteral(embedding.values),
      match_organization_id: body.organization_id,
      match_workspace_id: workspaceId,
      match_count: body.limit
    });
    if (error) throw error;

    const results = ((data ?? []) as SearchRow[]).map((row) => ({
      chunk_id: row.chunk_id,
      source_document_id: row.source_document_id,
      source_label: row.source_label,
      content: row.content,
      similarity: Number(row.similarity)
    }));

    await supabase.from('semantic_search_logs').insert({
      organization_id: body.organization_id,
      workspace_id: workspaceId,
      actor_user_id: auth.userId,
      provider: embedding.provenance.provider,
      model: embedding.provenance.model,
      dimension: embedding.provenance.dimension,
      query_hash: hashContent(body.query),
      result_count: results.length
    });

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'semantic_search.ran',
      entityType: 'audit_workspace',
      entityId: workspaceId,
      metadata: {
        search_hash: hashContent(body.query),
        result_count: results.length
      }
    });

    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}
