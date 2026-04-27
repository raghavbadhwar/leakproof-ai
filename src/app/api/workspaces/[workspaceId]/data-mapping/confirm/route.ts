import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { dataMappingConfirmRequestSchema, fieldsForDocumentType } from '@/lib/ai/dataMappingSchema';
import { handleApiError, jsonError } from '@/lib/api/responses';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { DataMappingValidationError, parseMappedCsvPreview } from '@/lib/ingest/csvMapping';

export const runtime = 'nodejs';

type SourceDocumentDraft = {
  id: string;
  document_type: string;
  storage_path: string;
};

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = dataMappingConfirmRequestSchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, workspaceId, REVIEWER_WRITE_ROLES);

    await enforceRateLimit({
      key: `data-mapping-confirm:${auth.userId}:${body.organization_id}:${workspaceId}`,
      limit: 20,
      windowMs: 10 * 60 * 1000
    });

    const csvText = body.csv_text ?? await loadDraftCsvText({
      organizationId: body.organization_id,
      workspaceId,
      sourceDocumentId: body.source_document_id,
      documentType: body.document_type
    });
    if (!csvText) return jsonError('CSV text or a draft source document reference is required.', 400);

    const parsePreview = parseMappedCsvPreview({
      csv: csvText,
      documentType: body.document_type,
      mapping: body.confirmed_mapping,
      context: {
        sourceDocumentId: body.source_document_id ?? 'mapping_preview',
        workspaceId
      }
    });

    return NextResponse.json({
      document_type: body.document_type,
      canonical_headers: fieldsForDocumentType(body.document_type),
      parse_preview: parsePreview
    });
  } catch (error) {
    if (error instanceof DataMappingValidationError) return jsonError(error.message, 400);
    if (error instanceof Error && (/^CSV row \d+/.test(error.message) || /^Invalid /.test(error.message) || /^CSV is missing/.test(error.message))) {
      return jsonError(safeCsvParseError(error.message), 422);
    }
    return handleApiError(error);
  }
}

async function loadDraftCsvText(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId?: string;
  documentType: string;
}): Promise<string | null> {
  if (!input.sourceDocumentId) return null;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('source_documents')
    .select('id, document_type, storage_path')
    .eq('organization_id', input.organizationId)
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.sourceDocumentId)
    .single();
  if (error) throw error;
  const document = data as SourceDocumentDraft;
  if (document.document_type !== input.documentType) {
    throw new DataMappingValidationError('Draft document type does not match the confirmed mapping.');
  }
  const { data: fileData, error: storageError } = await supabase.storage.from('source-documents').download(document.storage_path);
  if (storageError) throw storageError;
  return fileData.text();
}

function safeCsvParseError(message: string): string {
  return message.replace(/: .+$/, '.');
}
