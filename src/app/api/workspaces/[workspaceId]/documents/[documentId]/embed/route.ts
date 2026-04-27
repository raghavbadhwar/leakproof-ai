import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { workspaceScopedBodySchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { validateAiConfig } from '@/lib/ai/config';
import { embedGeminiContent } from '@/lib/ai/geminiClient';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { assertSourceDocumentBelongsToWorkspace } from '@/lib/db/boundaries';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; documentId: string }> }) {
  try {
    const { workspaceId, documentId } = await context.params;
    const body = workspaceScopedBodySchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, workspaceId, REVIEWER_WRITE_ROLES);
    await enforceRateLimit({
      key: `embedding:${auth.userId}:${body.organization_id}:${workspaceId}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });
    const supabase = createSupabaseServiceClient();
    await assertSourceDocumentBelongsToWorkspace(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      documentId
    });
    const aiConfig = validateAiConfig(getServerEnv());

    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, source_document_id, content, content_hash, source_label')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', workspaceId)
      .eq('source_document_id', documentId)
      .order('chunk_index', { ascending: true });
    if (chunksError) throw chunksError;

    const { data: job, error: jobError } = await supabase
      .from('embedding_jobs')
      .insert({
        organization_id: body.organization_id,
        workspace_id: workspaceId,
        source_document_id: documentId,
        provider: 'gemini',
        model: aiConfig.embedding.model,
        dimension: aiConfig.embedding.dimension,
        task_type: 'RETRIEVAL_DOCUMENT',
        status: 'running',
        chunks_total: chunks?.length ?? 0,
        created_by: auth.userId
      })
      .select('id')
      .single();
    if (jobError) throw jobError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'embedding.started',
      entityType: 'source_document',
      entityId: documentId,
      metadata: { chunks_total: chunks?.length ?? 0, model: aiConfig.embedding.model }
    });

    let embeddedCount = 0;
    for (const chunk of chunks ?? []) {
      const embedding = await embedGeminiContent({
        content: chunk.content,
        taskType: 'RETRIEVAL_DOCUMENT',
        title: chunk.source_label
      });

      const { error: upsertError } = await supabase.from('document_embeddings').upsert(
        {
          organization_id: body.organization_id,
          workspace_id: workspaceId,
          source_document_id: chunk.source_document_id,
          document_chunk_id: chunk.id,
          embedding_job_id: job.id,
          provider: embedding.provenance.provider,
          model: embedding.provenance.model,
          dimension: embedding.provenance.dimension,
          task_type: embedding.provenance.taskType,
          content_hash: chunk.content_hash,
          embedding: vectorLiteral(embedding.values)
        },
        { onConflict: 'document_chunk_id,model,dimension,task_type,content_hash' }
      );
      if (upsertError) throw upsertError;
      embeddedCount += 1;
    }

    await supabase
      .from('embedding_jobs')
      .update({
        status: 'completed',
        chunks_embedded: embeddedCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)
      .eq('organization_id', body.organization_id);

    await supabase
      .from('source_documents')
      .update({ embedding_status: embeddedCount > 0 ? 'embedded' : 'unsupported', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', workspaceId);

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'embedding.completed',
      entityType: 'source_document',
      entityId: documentId,
      metadata: { chunks_embedded: embeddedCount, model: aiConfig.embedding.model }
    });

    return NextResponse.json({ embedding_job_id: job.id, chunks_embedded: embeddedCount });
  } catch (error) {
    return handleApiError(error);
  }
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}
