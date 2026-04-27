import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('finding AI critique route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('stores critique separately without changing finding amount or status', async () => {
    const operations = mockCritiqueRouteDependencies();
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId }), {
      params: Promise.resolve({ id: findingId })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.critique.recommendation_status).toBe('needs_more_evidence');
    expect(operations.insertedCritique).toEqual(expect.objectContaining({
      organization_id: organizationId,
      workspace_id: workspaceId,
      finding_id: findingId,
      recommendation_status: 'needs_more_evidence',
      evidence_score: expect.any(Number)
    }));
    expect(operations.updatedFindings).toEqual([]);
  });
});

function mockCritiqueRouteDependencies(): {
  insertedCritique: Record<string, unknown> | null;
  updatedFindings: unknown[];
} {
  const operations: {
    insertedCritique: Record<string, unknown> | null;
    updatedFindings: unknown[];
  } = {
    insertedCritique: null,
    updatedFindings: []
  };

  vi.doMock('@/lib/api/rateLimit', () => ({
    enforceRateLimit: vi.fn()
  }));
  vi.doMock('@/lib/api/schemas', async () => {
    const { z } = await import('zod');
    return {
      uuidSchema: z.string().uuid(),
      organizationScopedBodySchema: z.object({
        organization_id: z.string().uuid()
      })
    };
  });
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
  vi.doMock('@/lib/ai/findingCritique', async () => import('../../../../../lib/ai/findingCritique'));
  vi.doMock('@/lib/db/auth', () => ({
    requireOrganizationMember: vi.fn(async () => ({
      userId: 'reviewer-user',
      organizationId,
      role: 'reviewer'
    })),
    assertWorkspaceBelongsToOrganization: vi.fn()
  }));
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: vi.fn()
  }));
  vi.doMock('@/lib/db/roles', () => ({
    REVIEWER_WRITE_ROLES: ['owner', 'admin', 'reviewer'],
    assertRoleAllowed: vi.fn()
  }));
  vi.doMock('@/lib/ai/geminiClient', () => ({
    generateGeminiJson: vi.fn(async () => ({
      data: {
        evidenceQuality: {
          score: 95,
          summary: 'The contract evidence is present, but billing evidence is missing.',
          strengths: ['Approved contract clause is attached.'],
          gaps: []
        },
        falsePositiveRisks: [],
        reviewerChecklist: ['Confirm invoice rows for the billing period.'],
        recommendation: 'strong_evidence',
        recommendationRationale: 'The attached evidence is directionally useful.',
        safety: {
          canApproveFinding: false,
          canChangeFindingAmount: false,
          canChangeFindingStatus: false
        }
      },
      provenance: {
        provider: 'gemini',
        model: 'gemini-test',
        modelVersion: 'test-version',
        promptVersion: 'finding-evidence-critic-v1'
      }
    }))
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => fakeSupabase(operations))
  }));

  return operations;
}

function fakeSupabase(operations: {
  insertedCritique: Record<string, unknown> | null;
  updatedFindings: unknown[];
}) {
  return {
    from(table: string) {
      if (table === 'leakage_findings') return leakageFindingsBuilder(operations);
      if (table === 'evidence_items') return evidenceItemsBuilder();
      if (table === 'finding_ai_critiques') return findingCritiquesBuilder(operations);
      return chain({ data: null, error: null });
    }
  };
}

function leakageFindingsBuilder(operations: { updatedFindings: unknown[] }) {
  const result = {
    data: {
      id: findingId,
      workspace_id: workspaceId,
      finding_type: 'minimum_commitment_shortfall',
      outcome_type: 'recoverable_leakage',
      title: 'Minimum commitment shortfall',
      summary: 'Customer was billed below the approved minimum.',
      estimated_amount_minor: 40_000,
      currency: 'USD',
      confidence: 0.92,
      status: 'draft',
      evidence_coverage_status: 'complete',
      calculation: {
        formula: 'minimum_commitment_minor - billed_minor',
        minimum_commitment_minor: 100_000,
        billed_minor: 60_000
      }
    },
    error: null
  };
  return {
    ...chain(result),
    update(payload: unknown) {
      operations.updatedFindings.push(payload);
      return chain({ data: null, error: null });
    }
  };
}

function evidenceItemsBuilder() {
  return chain({
    data: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        evidence_type: 'contract_term',
        citation: {
          sourceType: 'contract',
          label: 'MSA section 4.1',
          excerpt: 'Minimum commitment is USD 1,000.'
        },
        excerpt: 'Minimum commitment is USD 1,000.'
      }
    ],
    error: null
  });
}

function findingCritiquesBuilder(operations: {
  insertedCritique: Record<string, unknown> | null;
}) {
  return {
    insert(payload: Record<string, unknown>) {
      operations.insertedCritique = payload;
      return {
        select() {
          return {
            single: async () => ({
              data: {
                id: '55555555-5555-4555-8555-555555555555',
                ...payload
              },
              error: null
            })
          };
        }
      };
    }
  };
}

function chain(result: { data: unknown; error: unknown }) {
  return {
    select: () => chain(result),
    eq: () => chain(result),
    not: () => chain(result),
    order: () => chain(result),
    single: async () => result,
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };
}

function jsonRequest(body: unknown): Request {
  return new Request(`https://leakproof.test/api/findings/${findingId}/ai-critique`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
