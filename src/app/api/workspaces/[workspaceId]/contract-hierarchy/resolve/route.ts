import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { handleApiError } from '@/lib/api/responses';
import { uuidSchema } from '@/lib/api/schemas';
import { aiTaskCompletedEvent, aiTaskFailedEvent, aiTaskStartedEvent } from '@/lib/audit/aiEvents';
import {
  buildContractHierarchyAuditSummary,
  CONTRACT_HIERARCHY_PROMPT_VERSION,
  resolveContractHierarchy,
  type ContractHierarchyResolution
} from '@/lib/ai/contractHierarchy';
import { generateGeminiJson } from '@/lib/ai/geminiClient';
import { planContractHierarchyReview } from '@/lib/agents/contractHierarchyAgent';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

const resolveContractHierarchyRequestSchema = z.object({
  organization_id: uuidSchema,
  customer_id: uuidSchema
});

type SourceDocumentRow = {
  id: string;
  customer_id: string | null;
  document_type: string;
  file_name: string;
  created_at: string;
};

type ContractTermRow = {
  id: string;
  customer_id: string | null;
  source_document_id: string;
  term_type: string;
  term_value: unknown;
  citation: { label?: string | null; excerpt?: string | null } | null;
  confidence: number;
  review_status: string;
};

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const supabase = createSupabaseServiceClient();
  let auditContext:
    | {
        organizationId: string;
        workspaceId: string;
        customerId: string;
        actorUserId: string;
      }
    | null = null;

  try {
    const { workspaceId } = await context.params;
    const parsedWorkspaceId = uuidSchema.parse(workspaceId);
    const body = resolveContractHierarchyRequestSchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, parsedWorkspaceId, REVIEWER_WRITE_ROLES);
    auditContext = {
      organizationId: body.organization_id,
      workspaceId: parsedWorkspaceId,
      customerId: body.customer_id,
      actorUserId: auth.userId
    };

    await enforceRateLimit({
      key: `contract-hierarchy:${auth.userId}:${body.organization_id}:${parsedWorkspaceId}:${body.customer_id}`,
      limit: 8,
      windowMs: 10 * 60 * 1000
    });

    await writeAiAuditEvent(
      aiTaskStartedEvent({
        organizationId: body.organization_id,
        workspaceId: parsedWorkspaceId,
        taskType: 'contract_hierarchy_resolution',
        entityReferences: [
          { type: 'workspace', id: parsedWorkspaceId },
          { type: 'customer', id: body.customer_id }
        ],
        safeSummary: 'Contract hierarchy resolution started.',
        safetyFlags: ['human_approval_required', 'code_calculates_money', 'advisory_only', 'no_external_action']
      }),
      auth.userId,
      body.organization_id
    );

    const [documentsResult, termsResult] = await Promise.all([
      supabase
        .from('source_documents')
        .select('id, customer_id, document_type, file_name, created_at')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', parsedWorkspaceId)
        .eq('customer_id', body.customer_id)
        .eq('document_type', 'contract')
        .order('created_at', { ascending: true }),
      supabase
        .from('contract_terms')
        .select('id, customer_id, source_document_id, term_type, term_value, citation, confidence, review_status')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', parsedWorkspaceId)
        .eq('customer_id', body.customer_id)
        .eq('is_active', true)
        .neq('review_status', 'rejected')
        .order('created_at', { ascending: true })
    ]);

    if (documentsResult.error) throw documentsResult.error;
    if (termsResult.error) throw termsResult.error;

    const documents = (documentsResult.data ?? []) as SourceDocumentRow[];
    const terms = (termsResult.data ?? []) as ContractTermRow[];
    const resolution = await resolveContractHierarchy(
      {
        customerId: body.customer_id,
        documents: documents.map((document, index) => ({
          id: document.id,
          customerId: document.customer_id,
          documentType: document.document_type,
          safeLabel: `Contract document ${index + 1}`,
          createdAt: document.created_at,
          fileNameHint: document.file_name
        })),
        terms: terms.map((term) => ({
          id: term.id,
          customerId: term.customer_id,
          sourceDocumentId: term.source_document_id,
          termType: term.term_type,
          value: term.term_value,
          citation: term.citation,
          confidence: Number(term.confidence),
          reviewStatus: term.review_status
        }))
      },
      async ({ prompt, systemInstruction }) => {
        const result = await generateGeminiJson<unknown>({
          prompt,
          systemInstruction,
          promptVersion: CONTRACT_HIERARCHY_PROMPT_VERSION
        });
        return result.data;
      }
    );

    const relationshipsInserted = await replaceContractDocumentRelationships({
      organizationId: body.organization_id,
      workspaceId: parsedWorkspaceId,
      customerId: body.customer_id,
      resolution
    });
    const reviewPlan = planContractHierarchyReview({
      resolution,
      terms: terms.map((term) => ({ id: term.id, reviewStatus: term.review_status }))
    });
    const termsMarkedNeedsReview = await markTermsNeedsReview({
      organizationId: body.organization_id,
      workspaceId: parsedWorkspaceId,
      termIds: reviewPlan.termsToMarkNeedsReview
    });

    await writeAiAuditEvent(
      aiTaskCompletedEvent({
        organizationId: body.organization_id,
        workspaceId: parsedWorkspaceId,
        taskType: 'contract_hierarchy_resolution',
        entityReferences: [
          { type: 'workspace', id: parsedWorkspaceId },
          { type: 'customer', id: body.customer_id }
        ],
        safeSummary: 'Contract hierarchy resolution completed.',
        safetyFlags: ['schema_validated', 'human_approval_required', 'code_calculates_money', 'advisory_only', 'no_external_action']
      }),
      auth.userId,
      body.organization_id,
      buildContractHierarchyAuditSummary({
        customerId: body.customer_id,
        documentCount: documents.length,
        termCount: terms.length,
        resolution
      })
    );

    return NextResponse.json({
      resolution,
      relationships_inserted: relationshipsInserted,
      terms_marked_needs_review: termsMarkedNeedsReview,
      approved_terms_left_unchanged: reviewPlan.approvedTermsLeftUnchanged
    });
  } catch (error) {
    if (auditContext) {
      await writeAiAuditEvent(
        aiTaskFailedEvent({
          organizationId: auditContext.organizationId,
          workspaceId: auditContext.workspaceId,
          taskType: 'contract_hierarchy_resolution',
          entityReferences: [
            { type: 'workspace', id: auditContext.workspaceId },
            { type: 'customer', id: auditContext.customerId }
          ],
          safeSummary: 'Contract hierarchy resolution failed before advisory output could be saved.',
          safetyFlags: ['human_approval_required', 'code_calculates_money', 'advisory_only', 'no_external_action'],
          errorCode: 'contract_hierarchy_failed'
        }),
        auditContext.actorUserId,
        auditContext.organizationId
      ).catch(() => undefined);
    }
    return handleApiError(error);
  }
}

async function replaceContractDocumentRelationships(input: {
  organizationId: string;
  workspaceId: string;
  customerId: string;
  resolution: ContractHierarchyResolution;
}): Promise<number> {
  const { error: deleteError } = await supabaseClient()
    .from('contract_document_relationships')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('workspace_id', input.workspaceId)
    .eq('customer_id', input.customerId);
  if (deleteError) throw deleteError;

  const rows = input.resolution.relationships.map((relationship) => ({
    organization_id: input.organizationId,
    workspace_id: input.workspaceId,
    customer_id: input.customerId,
    source_document_id: relationship.sourceDocumentId,
    related_source_document_id: relationship.relatedSourceDocumentId,
    relationship_type: relationship.relationshipType,
    effective_date: relationship.effectiveDate ?? null,
    confidence: relationship.confidence,
    citation: relationship.citation
      ? {
          source_document_id: relationship.citation.sourceDocumentId,
          label: relationship.citation.label
        }
      : {}
  }));

  if (rows.length === 0) return 0;
  const { error } = await supabaseClient().from('contract_document_relationships').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function markTermsNeedsReview(input: {
  organizationId: string;
  workspaceId: string;
  termIds: string[];
}): Promise<number> {
  if (input.termIds.length === 0) return 0;

  const { data, error } = await supabaseClient()
    .from('contract_terms')
    .update({
      review_status: 'needs_review',
      reviewer_note: 'Contract hierarchy resolver flagged this term for human precedence review.',
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', input.organizationId)
    .eq('workspace_id', input.workspaceId)
    .eq('is_active', true)
    .in('id', input.termIds)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

async function writeAiAuditEvent(
  payload: ReturnType<typeof aiTaskStartedEvent>,
  actorUserId: string,
  organizationId: string,
  extraMetadata: Record<string, unknown> = {}
): Promise<void> {
  await writeAuditEvent(supabaseClient(), {
    organizationId,
    actorUserId,
    eventType: payload.eventType,
    entityType: payload.entityType,
    entityId: payload.entityId,
    metadata: {
      ...payload.metadata,
      ...extraMetadata
    }
  });
}

function supabaseClient() {
  return createSupabaseServiceClient();
}
