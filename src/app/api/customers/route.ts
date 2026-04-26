import { NextResponse } from 'next/server';
import { createCustomerSchema, customerQuerySchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireOrganizationMember, requireOrganizationRole } from '@/lib/db/auth';
import { findOrCreateCustomer } from '@/lib/db/customers';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = customerQuerySchema.parse({
      organization_id: url.searchParams.get('organization_id')
    });
    await requireOrganizationMember(request, query.organization_id);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('customers')
      .select('id, external_id, name, domain, segment, billing_model, contract_type, owner_label, renewal_date, created_at')
      .eq('organization_id', query.organization_id)
      .order('name', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ customers: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createCustomerSchema.parse(await request.json());
    const auth = await requireOrganizationRole(request, body.organization_id, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const assignment = await findOrCreateCustomer(supabase, {
      organizationId: body.organization_id,
      externalId: body.customer_external_id,
      name: body.customer_name,
      domain: body.domain
    });

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'customer.assignment_changed',
      entityType: 'customer',
      entityId: assignment.customerId ?? undefined,
      metadata: {
        match_method: assignment.matchedBy,
        match_confidence: assignment.confidence,
        review_needed: assignment.reviewNeeded,
        source: 'customer_api'
      }
    });

    return NextResponse.json({ customer_id: assignment.customerId, assignment });
  } catch (error) {
    return handleApiError(error);
  }
}
