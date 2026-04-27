import { describe, expect, it, vi } from 'vitest';
import { writeAuditEvent } from './audit';

vi.mock('server-only', () => ({}));

describe('audit event persistence', () => {
  it('stores redacted metadata instead of raw excerpts and prompts', async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from(table: string) {
        expect(table).toBe('audit_events');
        return {
          async insert(row: unknown) {
            inserts.push(row);
            return { error: null };
          }
        };
      }
    };

    await writeAuditEvent(supabase as never, {
      organizationId: 'org_1',
      actorUserId: 'user_1',
      eventType: 'report.generated',
      entityType: 'evidence_pack',
      entityId: 'pack_1',
      metadata: {
        prompt: 'raw prompt',
        excerpt: 'raw evidence excerpt',
        model_response: 'raw model response',
        raw_contract_text: 'raw contract text',
        safe_count: 2
      }
    });

    expect(inserts).toEqual([
      {
        organization_id: 'org_1',
        actor_user_id: 'user_1',
        event_type: 'report.generated',
        entity_type: 'evidence_pack',
        entity_id: 'pack_1',
        metadata: {
          prompt: '[redacted]',
          excerpt: '[redacted]',
          model_response: '[redacted]',
          raw_contract_text: '[redacted]',
          safe_count: 2
        }
      }
    ]);
  });
});
