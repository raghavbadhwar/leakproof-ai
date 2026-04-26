import { afterEach, describe, expect, it, vi } from 'vitest';

const validBody = {
  organization_id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  source_document_id: '33333333-3333-4333-8333-333333333333'
};

describe('sensitive API route auth failures', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated extraction requests before running service-role work', async () => {
    mockExtractionRouteDependencies('unauthorized');

    const route = await import('./extraction/run/route');
    const response = await route.POST(jsonRequest(validBody));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication is required.' });
  });

  it('rejects cross-org extraction requests before running service-role work', async () => {
    mockExtractionRouteDependencies('forbidden');

    const route = await import('./extraction/run/route');
    const response = await route.POST(jsonRequest(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'You do not have access to this organization.' });
  });
});

function mockExtractionRouteDependencies(authError: 'unauthorized' | 'forbidden'): void {
  vi.doMock('@/lib/api/rateLimit', () => ({
    enforceRateLimit: vi.fn()
  }));
  vi.doMock('@/lib/api/schemas', async () => {
    const { z } = await import('zod');
    return {
      runExtractionSchema: z.object({
        organization_id: z.string().uuid(),
        workspace_id: z.string().uuid(),
        source_document_id: z.string().uuid()
      })
    };
  });
  vi.doMock('@/lib/api/responses', () => ({
    jsonError: (message: string, status = 400) => Response.json({ error: message }, { status }),
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
    requireWorkspaceRole: vi.fn(async () => {
      throw new Error(authError);
    })
  }));
  vi.doMock('@/lib/agents/contractExtractor', () => ({
    extractContractTerms: vi.fn()
  }));
  vi.doMock('@/lib/audit/runVersions', () => ({
    buildContractTermLogicalKey: vi.fn()
  }));
  vi.doMock('@/lib/audit/auditEvents', () => ({
    sanitizeOperationalErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback)
  }));
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: vi.fn()
  }));
  vi.doMock('@/lib/db/customers', () => ({
    findOrCreateCustomer: vi.fn()
  }));
  vi.doMock('@/lib/db/roles', () => ({
    REVIEWER_WRITE_ROLES: ['owner', 'admin', 'reviewer']
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => {
      throw new Error('service client should not be created before auth rejection');
    })
  }));
  vi.doMock('@/lib/ingest/documentText', () => ({
    extractDocumentText: vi.fn()
  }));
}

function jsonRequest(body: unknown): Request {
  return new Request('https://leakproof.test/api/extraction/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
