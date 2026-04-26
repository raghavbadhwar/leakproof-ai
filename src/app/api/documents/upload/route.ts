import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { uploadMetadataSchema } from '@/lib/api/schemas';
import { handleApiError, jsonError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { findOrCreateCustomer, resolveCustomerForUpload } from '@/lib/db/customers';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { chunkCsvRows, chunkTextDocument, type DocumentChunk } from '@/lib/ingest/chunking';
import { parseCustomerCsv, parseInvoiceCsv, parseUsageCsv } from '@/lib/ingest/csv';
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
      customer_id: form.get('customer_id') || undefined,
      customer_external_id: form.get('customer_external_id') || undefined,
      customer_name: form.get('customer_name') || undefined,
      domain: form.get('domain') || undefined
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
    const customerAssignment =
      metadata.document_type === 'contract'
        ? await resolveCustomerForUpload(supabase, {
            organizationId: metadata.organization_id,
            customerId: metadata.customer_id,
            externalId: metadata.customer_external_id,
            name: metadata.customer_name,
            domain: metadata.domain
          })
        : { customerId: null, matchedBy: 'unassigned' as const, confidence: 0, reviewNeeded: false };

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
        customer_id: customerAssignment.customerId,
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
        document_type: metadata.document_type,
        customer_id: customerAssignment.customerId,
        customer_match_method: customerAssignment.matchedBy,
        customer_match_confidence: customerAssignment.confidence,
        customer_review_needed: customerAssignment.reviewNeeded
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

    if (metadata.document_type === 'customer_csv') {
      const records = parseCustomerCsv(bytes.toString('utf8'));
      await ingestCustomerRecords(supabase, {
        organizationId: metadata.organization_id,
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
        parse_status: ['contract', 'invoice_csv', 'usage_csv', 'customer_csv'].includes(metadata.document_type) ? 'parsed' : 'pending',
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
      eventType: 'customer.assignment_changed',
      entityType: 'source_document',
      entityId: document.id,
      metadata: {
        previous_customer_id: null,
        new_customer_id: customerAssignment.customerId,
        match_method: customerAssignment.matchedBy,
        match_confidence: customerAssignment.confidence,
        review_needed: customerAssignment.reviewNeeded
      }
    });

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
        storage_path: storagePath,
        customer_id: customerAssignment.customerId,
        customer_match_method: customerAssignment.matchedBy,
        customer_review_needed: customerAssignment.reviewNeeded
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
    input.records.map(async (record) => {
      const customerAssignment = await findOrCreateCustomer(supabase, {
        organizationId: input.organizationId,
        externalId: record.customerExternalId,
        name: record.customerName,
        segment: record.customerSegment,
        billingModel: record.billingModel,
        contractType: record.contractType,
        contractValueMinor: record.contractValueMinor,
        currency: record.currency,
        renewalDate: record.renewalDate,
        ownerLabel: record.ownerLabel,
        domain: record.domain
      });
      return {
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        customer_id: customerAssignment.customerId,
        source_document_id: input.sourceDocumentId,
        invoice_id: record.invoiceId,
        invoice_date: record.invoiceDate,
        line_item: record.lineItem,
        quantity: record.quantity,
        unit_price_minor: record.unitPriceMinor,
        amount_minor: record.amountMinor,
        currency: record.currency,
        billing_model: record.billingModel,
        product_label: record.productLabel,
        team_label: record.teamLabel,
        service_period_start: record.servicePeriodStart,
        service_period_end: record.servicePeriodEnd,
        row_citation: record.citation
      };
    })
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
    input.records.map(async (record) => {
      const customerAssignment = await findOrCreateCustomer(supabase, {
        organizationId: input.organizationId,
        externalId: record.customerExternalId,
        name: record.customerName,
        segment: record.customerSegment,
        billingModel: record.billingModel,
        contractType: record.contractType,
        contractValueMinor: record.contractValueMinor,
        renewalDate: record.renewalDate,
        ownerLabel: record.ownerLabel,
        domain: record.domain
      });
      return {
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        customer_id: customerAssignment.customerId,
        source_document_id: input.sourceDocumentId,
        period_start: record.periodStart,
        period_end: record.periodEnd,
        metric_name: record.metricName,
        quantity: record.quantity,
        product_label: record.productLabel,
        team_label: record.teamLabel,
        row_citation: record.citation
      };
    })
  );

  if (rows.length > 0) {
    const { error } = await supabase.from('usage_records').insert(rows);
    if (error) throw error;
  }
}

async function ingestCustomerRecords(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    organizationId: string;
    records: ReturnType<typeof parseCustomerCsv>;
  }
) {
  for (const record of input.records) {
    await findOrCreateCustomer(supabase, {
      organizationId: input.organizationId,
      externalId: record.customerExternalId,
      name: record.customerName,
      segment: record.customerSegment,
      billingModel: record.billingModel,
      contractType: record.contractType,
      contractValueMinor: record.contractValueMinor,
      currency: record.currency,
      renewalDate: record.renewalDate,
      ownerLabel: record.ownerLabel,
      domain: record.domain
    });
  }
}
