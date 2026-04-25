import { NextResponse } from 'next/server';
import { runExtractionSchema } from '@/lib/api/schemas';
import { handleApiError, jsonError } from '@/lib/api/responses';
import { extractContractTerms } from '@/lib/agents/contractExtractor';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { extractDocumentText } from '@/lib/ingest/documentText';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = runExtractionSchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, body.workspace_id, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data: document, error: documentError } = await supabase
      .from('source_documents')
      .select('id, organization_id, workspace_id, customer_id, document_type, file_name, storage_path, mime_type')
      .eq('id', body.source_document_id)
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', body.workspace_id)
      .single();

    if (documentError) throw documentError;
    if (document.document_type !== 'contract') {
      return jsonError('Only contract documents can be extracted.', 400);
    }

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'extraction.started',
      entityType: 'source_document',
      entityId: document.id,
      metadata: { provider: 'gemini' }
    });

    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, source_label, content')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', body.workspace_id)
      .eq('source_document_id', document.id)
      .order('chunk_index', { ascending: true })
      .limit(8);
    if (chunksError) throw chunksError;

    let contractText = (chunks ?? []).map((chunk) => chunk.content).join('\n\n').trim();
    if (!contractText) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('source-documents')
        .download(document.storage_path);
      if (downloadError) throw downloadError;

      const extracted = await extractDocumentText({
        bytes: Buffer.from(await fileData.arrayBuffer()),
        mimeType: document.mime_type,
        fileName: document.file_name
      });
      contractText = extracted.text;
    }

    const extraction = await extractContractTerms({
      contractText,
      sourceDocumentId: document.id,
      retrievedContext: (chunks ?? []).map((chunk) => ({
        chunkId: chunk.id,
        label: chunk.source_label,
        text: chunk.content
      }))
    });

    const { data: extractionRun, error: extractionRunError } = await supabase
      .from('extraction_runs')
      .insert({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        source_document_id: document.id,
        provider: extraction.provenance.provider,
        model: extraction.provenance.model,
        model_version: extraction.provenance.modelVersion,
        prompt_version: extraction.provenance.promptVersion,
        status: 'completed',
        terms_created: extraction.terms.length,
        created_by: auth.userId,
        completed_at: new Date().toISOString()
      })
      .select('id')
      .single();
    if (extractionRunError) throw extractionRunError;

    const { data: terms, error: insertError } = await supabase
      .from('contract_terms')
      .insert(
        extraction.terms.map((term) => ({
          organization_id: body.organization_id,
          workspace_id: body.workspace_id,
          customer_id: document.customer_id,
          source_document_id: document.id,
          term_type: term.term_type,
          term_value: term.normalized_value,
          original_term_value: term.normalized_value,
          citation: term.citation,
          confidence: term.confidence,
          review_status: term.needs_review ? 'needs_review' : 'extracted',
          provider: extraction.provenance.provider,
          model: extraction.provenance.model,
          model_version: extraction.provenance.modelVersion,
          prompt_version: extraction.provenance.promptVersion
        }))
      )
      .select('id, term_type, confidence, review_status');

    if (insertError) throw insertError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'extraction.completed',
      entityType: 'extraction_run',
      entityId: extractionRun.id,
      metadata: {
        terms_created: terms?.length ?? 0,
        provider: extraction.provenance.provider,
        model: extraction.provenance.model,
        prompt_version: extraction.provenance.promptVersion
      }
    });

    return NextResponse.json({ status: 'completed', terms });
  } catch (error) {
    return handleApiError(error);
  }
}
