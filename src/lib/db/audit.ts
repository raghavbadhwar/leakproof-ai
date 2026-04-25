import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { redactAuditMetadata, shouldWriteAuditEvent } from '../audit/auditEvents';

export async function writeAuditEvent(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorUserId: string;
    eventType: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!shouldWriteAuditEvent(input.eventType)) {
    return;
  }

  const { error } = await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: redactAuditMetadata(input.metadata ?? {})
  });

  if (error) {
    throw new Error('Failed to write audit event.');
  }
}
