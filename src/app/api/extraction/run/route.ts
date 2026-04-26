import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { runExtractionSchema } from '@/lib/api/schemas';
import { handleApiError, jsonError } from '@/lib/api/responses';
import { extractContractTerms } from '@/lib/agents/contractExtractor';
import { buildContractTermLogicalKey } from '@/lib/audit/runVersions';
import { sanitizeOperationalErrorMessage } from '@/lib/audit/auditEvents';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { findOrCreateCustomer } from '@/lib/db/customers';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { extractDocumentText } from '@/lib/ingest/documentText';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = runExtractionSchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, body.workspace_id, REVIEWER_WRITE_ROLES);
    enforceRateLimit({
      key: `extraction:${auth.userId}:${body.organization_id}:${body.workspace_id}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });
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

    const { data: latestRun, error: latestRunError } = await supabase
      .from('extraction_runs')
      .select('run_version')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', body.workspace_id)
      .eq('source_document_id', document.id)
      .order('run_version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRunError) throw latestRunError;

    const { data: extractionRun, error: extractionRunError } = await supabase
      .from('extraction_runs')
      .insert({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        source_document_id: document.id,
        provider: 'gemini',
        model: 'pending',
        model_version: null,
        prompt_version: 'pending',
        status: 'processing',
        run_version: Number(latestRun?.run_version ?? 0) + 1,
        terms_created: 0,
        created_by: auth.userId,
        started_at: new Date().toISOString()
      })
      .select('id, run_version')
      .single();
    if (extractionRunError) throw extractionRunError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'extraction_run_started',
      entityType: 'extraction_run',
      entityId: extractionRun.id,
      metadata: {
        source_document_id: document.id,
        run_version: extractionRun.run_version,
        provider: 'gemini'
      }
    });

    try {
      const { count: previousCompletedRuns, error: previousRunsError } = await supabase
        .from('extraction_runs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', body.workspace_id)
        .eq('source_document_id', document.id)
        .eq('status', 'completed')
        .neq('id', extractionRun.id);
      if (previousRunsError) throw previousRunsError;

      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, source_label, content, chunk_index')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', body.workspace_id)
        .eq('source_document_id', document.id)
        .order('chunk_index', { ascending: true });
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
      const resolvedCustomerId =
        document.customer_id ??
        (await resolveCustomerFromExtraction(supabase, {
          organizationId: body.organization_id,
          actorUserId: auth.userId,
          sourceDocumentId: document.id,
          extraction
        }));

      const { error: runMetadataError } = await supabase
        .from('extraction_runs')
        .update({
          provider: extraction.provenance.provider,
          model: extraction.provenance.model,
          model_version: extraction.provenance.modelVersion,
          prompt_version: extraction.provenance.promptVersion
        })
        .eq('id', extractionRun.id)
        .eq('organization_id', body.organization_id);
      if (runMetadataError) throw runMetadataError;

      let terms: Array<{ id: string; term_type: string; confidence: number; review_status: string }> = [];
      const stagedTerms = Array.from(
        new Map(
          extraction.terms.map((term) => {
            const logicalKey = buildContractTermLogicalKey({
              termType: term.term_type,
              termValue: term.normalized_value,
              sourceDocumentId: document.id,
              citation: term.citation
            });
            return [logicalKey, { term, logicalKey }] as const;
          })
        ).values()
      );

      if (stagedTerms.length > 0) {
        const { data, error: insertError } = await supabase
          .from('contract_terms')
          .insert(
            stagedTerms.map(({ term, logicalKey }) => ({
              organization_id: body.organization_id,
              workspace_id: body.workspace_id,
              customer_id: resolvedCustomerId,
              source_document_id: document.id,
              extraction_run_id: extractionRun.id,
              is_active: false,
              logical_key: logicalKey,
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
        terms = data ?? [];
      }

      const { error: completeRunError } = await supabase.rpc('complete_extraction_run', {
        p_run_id: extractionRun.id,
        p_organization_id: body.organization_id,
        p_workspace_id: body.workspace_id,
        p_source_document_id: document.id,
        p_terms_created: terms.length
      });
      if (completeRunError) throw completeRunError;

      if ((previousCompletedRuns ?? 0) > 0) {
        await writeAuditEvent(supabase, {
          organizationId: body.organization_id,
          actorUserId: auth.userId,
          eventType: 'run_superseded',
          entityType: 'extraction_run',
          entityId: extractionRun.id,
          metadata: {
            run_kind: 'extraction',
            superseded_run_count: previousCompletedRuns ?? 0,
            source_document_id: document.id
          }
        });
      }

      await writeAuditEvent(supabase, {
        organizationId: body.organization_id,
        actorUserId: auth.userId,
        eventType: 'extraction_run_completed',
        entityType: 'extraction_run',
        entityId: extractionRun.id,
        metadata: {
          terms_created: terms.length,
          provider: extraction.provenance.provider,
          model: extraction.provenance.model,
          prompt_version: extraction.provenance.promptVersion
        }
      });

      return NextResponse.json({ status: 'completed', run_id: extractionRun.id, terms });
    } catch (runError) {
      await supabase
        .from('extraction_runs')
        .update({
          status: 'failed',
          error_message: sanitizeOperationalErrorMessage(runError, 'Extraction run failed.'),
          completed_at: new Date().toISOString()
        })
        .eq('id', extractionRun.id)
        .eq('organization_id', body.organization_id);

      await writeAuditEvent(supabase, {
        organizationId: body.organization_id,
        actorUserId: auth.userId,
        eventType: 'extraction_run_failed',
        entityType: 'extraction_run',
        entityId: extractionRun.id,
        metadata: {
          source_document_id: document.id,
          reason: sanitizeOperationalErrorMessage(runError, 'Extraction run failed.')
        }
      });

      throw runError;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

async function resolveCustomerFromExtraction(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  input: {
    organizationId: string;
    actorUserId: string;
    sourceDocumentId: string;
    extraction: Awaited<ReturnType<typeof extractContractTerms>>;
  }
): Promise<string | null> {
  const customerName = readCustomerName(input.extraction);
  if (!customerName) return null;

  const customerAssignment = await findOrCreateCustomer(supabase, {
    organizationId: input.organizationId,
    name: customerName
  });
  if (!customerAssignment.customerId) return null;

  await supabase
    .from('source_documents')
    .update({ customer_id: customerAssignment.customerId, updated_at: new Date().toISOString() })
    .eq('id', input.sourceDocumentId)
    .eq('organization_id', input.organizationId)
    .is('customer_id', null);

  await writeAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventType: 'customer.assignment_changed',
    entityType: 'source_document',
    entityId: input.sourceDocumentId,
    metadata: {
      previous_customer_id: null,
      new_customer_id: customerAssignment.customerId,
      match_method: customerAssignment.matchedBy,
      match_confidence: customerAssignment.confidence,
      review_needed: customerAssignment.reviewNeeded,
      source: 'contract_extraction'
    }
  });

  return customerAssignment.customerId;
}

function readCustomerName(extraction: Awaited<ReturnType<typeof extractContractTerms>>): string | null {
  const customerNameTerm = extraction.terms.find((term) => term.term_type === 'customer_name');
  if (!customerNameTerm) return null;

  const normalized = customerNameTerm.normalized_value;
  const candidate =
    typeof normalized === 'string'
      ? normalized
      : hasTextValue(normalized)
        ? normalized.text
        : typeof customerNameTerm.value === 'string'
          ? customerNameTerm.value
          : null;

  return cleanCustomerName(candidate) || null;
}

function cleanCustomerName(value: string | null): string {
  return (value ?? '')
    .replace(/^\s*(customer|client|account)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTextValue(value: unknown): value is { text: string } {
  return isRecord(value) && 'text' in value && typeof value.text === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
