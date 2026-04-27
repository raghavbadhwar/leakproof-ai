import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

describe('workspace readiness route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('requires workspace membership before creating a service client', async () => {
    const createSupabaseServiceClient = vi.fn(() => {
      throw new Error('service client should not be created before auth');
    });
    vi.doMock('@/lib/api/responses', () => ({
      handleApiError: (error: unknown) => {
        if (error instanceof Error && error.message === 'unauthorized') {
          return Response.json({ error: 'Authentication is required.' }, { status: 401 });
        }
        return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
    }));
    vi.doMock('@/lib/api/schemas', async () => {
      const { z } = await import('zod');
      return {
        uuidSchema: z.string().uuid()
      };
    });
    vi.doMock('@/lib/db/auth', () => ({
      requireWorkspaceMember: vi.fn(async () => {
        throw new Error('unauthorized');
      })
    }));
    vi.doMock('@/lib/db/supabaseServer', () => ({ createSupabaseServiceClient }));
    vi.doMock('@/lib/copilot/context', () => ({ loadCopilotContext: vi.fn() }));
    vi.doMock('@/lib/ai/auditReadiness', async () => import('../../../../../lib/ai/auditReadiness'));

    const route = await import('./route');
    const response = await route.GET(request(), { params: Promise.resolve({ workspaceId }) });

    expect(response.status).toBe(401);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('returns deterministic readiness without invoking Gemini', async () => {
    const createSupabaseServiceClient = vi.fn(() => ({ from: vi.fn() }));
    const loadCopilotContext = vi.fn(async () => ({
      organization: { id: organizationId, name: 'Org' },
      workspace: { id: workspaceId, organizationId, name: 'Audit', status: 'draft' },
      documents: [],
      terms: [],
      findings: [],
      evidenceItems: [],
      evidenceCandidates: [],
      evidencePacks: [],
      invoiceRecords: [],
      usageRecords: []
    }));
    const createGeminiClient = vi.fn(() => {
      throw new Error('Gemini should not be used for readiness scoring');
    });

    vi.doMock('@/lib/api/schemas', async () => {
      const { z } = await import('zod');
      return {
        uuidSchema: z.string().uuid()
      };
    });
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
    vi.doMock('@/lib/db/supabaseServer', () => ({ createSupabaseServiceClient }));
    vi.doMock('@/lib/copilot/context', () => ({ loadCopilotContext }));
    vi.doMock('@/lib/ai/geminiClient', () => ({ createGeminiClient }));
    vi.doMock('@/lib/ai/auditReadiness', async () => import('../../../../../lib/ai/auditReadiness'));

    const route = await import('./route');
    const response = await route.GET(request(), { params: Promise.resolve({ workspaceId }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.readiness).toMatchObject({
      readinessScore: 0,
      readinessLabel: 'needs_data',
      source: 'deterministic'
    });
    expect(payload.readiness.nextBestAction.action).toBe('upload_contracts');
    expect(createGeminiClient).not.toHaveBeenCalled();
  });
});

function request(): Request {
  return new Request(`https://leakproof.test/api/workspaces/${workspaceId}/readiness?organization_id=${organizationId}`);
}
