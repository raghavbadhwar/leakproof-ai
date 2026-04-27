import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const actionId = '44444444-4444-4444-8444-444444444444';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('Copilot action confirmation route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('confirms and executes a controlled action through existing workflow runners', async () => {
    const operations = mockActionRouteDependencies('reviewer');
    const route = await import('./route');

    const response = await route.POST(jsonRequest('confirm'), {
      params: Promise.resolve({ workspaceId, actionId })
    });
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.action.status).toBe('executed');
    expect(payload.result.status).toBe('executed');
    expect(operations.updatedActions[0]).toEqual(expect.objectContaining({
      status: 'confirmed',
      confirmed_by: 'reviewer-user'
    }));
    expect(operations.updatedActions[1]).toEqual(expect.objectContaining({
      status: 'executed',
      executed_by: 'reviewer-user'
    }));
    expect(operations.writeAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'copilot.action_confirmed',
      entityType: 'assistant_action',
      entityId: actionId
    }));
    expect(operations.auditInserts).toContainEqual(expect.objectContaining({
      event_type: 'copilot.action_executed',
      entity_type: 'assistant_action',
      entity_id: actionId
    }));
  });

  it('re-checks role before confirming', async () => {
    const operations = mockActionRouteDependencies('viewer');
    const route = await import('./route');

    const response = await route.POST(jsonRequest('confirm'), {
      params: Promise.resolve({ workspaceId, actionId })
    });

    expect(response.status).toBe(403);
    expect(operations.updatedActions).toEqual([]);
    expect(operations.writeAuditEvent).not.toHaveBeenCalled();
  });
});

function mockActionRouteDependencies(role: 'reviewer' | 'viewer') {
  const operations: {
    updatedActions: Record<string, unknown>[];
    auditInserts: Record<string, unknown>[];
    writeAuditEvent: ReturnType<typeof vi.fn>;
  } = {
    updatedActions: [],
    auditInserts: [],
    writeAuditEvent: vi.fn()
  };

  vi.doMock('@/lib/api/responses', () => ({
    handleApiError: (error: unknown) => {
      if (error instanceof Error && error.message === 'forbidden') {
        return Response.json({ error: 'You do not have access to this organization.' }, { status: 403 });
      }
      if (error instanceof Error && error.message === 'action_not_pending') {
        return Response.json({ error: 'That Copilot action is no longer pending.' }, { status: 409 });
      }
      return Response.json({ error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }));
  vi.doMock('@/lib/db/auth', () => ({
    requireWorkspaceMember: vi.fn(async () => ({
      userId: 'reviewer-user',
      organizationId,
      role
    }))
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => fakeSupabase(operations))
  }));
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: operations.writeAuditEvent
  }));
  vi.doMock('@/lib/copilot/actions', () => ({
    loadAssistantAction: vi.fn(async () => actionRecord()),
    confirmPendingCopilotAction: vi.fn(async (_supabase: unknown, input: { actorUserId: string; actorRole: string }) => {
      if (input.actorRole !== 'reviewer') throw new Error('forbidden');
      operations.updatedActions.push({
        status: 'confirmed',
        confirmed_by: input.actorUserId
      });
      return {
        ...actionRecord(),
        status: 'confirmed',
        confirmed_by: input.actorUserId
      };
    }),
    executeConfirmedCopilotAction: vi.fn(async (_supabase: unknown, input: {
      action: ReturnType<typeof actionRecord>;
      actorUserId: string;
      runners: { runReconciliation: (args: { organizationId: string }) => Promise<unknown> };
    }) => {
      await input.runners.runReconciliation({ organizationId });
      operations.updatedActions.push({
        status: 'executed',
        executed_by: input.actorUserId
      });
      operations.auditInserts.push({
        event_type: 'copilot.action_executed',
        entity_type: 'assistant_action',
        entity_id: actionId
      });
      return {
        action: {
          ...input.action,
          status: 'executed',
          executed_by: input.actorUserId
        },
        result: {
          status: 'executed',
          summary: 'Action executed through guarded route.'
        }
      };
    }),
    actionCardFromRecord: vi.fn((record: { status: string }) => ({ status: record.status }))
  }));
  vi.doMock('@/lib/copilot/schema', async () => {
    const { z } = await import('zod');
    return {
      copilotActionTransitionRequestSchema: z.object({
        organization_id: z.string().uuid()
      })
    };
  });
  vi.doMock('@/app/api/extraction/run/route', () => ({
    POST: vi.fn(async () => Response.json({ status: 'completed', run_id: '77777777-7777-4777-8777-777777777777', terms: [] }))
  }));
  vi.doMock('@/app/api/reconciliation/run/route', () => ({
    POST: vi.fn(async () => Response.json({ status: 'completed', run_id: '77777777-7777-4777-8777-777777777777', findings: [{ id: findingId }] }))
  }));
  vi.doMock('@/app/api/workspaces/[workspaceId]/report/route', () => ({
    POST: vi.fn(async () => Response.json({ report: { includedFindings: [] }, evidence_pack_id: null }))
  }));
  vi.doMock('@/app/api/findings/[id]/recovery-note/route', () => ({
    POST: vi.fn(async () => Response.json({
      recovery_note: { internalNote: 'Safe draft', warnings: [] },
      draft_id: null,
      persisted: false,
      customer_facing_enabled: false
    }))
  }));
  vi.doMock('@/app/api/workspaces/[workspaceId]/contract-hierarchy/resolve/route', () => ({
    POST: vi.fn(async () => Response.json({
      resolution: {},
      relationships_inserted: 0,
      terms_marked_needs_review: 0,
      approved_terms_left_unchanged: 0
    }))
  }));

  return operations;
}

function fakeSupabase(operations: { updatedActions: Record<string, unknown>[]; auditInserts: Record<string, unknown>[] }) {
  return {
    from(table: string) {
      const base = chain({ data: null, error: null });
      if (table === 'audit_events') {
        return {
          ...base,
          insert(payload: Record<string, unknown>) {
            operations.auditInserts.push(payload);
            return chain({ data: null, error: null });
          }
        };
      }
      if (table !== 'assistant_actions') return base;
      return {
        ...base,
        select: () => chain({ data: actionRecord(), error: null }),
        update(payload: Record<string, unknown>) {
          operations.updatedActions.push(payload);
          return chain({ data: { ...actionRecord(), ...payload }, error: null });
        }
      };
    }
  };
}

function chain(result: { data: unknown; error: unknown }) {
  const passthrough = (...args: unknown[]) => {
    void args;
    return chain(result);
  };
  return {
    select: passthrough,
    insert: passthrough,
    update: passthrough,
    eq: passthrough,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
  };
}

function actionRecord() {
  return {
    id: actionId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    thread_id: '55555555-5555-4555-8555-555555555555',
    message_id: '66666666-6666-4666-8666-666666666666',
    action_type: 'prepare_run_reconciliation',
    target_entity_type: 'workspace',
    target_entity_id: workspaceId,
    status: 'pending',
    risk_level: 'high',
    required_role: 'reviewer',
    payload_refs: {},
    preview: {
      title: 'Prepare reconciliation run',
      description: 'Prepare a confirmation to run deterministic reconciliation for this workspace.',
      what_will_change: ['A deterministic reconciliation run will start after confirmation.'],
      blockers: []
    },
    proposed_by: 'reviewer-user',
    confirmed_by: null,
    cancelled_by: null,
    executed_by: null,
    result_summary: null,
    result_refs: {},
    failure_code: null,
    expires_at: '2026-04-28T00:00:00.000Z',
    created_at: '2026-04-27T00:00:00.000Z',
    confirmed_at: null,
    cancelled_at: null
  };
}

function jsonRequest(target: string): Request {
  return new Request(`https://leakproof.test/api/workspaces/${workspaceId}/copilot/actions/${actionId}/${target}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organization_id: organizationId })
  });
}
