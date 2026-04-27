import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

describe('workspace Copilot route security', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests before creating a service client', async () => {
    mockRouteDependencies('unauthorized');
    const route = await import('./route');

    const response = await route.POST(jsonRequest(), { params: Promise.resolve({ workspaceId }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication is required.' });
  });

  it('rejects cross-org workspace access before creating a service client', async () => {
    mockRouteDependencies('forbidden');
    const route = await import('./route');

    const response = await route.POST(jsonRequest(), { params: Promise.resolve({ workspaceId }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'You do not have access to this organization.' });
  });

  it('stores only safe summaries and tool-call references for Gemini answers', async () => {
    const operations = mockSuccessfulRouteDependencies();
    const route = await import('./route');

    const response = await route.POST(jsonRequest({
      organization_id: organizationId,
      message: 'FULL_RAW_PROMPT_SHOULD_NOT_STORE Raw contract text says Acme owes invoice row 123.',
      selected_finding_id: '33333333-3333-4333-8333-333333333333'
    }), { params: Promise.resolve({ workspaceId }) });
    const payload = await response.json();
    const stored = JSON.stringify(operations);

    expect(response.status).toBe(200);
    expect(payload.answer).toBe('Gemini safe read-only answer.');
    expect(operations.assistantMessages).toHaveLength(2);
    expect(operations.assistantToolCalls).toHaveLength(2);
    expect(stored).not.toContain('FULL_RAW_PROMPT_SHOULD_NOT_STORE');
    expect(stored).not.toContain('Raw contract text says');
    expect(stored).not.toContain('raw model output');
    expect(operations.assistantToolCalls[1]).toEqual(expect.objectContaining({
      tool_name: 'gemini_read_only_copilot',
      status: 'completed',
      input_refs: expect.objectContaining({
        prompt_version: 'copilot-read-only-v1',
        user_intent_summary: 'User asked for read-only leakage analytics.'
      }),
      output_refs: expect.objectContaining({
        fallback_used: false
      }),
      error_summary: null
    }));
  });

  it('falls back safely when Gemini generation or validation fails', async () => {
    const operations = mockSuccessfulRouteDependencies({ geminiThrows: true });
    const route = await import('./route');

    const response = await route.POST(jsonRequest({
      organization_id: organizationId,
      message: 'What is total leakage?'
    }), { params: Promise.resolve({ workspaceId }) });
    const payload = await response.json();
    const stored = JSON.stringify(operations);

    expect(response.status).toBe(200);
    expect(payload.answer).toBe('Deterministic fallback answer.');
    expect(payload.suggested_actions).toEqual([]);
    expect(stored).not.toContain('invalid raw Gemini JSON');
    expect(operations.assistantToolCalls[1]).toEqual(expect.objectContaining({
      tool_name: 'gemini_read_only_copilot',
      status: 'failed',
      error_summary: 'Gemini output failed structured validation.'
    }));
  });
});

function mockRouteDependencies(authError: 'unauthorized' | 'forbidden'): void {
  vi.doMock('@/lib/api/rateLimit', () => ({
    enforceRateLimit: vi.fn()
  }));
  vi.doMock('@/lib/api/responses', () => ({
    handleApiError: (error: unknown) => {
      if (error instanceof Error && error.message === 'unauthorized') {
        return Response.json({ error: 'Authentication is required.' }, { status: 401 });
      }
      if (error instanceof Error && error.message === 'forbidden') {
        return Response.json({ error: 'You do not have access to this organization.' }, { status: 403 });
      }
      return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }));
  vi.doMock('@/lib/db/auth', () => ({
    requireWorkspaceMember: vi.fn(async () => {
      throw new Error(authError);
    })
  }));
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: vi.fn()
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => {
      throw new Error('service client should not be created before auth rejection');
    })
  }));
  vi.doMock('@/lib/copilot/context', () => ({
    loadCopilotContext: vi.fn()
  }));
  vi.doMock('@/lib/copilot/schema', async () => {
    const { z } = await import('zod');
    return {
      copilotRequestSchema: z.object({
        organization_id: z.string().uuid(),
        thread_id: z.string().uuid().optional(),
        message: z.string().trim().min(1),
        selected_finding_id: z.string().uuid().optional(),
        selected_report_id: z.string().uuid().optional(),
        mode: z.literal('read_only').optional().default('read_only')
      }),
      copilotResponseSchema: {
        parse: (value: unknown) => value
      }
    };
  });
  vi.doMock('@/lib/copilot/actions', () => ({
    actionCardFromRecord: vi.fn(),
    actionForbiddenAnswer: vi.fn(() => 'forbidden action'),
    actionPreparedAnswer: vi.fn(() => 'prepared action'),
    buildPendingCopilotActionProposal: vi.fn(),
    detectCopilotActionIntent: vi.fn(() => null),
    insertPendingCopilotAction: vi.fn()
  }));
  vi.doMock('@/lib/copilot/tools', () => ({
    buildCopilotAnswer: vi.fn(),
    routeCopilotTools: vi.fn(),
    runCopilotTool: vi.fn()
  }));
  vi.doMock('@/lib/copilot/gemini', () => ({
    buildSafeFallbackCopilotResponse: vi.fn(),
    finalizeCopilotResponsePersistence: vi.fn(),
    geminiToolCallSummary: vi.fn(),
    generateCopilotReadOnlyResponse: vi.fn(),
    safeCopilotGeminiErrorSummary: vi.fn()
  }));
  vi.doMock('@/lib/copilot/prompts', () => ({
    COPILOT_GEMINI_PROMPT_VERSION: 'copilot-read-only-v1'
  }));
  vi.doMock('@/lib/copilot/redaction', () => ({
    collectEntityReferences: vi.fn(() => []),
    summarizeCopilotAssistantForStorage: vi.fn(() => 'assistant summary'),
    summarizeCopilotUserMessageForStorage: vi.fn(() => 'user summary')
  }));
}

function mockSuccessfulRouteDependencies(options: { geminiThrows?: boolean } = {}): {
  assistantThreads: Record<string, unknown>[];
  assistantMessages: Record<string, unknown>[];
  assistantToolCalls: Record<string, unknown>[];
} {
  const operations = {
    assistantThreads: [] as Record<string, unknown>[],
    assistantMessages: [] as Record<string, unknown>[],
    assistantToolCalls: [] as Record<string, unknown>[]
  };

  vi.doMock('@/lib/api/rateLimit', () => ({
    enforceRateLimit: vi.fn()
  }));
  vi.doMock('@/lib/api/responses', () => ({
    handleApiError: () => Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }));
  vi.doMock('@/lib/db/auth', () => ({
    requireWorkspaceMember: vi.fn(async () => ({
      userId: 'reviewer-user',
      organizationId,
      role: 'reviewer'
    }))
  }));
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: vi.fn()
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => fakeSupabase(operations))
  }));
  vi.doMock('@/lib/copilot/context', () => ({
    loadCopilotContext: vi.fn(async () => ({ ok: true }))
  }));
  vi.doMock('@/lib/copilot/schema', async () => import('../../../../../lib/copilot/schema'));
  vi.doMock('@/lib/copilot/actions', () => ({
    actionCardFromRecord: vi.fn(),
    actionForbiddenAnswer: vi.fn(() => 'forbidden action'),
    actionPreparedAnswer: vi.fn(() => 'prepared action'),
    buildPendingCopilotActionProposal: vi.fn(),
    detectCopilotActionIntent: vi.fn(() => null),
    insertPendingCopilotAction: vi.fn()
  }));
  vi.doMock('@/lib/copilot/tools', () => ({
    routeCopilotTools: vi.fn(() => [
      {
        toolName: 'getAnalyticsSummary',
        input: { organization_id: organizationId, workspace_id: workspaceId }
      }
    ]),
    runCopilotTool: vi.fn(() => ({
      toolName: 'getAnalyticsSummary',
      inputRefs: { organization_id: organizationId, workspace_id: workspaceId },
      output: {
        currency: 'USD',
        total_customer_facing_leakage_minor: 175_000,
        internal_unapproved_exposure_minor: 900_000
      },
      outputRefs: { tool_name: 'getAnalyticsSummary' }
    }))
  }));
  vi.doMock('@/lib/copilot/gemini', () => ({
    buildSafeFallbackCopilotResponse: vi.fn(() => copilotResponse('Deterministic fallback answer.')),
    finalizeCopilotResponsePersistence: vi.fn((response: Record<string, unknown>, persisted: Record<string, unknown>) => ({
      ...response,
      thread_id: persisted.thread_id,
      persisted
    })),
    geminiToolCallSummary: vi.fn((input: { fallbackUsed: boolean; errorSummary?: string | null }) => ({
      provider: 'gemini',
      prompt_version: 'copilot-read-only-v1',
      fallback_used: input.fallbackUsed,
      error_summary: input.errorSummary ?? null
    })),
    generateCopilotReadOnlyResponse: vi.fn(async () => {
      if (options.geminiThrows) {
        throw new Error('invalid raw Gemini JSON should not be stored');
      }
      return {
        response: copilotResponse('Gemini safe read-only answer.'),
        provenance: {
          provider: 'gemini',
          model: 'gemini-test',
          modelVersion: 'test-version',
          promptVersion: 'copilot-read-only-v1'
        }
      };
    }),
    safeCopilotGeminiErrorSummary: vi.fn(() => 'Gemini output failed structured validation.')
  }));
  vi.doMock('@/lib/copilot/prompts', () => ({
    COPILOT_GEMINI_PROMPT_VERSION: 'copilot-read-only-v1'
  }));
  vi.doMock('@/lib/copilot/redaction', () => ({
    collectEntityReferences: vi.fn((input: { organizationId: string; workspaceId: string; threadId?: string; selectedFindingId?: string }) => [
      { type: 'organization', id: input.organizationId },
      { type: 'workspace', id: input.workspaceId },
      ...(input.threadId ? [{ type: 'thread', id: input.threadId }] : []),
      ...(input.selectedFindingId ? [{ type: 'finding', id: input.selectedFindingId }] : [])
    ]),
    summarizeCopilotAssistantForStorage: vi.fn(() => 'Read-only Copilot response generated with tools: getAnalyticsSummary.'),
    summarizeCopilotUserMessageForStorage: vi.fn(() => 'User asked for read-only leakage analytics.')
  }));

  return operations;
}

function fakeSupabase(operations: {
  assistantThreads: Record<string, unknown>[];
  assistantMessages: Record<string, unknown>[];
  assistantToolCalls: Record<string, unknown>[];
}) {
  return {
    from(table: string) {
      if (table === 'assistant_threads') return assistantThreadsBuilder(operations);
      if (table === 'assistant_messages') return assistantMessagesBuilder(operations);
      if (table === 'assistant_tool_calls') return assistantToolCallsBuilder(operations);
      return chain({ data: null, error: null });
    }
  };
}

function assistantThreadsBuilder(operations: { assistantThreads: Record<string, unknown>[] }) {
  return {
    ...chain({ data: { id: '44444444-4444-4444-8444-444444444444' }, error: null }),
    insert(payload: Record<string, unknown>) {
      operations.assistantThreads.push(payload);
      return chain({ data: { id: '44444444-4444-4444-8444-444444444444' }, error: null });
    }
  };
}

function assistantMessagesBuilder(operations: { assistantMessages: Record<string, unknown>[] }) {
  return {
    insert(payload: Record<string, unknown>) {
      operations.assistantMessages.push(payload);
      const id = operations.assistantMessages.length === 1
        ? '55555555-5555-4555-8555-555555555555'
        : '66666666-6666-4666-8666-666666666666';
      return chain({ data: { id }, error: null });
    }
  };
}

function assistantToolCallsBuilder(operations: { assistantToolCalls: Record<string, unknown>[] }) {
  return {
    insert(payload: Record<string, unknown>[]) {
      operations.assistantToolCalls.push(...payload);
      return chain({ data: null, error: null });
    }
  };
}

function chain(result: { data: unknown; error: unknown }) {
  return {
    select: () => chain(result),
    insert: () => chain(result),
    eq: () => chain(result),
    single: async () => result,
    maybeSingle: async () => result,
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };
}

function copilotResponse(answer: string) {
  return {
    mode: 'read_only',
    thread_id: null,
    routed_tool_names: ['getAnalyticsSummary'],
    answer_type: 'direct_answer',
    answer,
    data: {
      getAnalyticsSummary: {
        currency: 'USD',
        total_customer_facing_leakage_minor: 175_000,
        internal_unapproved_exposure_minor: 900_000
      }
    },
    warnings: [],
    suggested_actions: [],
    action_cards: [],
    persisted: {
      thread_id: null,
      user_message_id: null,
      assistant_message_id: null
    }
  };
}

function jsonRequest(body: { organization_id: string; message: string; selected_finding_id?: string } = {
  organization_id: organizationId,
  message: 'What is total leakage?'
}): Request {
  return new Request(`https://leakproof.test/api/workspaces/${workspaceId}/copilot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
