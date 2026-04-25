import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { uploadMetadataSchema } from '@/lib/api/schemas';
import { handleApiError, jsonError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { chunkCsvRows, chunkTextDocument, type DocumentChunk } from '@/lib/ingest/chunking';
import { parseInvoiceCsv, parseUsageCsv } from '@/lib/ingest/csv';
import { extractDocumentText, type ExtractedDocumentText } from '@/lib/ingest/documentText';
import { buildTenantStoragePath, validateUpload } from '@/lib/uploads/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return jsonError('A file is required.', 400);
    }

    const metadata = uploadMetadataSchema.parse({
      organization_id: form.get('organization_id'),
      workspace_id: form.get('workspace_id'),
      document_type: form.get('document_type'),
      customer_id: form.get('customer_id') || undefined
    });
    const auth = await requireWorkspaceRole(request, metadata.organization_id, metadata.workspace_id, REVIEWER_WRITE_ROLES);

    const validation = validateUpload({
      documentType: metadata.document_type,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    });
    if (!validation.ok) {
      return jsonError(validation.reason, 400);
    }

    const supabase = createSupabaseServiceClient();
    const storagePath = buildTenantStoragePath({
      organizationId: metadata.organization_id,
      workspaceId: metadata.workspace_id,
      documentType: metadata.document_type,
      fileName: file.name
    });
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const extractedContractText =
      metadata.document_type === 'contract'
        ? await extractDocumentText({ bytes, mimeType: file.type, fileName: file.name })
        : null;
    if (metadata.customer_id) {
      await assertCustomerBelongsToOrg(supabase, metadata.organization_id, metadata.customer_id);
    }

    const { error: storageError } = await supabase.storage.from('source-documents').upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false
    });
    if (storageError) throw storageError;

    const { data: document, error: insertError } = await supabase
      .from('source_documents')
      .insert({
        organization_id: metadata.organization_id,
        workspace_id: metadata.workspace_id,
        customer_id: metadata.customer_id,
        document_type: metadata.document_type,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        checksum_sha256: checksum,
        created_by: auth.userId
      })
      .select('id, document_type, file_name, storage_path, parse_status')
      .single();

    if (insertError) throw insertError;

    await writeAuditEvent(supabase, {
      organizationId: metadata.organization_id,
      actorUserId: auth.userId,
      eventType: 'chunking.started',
      entityType: 'source_document',
      entityId: document.id,
      metadata: {
        document_type: metadata.document_type
      }
    });

    const chunks = buildChunksForUploadedDocument({
      organizationId: metadata.organization_id,
      workspaceId: metadata.workspace_id,
      sourceDocumentId: document.id,
      documentType: metadata.document_type,
      fileName: file.name,
      mimeType: file.type,
      content: extractedContractText?.text ?? bytes.toString('utf8'),
      extractedContractText
    });
    await insertDocumentChunks(supabase, chunks);

    if (metadata.document_type === 'invoice_csv') {
      const records = parseInvoiceCsv(bytes.toString('utf8'), { sourceDocumentId: document.id, workspaceId: metadata.workspace_id });
      await ingestInvoiceRecords(supabase, {
        organizationId: metadata.organization_id,
        workspaceId: metadata.workspace_id,
        sourceDocumentId: document.id,
        records
      });
    }

    if (metadata.document_type === 'usage_csv') {
      const records = parseUsageCsv(bytes.toString('utf8'), { sourceDocumentId: document.id, workspaceId: metadata.workspace_id });
      await ingestUsageRecords(supabase, {
        organizationId: metadata.organization_id,
        workspaceId: metadata.workspace_id,
        sourceDocumentId: document.id,
        records
      });
    }

    await writeAuditEvent(supabase, {
      organizationId: metadata.organization_id,
      actorUserId: auth.userId,
      eventType: 'ingestion.completed',
      entityType: 'source_document',
      entityId: document.id,
      metadata: {
        document_type: metadata.document_type,
        chunks_created: chunks.length
      }
    });

    await supabase
      .from('source_documents')
      .update({
        parse_status: ['contract', 'invoice_csv', 'usage_csv'].includes(metadata.document_type) ? 'parsed' : 'pending',
        extracted_text_status: extractedContractText || metadata.document_type.endsWith('_csv') ? 'parsed' : 'unsupported',
        chunking_status: chunks.length > 0 ? 'chunked' : 'unsupported',
        embedding_status: chunks.length > 0 ? 'pending' : 'unsupported',
        updated_at: new Date().toISOString()
      })
      .eq('id', document.id)
      .eq('organization_id', metadata.organization_id);

    await writeAuditEvent(supabase, {
      organizationId: metadata.organization_id,
      actorUserId: auth.userId,
      eventType: 'upload.created',
      entityType: 'source_document',
      entityId: document.id,
      metadata: {
        document_type: metadata.document_type,
        file_name: file.name,
        size_bytes: file.size,
        storage_path: storagePath
      }
    });

    await writeAuditEvent(supabase, {
      organizationId: metadata.organization_id,
      actorUserId: auth.userId,
      eventType: 'chunking.completed',
      entityType: 'source_document',
      entityId: document.id,
      metadata: {
        chunks_created: chunks.length,
        document_type: metadata.document_type
      }
    });

    return NextResponse.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}

function buildChunksForUploadedDocument(input: {
  organizationId: string;
  workspaceId: string;
  sourceDocumentId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  content: string;
  extractedContractText: ExtractedDocumentText | null;
}): DocumentChunk[] {
  if (input.documentType === 'contract' && input.extractedContractText) {
    return chunkTextDocument({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sourceDocumentId: input.sourceDocumentId,
      text: input.content,
      modality: input.extractedContractText.modality
    });
  }

  if (input.documentType === 'invoice_csv' || input.documentType === 'usage_csv') {
    return chunkCsvRows({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sourceDocumentId: input.sourceDocumentId,
      csv: input.content,
      labelPrefix: input.fileName
    });
  }

  return [];
}

async function insertDocumentChunks(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  chunks: DocumentChunk[]
): Promise<void> {
  if (chunks.length === 0) return;

  const { error } = await supabase.from('document_chunks').insert(
    chunks.map((chunk) => ({
      organization_id: chunk.organizationId,
      workspace_id: chunk.workspaceId,
      source_document_id: chunk.sourceDocumentId,
      chunk_index: chunk.chunkIndex,
      modality: chunk.modality,
      content: chunk.content,
      source_label: chunk.sourceLabel,
      source_locator: chunk.sourceLocator,
      content_hash: chunk.contentHash,
      token_estimate: chunk.tokenEstimate
    }))
  );

  if (error) throw error;
}

async function findOrCreateCustomer(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: { organizationId: string; externalId: string; name: string }
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('external_id', input.externalId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('customers')
    .insert({
      organization_id: input.organizationId,
      external_id: input.externalId,
      name: input.name
    })
    .select('id')
    .single();

  if (createError) throw createError;
  return created.id;
}

async function assertCustomerBelongsToOrg(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  customerId: string
): Promise<void> {
  const { data, error } = await supabase.from('customers').select('id').eq('id', customerId).eq('organization_id', organizationId).maybeSingle();

  if (error || !data) {
    throw new Error('forbidden');
  }
}

async function ingestInvoiceRecords(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    organizationId: string;
    workspaceId: string;
    sourceDocumentId: string;
    records: ReturnType<typeof parseInvoiceCsv>;
  }
) {
  const rows = await Promise.all(
    input.records.map(async (record) => ({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      customer_id: await findOrCreateCustomer(supabase, {
        organizationId: input.organizationId,
        externalId: record.customerExternalId,
        name: record.customerName
      }),
      source_document_id: input.sourceDocumentId,
      invoice_id: record.invoiceId,
      invoice_date: record.invoiceDate,
      line_item: record.lineItem,
      quantity: record.quantity,
      unit_price_minor: record.unitPriceMinor,
      amount_minor: record.amountMinor,
      currency: record.currency,
      row_citation: record.citation
    }))
  );

  if (rows.length > 0) {
    const { error } = await supabase.from('invoice_records').insert(rows);
    if (error) throw error;
  }
}

async function ingestUsageRecords(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    organizationId: string;
    workspaceId: string;
    sourceDocumentId: string;
    records: ReturnType<typeof parseUsageCsv>;
  }
) {
  const rows = await Promise.all(
    input.records.map(async (record) => ({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      customer_id: await findOrCreateCustomer(supabase, {
        organizationId: input.organizationId,
        externalId: record.customerExternalId,
        name: record.customerName
      }),
      source_document_id: input.sourceDocumentId,
      period_start: record.periodStart,
      period_end: record.periodEnd,
      metric_name: record.metricName,
      quantity: record.quantity,
      row_citation: record.citation
    }))
  );

  if (rows.length > 0) {
    const { error } = await supabase.from('usage_records').insert(rows);
    if (error) throw error;
  }
}
