import { NextResponse } from 'next/server';
import { assignDocumentCustomerSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { resolveCustomerForUpload } from '@/lib/db/customers';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const body = assignDocumentCustomerSchema.parse(await request.json());
    const supabase = createSupabaseServiceClient();

    const { data: document, error: documentError } = await supabase
      .from('source_documents')
      .select('id, organization_id, workspace_id, customer_id, document_type')
      .eq('id', documentId)
      .eq('organization_id', body.organization_id)
      .single();
    if (documentError) throw documentError;

    const auth = await requireWorkspaceRole(request, body.organization_id, document.workspace_id, REVIEWER_WRITE_ROLES);
    const assignment = await resolveCustomerForUpload(supabase, {
      organizationId: body.organization_id,
      customerId: body.customer_id,
      externalId: body.customer_external_id,
      name: body.customer_name,
      domain: body.domain
    });

    const { data: updatedDocument, error: updateError } = await supabase
      .from('source_documents')
      .update({
        customer_id: assignment.customerId,
        updated_at: new Date().toISOString()
      })
      .eq('id', document.id)
      .eq('organization_id', body.organization_id)
      .select('id, customer_id')
      .single();
    if (updateError) throw updateError;

    if (document.document_type === 'contract') {
      const { error: termsError } = await supabase
        .from('contract_terms')
        .update({
          customer_id: assignment.customerId,
          updated_at: new Date().toISOString()
        })
        .eq('source_document_id', document.id)
        .eq('organization_id', body.organization_id)
        .eq('is_active', true);
      if (termsError) throw termsError;
    }

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'customer.assignment_changed',
      entityType: 'source_document',
      entityId: document.id,
      metadata: {
        previous_customer_id: document.customer_id,
        new_customer_id: assignment.customerId,
        match_method: assignment.matchedBy,
        match_confidence: assignment.confidence,
        review_needed: assignment.reviewNeeded,
        source: 'document_assignment_api'
      }
    });

    return NextResponse.json({ document: updatedDocument, assignment });
  } catch (error) {
    return handleApiError(error);
  }
}
