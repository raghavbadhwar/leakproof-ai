import { afterEach, describe, expect, it, vi } from 'vitest';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('recovery note route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('blocks customer-facing drafts without approved evidence', async () => {
    mockRecoveryRouteDependencies({
      findingStatus: 'approved',
      evidenceRows: []
    });
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId, include_customer_facing_draft: true }), {
      params: Promise.resolve({ id: findingId })
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toMatch(/Approve at least one attached evidence item/i);
  });

  it('keeps draft findings internal-only and does not perform external actions', async () => {
    const operations = mockRecoveryRouteDependencies({
      findingStatus: 'draft',
      evidenceRows: []
    });
    const route = await import('./route');

    const response = await route.POST(jsonRequest({ organization_id: organizationId, include_customer_facing_draft: true }), {
      params: Promise.resolve({ id: findingId })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.customer_facing_enabled).toBe(false);
    expect(payload.recovery_note.internalNote).toContain('Internal');
    expect(payload.recovery_note.customerFacingDraft).toBeNull();
    expect(payload.external_actions).toEqual({
      email_sent: false,
      invoice_created: false,
      report_exported: false
    });
    expect(operations.findingUpdates).toEqual([]);
    expect(operations.emailSends).toEqual([]);
    expect(operations.invoiceCreates).toEqual([]);
  });
});

function mockRecoveryRouteDependencies(input: {
  findingStatus: string;
  evidenceRows: Array<Record<string, unknown>>;
}) {
  const operations = {
    findingUpdates: [] as unknown[],
    insertedDrafts: [] as unknown[],
    emailSends: [] as unknown[],
    invoiceCreates: [] as unknown[]
  };

  vi.doMock('@/lib/api/rateLimit', () => ({
    enforceRateLimit: vi.fn()
  }));
  vi.doMock('@/lib/api/schemas', async () => import('../../../../../lib/api/schemas'));
  vi.doMock('@/lib/api/responses', async () => import('../../../../../lib/api/responses'));
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
        internalNote: 'Internal draft for reviewer follow-up.',
        customerFacingDraft: 'Customer draft should be removed for draft findings.',
        evidenceSummary: 'No approved evidence yet.',
        calculationSummary: 'Model should not control this calculation.',
        recommendedTone: 'collaborative',
        humanReviewRequired: true,
        warnings: [],
        referencedEntities: []
      },
      provenance: {
        provider: 'gemini',
        model: 'gemini-test',
        modelVersion: 'test-version',
        promptVersion: 'recovery-note-draft-v1'
      }
    }))
  }));
  vi.doMock('@/lib/ai/recoveryNoteSchema', () => ({
    RECOVERY_NOTE_PROMPT_VERSION: 'recovery-note-draft-v1',
    recoveryNoteSystemInstruction: vi.fn(() => 'system'),
    buildRecoveryNotePrompt: vi.fn(() => 'prompt'),
    recoveryNoteOutputSchema: {
      parse: (value: unknown) => value
    },
    buildRecoveryNoteDraft: vi.fn((context: { includeCustomerFacingDraft: boolean }) => ({
      internalNote: 'Internal draft for reviewer follow-up.',
      customerFacingDraft: context.includeCustomerFacingDraft ? 'Customer-facing draft for human review.' : null,
      evidenceSummary: 'Approved evidence summary.',
      calculationSummary: 'Deterministic calculation summary. AI did not calculate or change this amount.',
      recommendedTone: 'collaborative',
      humanReviewRequired: true,
      warnings: [],
      referencedEntities: []
    }))
  }));
  vi.doMock('@/lib/analytics/statuses', () => ({
    customerFacingFindingStatuses: ['approved', 'customer_ready', 'recovered'],
    isCustomerFacingFindingStatus: (status: string) => ['approved', 'customer_ready', 'recovered'].includes(status),
    isInternalPipelineFindingStatus: (status: string) => ['draft', 'needs_review'].includes(status)
  }));
  vi.doMock('@/lib/evidence/candidates', () => ({
    isEvidenceCandidateExportReady: vi.fn((candidate: { approval_state?: string | null; attached_evidence_item_id?: string | null }) =>
      candidate.approval_state === 'approved' && Boolean(candidate.attached_evidence_item_id)
    )
  }));
  vi.doMock('@/lib/evidence/exportReadiness', () => ({
    exportBlockerForFinding: vi.fn((input: { evidenceCitations: unknown[] }) =>
      input.evidenceCitations.length === 0 ? 'approved_evidence_required' : null
    ),
    exportCitationForEvidenceRow: vi.fn((row: Record<string, unknown>) => row)
  }));
  vi.doMock('@/lib/db/supabaseServer', () => ({
    createSupabaseServiceClient: vi.fn(() => fakeSupabase(input, operations))
  }));

  return operations;
}

function fakeSupabase(
  input: { findingStatus: string; evidenceRows: Array<Record<string, unknown>> },
  operations: {
    findingUpdates: unknown[];
    insertedDrafts: unknown[];
    emailSends: unknown[];
    invoiceCreates: unknown[];
  }
) {
  return {
    from(table: string) {
      if (table === 'leakage_findings') return leakageFindingsBuilder(input.findingStatus, operations);
      if (table === 'evidence_items') return chain({ data: input.evidenceRows, error: null });
      if (table === 'evidence_candidates') return chain({ data: [], error: null });
      if (table === 'recovery_note_drafts') return recoveryDraftsBuilder(operations);
      return chain({ data: null, error: null });
    }
  };
}

function leakageFindingsBuilder(findingStatus: string, operations: { findingUpdates: unknown[] }) {
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
      status: findingStatus,
      calculation: {
        formula: 'minimum_commitment_minor - billed_minor',
        minimum_commitment_minor: 100_000,
        billed_minor: 60_000
      },
      recommended_action: 'Review the next invoice adjustment.',
      customers: { name: 'Acme Cloud' }
    },
    error: null
  };
  return {
    ...chain(result),
    update(payload: unknown) {
      operations.findingUpdates.push(payload);
      return chain({ data: null, error: null });
    }
  };
}

function recoveryDraftsBuilder(operations: { insertedDrafts: unknown[] }) {
  return {
    insert(payload: unknown) {
      operations.insertedDrafts.push(payload);
      return {
        select() {
          return {
            single: async () => ({
              data: null,
              error: {
                code: 'PGRST205',
                message: 'Could not find the table recovery_note_drafts in the schema cache'
              }
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
    in: () => chain(result),
    order: () => chain(result),
    single: async () => result,
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
  };
}

function jsonRequest(body: unknown): Request {
  return new Request(`https://leakproof.test/api/findings/${findingId}/recovery-note`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}
