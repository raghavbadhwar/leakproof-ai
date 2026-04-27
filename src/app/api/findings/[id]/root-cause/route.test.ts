import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('finding root cause route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns advisory root cause without changing finding amount, status, or storing raw evidence', async () => {
    const operations = mockRootCauseRouteDependencies();
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId }), {
      params: Promise.resolve({ id: findingId })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.primaryRootCause).toBe('expired_discount_not_removed');
    expect(payload.safety).toEqual(expect.objectContaining({
      canCalculateFinalLeakage: false,
      canApproveFindings: false,
      canApproveEvidence: false,
      canMarkCustomerReady: false,
      canExportReports: false,
      storesRawEvidence: false
    }));
    expect(operations.updatedFindings).toEqual([]);
    expect(operations.insertedRootCauseRows).toEqual([]);
    expect(JSON.stringify(operations.auditEvents)).not.toContain('Raw contract clause');
    expect(JSON.stringify(operations.auditEvents)).not.toContain('raw invoice row');
    expect(JSON.stringify(operations.auditEvents)).not.toMatch(/prompt|full_model_output|gemini.*response/i);
  });
});

function mockRootCauseRouteDependencies(): {
  updatedFindings: unknown[];
  insertedRootCauseRows: unknown[];
  auditEvents: unknown[];
} {
  const operations: {
    updatedFindings: unknown[];
    insertedRootCauseRows: unknown[];
    auditEvents: unknown[];
  } = {
    updatedFindings: [],
    insertedRootCauseRows: [],
    auditEvents: []
  };

  vi.doMock('@/lib/api/rateLimit', () => ({ enforceRateLimit: vi.fn() }));
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
    handleApiError: () => Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }));
  vi.doMock('@/lib/db/auth', () => ({
    requireOrganizationMember: vi.fn(async () => ({
      userId: 'reviewer-user',
      organizationId,
      role: 'reviewer'
    })),
    assertWorkspaceBelongsToOrganization: vi.fn()
  }));
  vi.doMock('@/lib/db/roles', () => ({
    REVIEWER_WRITE_ROLES: ['owner', 'admin', 'reviewer'],
    assertRoleAllowed: vi.fn()
  }));
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: vi.fn(async (_supabase: unknown, event: unknown) => {
      operations.auditEvents.push(event);
    })
  }));
  vi.doMock('@/lib/audit/aiEvents', () => ({
    aiTaskCompletedEvent: vi.fn((input: { workspaceId: string; taskType: string; safeSummary: string; modelName?: string | null }) => ({
      eventType: 'ai.task_completed',
      entityType: 'ai_task',
      entityId: input.workspaceId,
      metadata: {
        task_type: input.taskType,
        safe_summary: input.safeSummary,
        model_name: input.modelName,
        status: 'completed'
      }
    }))
  }));
  vi.doMock('@/lib/ai/geminiClient', () => ({
    generateGeminiJson: vi.fn(async () => ({
      data: {
        primaryRootCause: 'expired_discount_not_removed',
        secondaryRootCauses: [],
        confidence: 0.91,
        preventionRecommendation: 'Add a discount-expiry control before billing close.',
        operationalOwnerSuggestion: 'Billing operations',
        supportingEvidence: [
          {
            type: 'finding_type',
            reference: 'expired_discount_still_applied',
            note: 'Finding type indicates expired discount leakage.'
          }
        ],
        caveats: ['Human review is required before any process change is considered complete.'],
        safety: {
          canCalculateFinalLeakage: false,
          canApproveFindings: false,
          canApproveEvidence: false,
          canMarkCustomerReady: false,
          canExportReports: false,
          canSendEmail: false,
          canCreateInvoice: false,
          storesRawEvidence: false
        }
      },
      provenance: {
        provider: 'gemini',
        model: 'gemini-test',
        modelVersion: 'test-version',
        promptVersion: 'root-cause-classifier-v1'
      }
    }))
  }));
  vi.doMock('@/lib/ai/rootCause', () => ({
    classifyFindingRootCause: vi.fn(async () => ({
      rootCause: {
        primaryRootCause: 'expired_discount_not_removed',
        secondaryRootCauses: [],
        confidence: 0.91,
        preventionRecommendation: 'Add a discount-expiry control before billing close.',
        operationalOwnerSuggestion: 'Billing operations',
        supportingEvidence: [
          {
            type: 'finding_type',
            reference: 'expired_discount_still_applied',
            note: 'Finding type indicates expired discount leakage.'
          }
        ],
        caveats: ['Human review is required before process changes are considered complete.'],
        safety: {
          canCalculateFinalLeakage: false,
          canApproveFindings: false,
          canApproveEvidence: false,
          canMarkCustomerReady: false,
          canExportReports: false,
          canSendEmail: false,
          canCreateInvoice: false,
          storesRawEvidence: false
        }
      },
      classificationSource: 'gemini',
      promptVersion: 'root-cause-classifier-v1'
    })),
    fingerprintRootCauseInput: vi.fn(() => 'safe-fingerprint')
  }));
  vi.doMock('@/lib/ai/rootCauseSchema', () => ({
    ROOT_CAUSE_PROMPT_VERSION: 'root-cause-classifier-v1'
  }));
  vi.doMock('@/lib/audit/aiEvents', () => ({
    aiTaskCompletedEvent: vi.fn(() => ({
      eventType: 'ai.task.completed',
      entityType: 'finding',
      metadata: {
        task_type: 'root_cause_classification',
        safe_summary: 'Root cause classified as expired_discount_not_removed.'
      }
    }))
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => fakeSupabase(operations))
  }));

  return operations;
}

function fakeSupabase(operations: {
  updatedFindings: unknown[];
  insertedRootCauseRows: unknown[];
}) {
  return {
    from(table: string) {
      if (table === 'leakage_findings') return leakageFindingsBuilder(operations);
      if (table === 'evidence_items') return evidenceItemsBuilder();
      if (/root[_-]?cause/i.test(table)) return rootCauseTableBuilder(operations);
      return chain({ data: null, error: null });
    }
  };
}

function leakageFindingsBuilder(operations: { updatedFindings: unknown[] }) {
  const result = {
    data: {
      id: findingId,
      workspace_id: workspaceId,
      finding_type: 'expired_discount_still_applied',
      outcome_type: 'recoverable_leakage',
      title: 'Expired discount still applied',
      summary: 'A discount continued after the approved expiry date.',
      estimated_amount_minor: 40_000,
      currency: 'USD',
      confidence: 0.92,
      status: 'needs_review',
      evidence_coverage_status: 'complete',
      calculation: {
        expected_minor: 100_000,
        billed_minor: 60_000,
        discount_expiry_date: '2026-01-31'
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
          excerpt: 'Raw contract clause should not be stored in AI logs.'
        },
        excerpt: 'raw invoice row should not be stored either.'
      }
    ],
    error: null
  });
}

function rootCauseTableBuilder(operations: { insertedRootCauseRows: unknown[] }) {
  return {
    insert(payload: unknown) {
      operations.insertedRootCauseRows.push(payload);
      return chain({ data: payload, error: null });
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
  return new Request(`https://leakproof.test/api/findings/${findingId}/root-cause`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
