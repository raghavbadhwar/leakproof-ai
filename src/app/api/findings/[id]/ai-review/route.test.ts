import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';
const rawCandidateSnippet = 'Credit note raw source sentence from contract packet should not be persisted.';

describe('finding AI review route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('stores advisory review separately without changing finding amount or status', async () => {
    const operations = mockAiReviewRouteDependencies();
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId, workspace_id: workspaceId, review_type: 'both' }), {
      params: Promise.resolve({ id: findingId })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.review.finding_id).toBe(findingId);
    expect(operations.insertedCritique).toEqual(expect.objectContaining({
      organization_id: organizationId,
      workspace_id: workspaceId,
      finding_id: findingId,
      evidence_score: expect.any(Number)
    }));
    expect(operations.insertedCritique?.critique_json).toEqual(expect.objectContaining({
      safety: expect.objectContaining({
        canApproveEvidence: false,
        canApproveFinding: false,
        canChangeFindingAmount: false,
        canChangeFindingStatus: false
      })
    }));
    expect(operations.updatedFindings).toEqual([]);
  });

  it('falls back to deterministic guardrails when Gemini output is invalid', async () => {
    const operations = mockAiReviewRouteDependencies({ geminiData: { invalid: true } });
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId, workspace_id: workspaceId, review_type: 'both' }), {
      params: Promise.resolve({ id: findingId })
    });

    expect(response.status).toBe(200);
    expect(operations.insertedCritique).toEqual(expect.objectContaining({
      provider: 'deterministic',
      model: 'local-guardrails'
    }));
    expect(operations.insertedCritique?.critique_json).toEqual(expect.objectContaining({
      fallbackReason: 'invalid_or_unavailable_gemini_output',
      evidenceQuality: expect.objectContaining({
        quality: 'needs_more_evidence'
      })
    }));
  });

  it('does not store raw source snippets even if Gemini echoes them', async () => {
    const operations = mockAiReviewRouteDependencies({
      geminiData: {
        evidenceQuality: {
          quality: 'needs_more_evidence',
          score: 44,
          requiredEvidencePresent: false,
          contractEvidencePresent: true,
          invoiceOrUsageEvidencePresent: false,
          formulaSupported: true,
          missingEvidence: [rawCandidateSnippet],
          conflictingSignals: [],
          reviewerChecklist: ['Review invoice and usage evidence before approval.'],
          recommendation: 'needs_more_evidence'
        },
        falsePositive: {
          riskLevel: 'medium',
          riskReasons: [rawCandidateSnippet],
          suggestedChecks: ['Check credit notes before customer use.'],
          blockingIssues: [],
          recommendation: 'needs_more_evidence'
        }
      }
    });
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId, workspace_id: workspaceId, review_type: 'both' }), {
      params: Promise.resolve({ id: findingId })
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(operations.insertedCritique?.critique_json)).not.toContain(rawCandidateSnippet);
  });
});

function mockAiReviewRouteDependencies(options: { geminiData?: unknown } = {}): {
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
      uuidSchema: z.string().uuid()
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
  vi.doMock('@/lib/db/audit', () => ({
    writeAuditEvent: vi.fn()
  }));
  vi.doMock('@/lib/db/roles', () => ({
    REVIEWER_WRITE_ROLES: ['owner', 'admin', 'reviewer'],
    assertRoleAllowed: vi.fn()
  }));
  vi.doMock('@/lib/ai/geminiClient', () => ({
    generateGeminiJson: vi.fn(async () => ({
      data: options.geminiData ?? validGeminiReview(),
      provenance: {
        provider: 'gemini',
        model: 'gemini-test',
        modelVersion: 'test-version',
        promptVersion: 'finding-ai-review-v1'
      }
    }))
  }));
  vi.doMock('@/lib/ai/evidenceQualitySchema', async () => import('../../../../../lib/ai/evidenceQualitySchema'));
  vi.doMock('@/lib/ai/falsePositiveSchema', async () => import('../../../../../lib/ai/falsePositiveSchema'));
  vi.doMock('@/lib/ai/safety', async () => import('../../../../../lib/ai/safety'));
  vi.doMock('@/lib/evidence/aiReview', async () => import('../../../../../lib/evidence/aiReview'));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => fakeSupabase(operations))
  }));

  return operations;
}

function validGeminiReview() {
  return {
    evidenceQuality: {
      quality: 'strong_evidence',
      score: 95,
      requiredEvidencePresent: true,
      contractEvidencePresent: true,
      invoiceOrUsageEvidencePresent: true,
      formulaSupported: true,
      missingEvidence: [],
      conflictingSignals: [],
      reviewerChecklist: ['Confirm approved invoice rows for the period.'],
      recommendation: 'ready_for_review'
    },
    falsePositive: {
      riskLevel: 'low',
      riskReasons: [],
      suggestedChecks: ['Confirm there are no credits or amendments.'],
      blockingIssues: [],
      recommendation: 'ready_for_review'
    }
  };
}

function fakeSupabase(operations: {
  insertedCritique: Record<string, unknown> | null;
  updatedFindings: unknown[];
}) {
  return {
    from(table: string) {
      if (table === 'leakage_findings') return leakageFindingsBuilder(operations);
      if (table === 'evidence_items') return chain({ data: evidenceRows(), error: null });
      if (table === 'evidence_candidates') return chain({ data: candidateRows(), error: null });
      if (table === 'contract_terms') return chain({ data: relatedTermRows(), error: null });
      if (table === 'finding_ai_critiques') return findingAiReviewsBuilder(operations);
      return chain({ data: null, error: null });
    }
  };
}

function leakageFindingsBuilder(operations: { updatedFindings: unknown[] }) {
  const result = {
    data: {
      id: findingId,
      organization_id: organizationId,
      workspace_id: workspaceId,
      customer_id: '44444444-4444-4444-8444-444444444444',
      finding_type: 'minimum_commitment_shortfall',
      outcome_type: 'recoverable_leakage',
      title: 'Minimum commitment shortfall',
      summary: 'Customer was billed below the reviewed minimum.',
      estimated_amount_minor: 40_000,
      currency: 'USD',
      confidence: 0.92,
      status: 'draft',
      evidence_coverage_status: 'complete',
      calculation: {
        formula: 'minimum_commitment_minor - billed_minor',
        minimum_commitment_minor: 100_000,
        billed_minor: 60_000
      },
      review_note: null
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

function evidenceRows() {
  return [
    {
      id: '55555555-5555-4555-8555-555555555555',
      evidence_type: 'contract_term',
      citation: {
        sourceType: 'contract',
        label: 'MSA section 4.1',
        excerpt: 'Minimum commitment is USD 1,000.'
      },
      excerpt: 'Minimum commitment is USD 1,000.',
      approval_state: 'approved',
      reviewed_by: 'reviewer-user',
      reviewed_at: '2026-04-27T10:00:00.000Z'
    }
  ];
}

function candidateRows() {
  return [
    {
      id: '66666666-6666-4666-8666-666666666666',
      retrieval_score: 0.84,
      relevance_explanation: 'Possible credit note evidence.',
      approval_state: 'suggested',
      review_note: null,
      document_chunks: {
        source_label: 'Page 2, chunk 1',
        content: rawCandidateSnippet
      }
    }
  ];
}

function relatedTermRows() {
  return [
    {
      id: '77777777-7777-4777-8777-777777777777',
      term_type: 'minimum_commitment',
      review_status: 'approved',
      confidence: 0.95,
      citation: {
        label: 'MSA section 4.1',
        excerpt: 'Minimum commitment applies.'
      }
    }
  ];
}

function findingAiReviewsBuilder(operations: {
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
                id: '88888888-8888-4888-8888-888888888888',
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
    in: () => chain(result),
    order: () => chain(result),
    limit: () => chain(result),
    single: async () => result,
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };
}

function jsonRequest(body: unknown): Request {
  return new Request(`https://leakproof.test/api/findings/${findingId}/ai-review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
