import { describe, expect, it, vi } from 'vitest';
import { shouldWriteAuditEvent } from '../audit/auditEvents';
import type { CopilotDataContext } from './context';
import {
  assertCanConfirmCopilotAction,
  buildPendingCopilotActionProposal,
  cancelPendingCopilotAction,
  detectCopilotActionIntent,
  executeConfirmedCopilotAction,
  sanitizeActionPayloadRefs,
  type AssistantActionRecord
} from './actions';

vi.mock('server-only', () => ({}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('Copilot action framework', () => {
  it('prevents viewers from creating mutation actions', () => {
    const intent = detectCopilotActionIntent({ message: 'Approve this finding.', selectedFindingId: findingId });
    expect(intent).not.toBeNull();

    expect(() => buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'viewer'
    })).toThrow('forbidden');
    expect(() => buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'member'
    })).toThrow('forbidden');
  });

  it('allows reviewers to prepare review workflow actions', () => {
    const intent = detectCopilotActionIntent({ message: 'Approve this finding.', selectedFindingId: findingId });

    const proposal = buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'reviewer',
      expiresAt: '2026-04-28T00:00:00.000Z'
    });

    expect(proposal.actionType).toBe('prepare_update_finding_status');
    expect(proposal.requiredRole).toBe('reviewer');
    expect(proposal.preview.what_will_change).toContain('The finding amount and deterministic calculation will not change.');
    expect(proposal.preview.blockers).toEqual([]);
  });

  it('allows owner and admin roles to prepare broader assignment actions', () => {
    const intent = detectCopilotActionIntent({ message: 'Assign reviewer to this finding.', selectedFindingId: findingId });

    expect(() => buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'owner'
    })).not.toThrow();
    expect(() => buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'admin'
    })).not.toThrow();
    expect(() => buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'reviewer'
    })).toThrow('forbidden');
  });

  it('keeps recovery-note persistence behind a pending action card', () => {
    expect(detectCopilotActionIntent({ message: 'Draft recovery note.', selectedFindingId: findingId })?.actionType).toBe('prepare_recovery_note');
    expect(detectCopilotActionIntent({ message: 'Save recovery note to the finding.', selectedFindingId: findingId })?.actionType).toBe('prepare_recovery_note');
  });

  it('prepares contract hierarchy resolution only as a confirmed action', () => {
    const intent = detectCopilotActionIntent({ message: 'Resolve contract hierarchy.', selectedFindingId: findingId });

    const proposal = buildPendingCopilotActionProposal({
      context: context(),
      intent: intent!,
      actorRole: 'reviewer',
      expiresAt: '2026-04-28T00:00:00.000Z'
    });

    expect(proposal.actionType).toBe('prepare_contract_hierarchy_resolution');
    expect(proposal.targetEntityType).toBe('customer');
    expect(proposal.payloadRefs.customer_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(proposal.preview.what_will_change.join(' ')).toContain('Approved terms will not be auto-approved');
  });

  it('re-checks role before confirming actions', () => {
    expect(() => assertCanConfirmCopilotAction(actionRecord(), 'viewer')).toThrow('forbidden');
    expect(() => assertCanConfirmCopilotAction(actionRecord(), 'reviewer')).not.toThrow();
  });

  it('does not confirm expired or non-pending actions', () => {
    expect(() => assertCanConfirmCopilotAction(actionRecord({ status: 'confirmed' }), 'reviewer')).toThrow('action_not_pending');
    expect(() => assertCanConfirmCopilotAction(
      actionRecord({ expires_at: '2026-04-26T00:00:00.000Z' }),
      'reviewer',
      new Date('2026-04-27T00:00:00.000Z')
    )).toThrow('action_expired');
  });

  it('cancels a pending action without executing the business mutation', async () => {
    const updates: Record<string, unknown>[] = [];
    const cancelled = await cancelPendingCopilotAction(fakeSupabase(updates) as never, {
      action: actionRecord(),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer',
      now: new Date('2026-04-27T00:00:00.000Z')
    });

    expect(cancelled.status).toBe('cancelled');
    expect(updates).toEqual([{
      status: 'cancelled',
      cancelled_by: 'reviewer-user',
      cancelled_at: '2026-04-27T00:00:00.000Z'
    }]);
  });

  it('redacts action payload references before persistence', () => {
    const redacted = sanitizeActionPayloadRefs({
      target_entity_id: findingId,
      raw_contract_text: 'Raw contract text should not be stored.',
      prompt: 'Approve this using pasted invoice rows.',
      invoice_id: 'invoice-123'
    });

    expect(redacted.target_entity_id).toBe(findingId);
    expect(JSON.stringify(redacted)).not.toContain('Raw contract text should not be stored.');
    expect(JSON.stringify(redacted)).not.toContain('Approve this using pasted invoice rows.');
    expect(JSON.stringify(redacted)).not.toContain('invoice-123');
  });

  it('registers Copilot action audit events', () => {
    expect(shouldWriteAuditEvent('copilot.action_created')).toBe(true);
    expect(shouldWriteAuditEvent('copilot.action_confirmed')).toBe(true);
    expect(shouldWriteAuditEvent('copilot.action_cancelled')).toBe(true);
    expect(shouldWriteAuditEvent('copilot.action_executed')).toBe(true);
    expect(shouldWriteAuditEvent('copilot.action_failed')).toBe(true);
  });

  it('executes confirmed reconciliation only for reviewer, admin, or owner roles', async () => {
    for (const role of ['reviewer', 'admin', 'owner'] as const) {
      const operations = executionOperations();
      const result = await executeConfirmedCopilotAction(fakeExecutionSupabase(operations) as never, {
        action: actionRecord({ action_type: 'prepare_run_reconciliation', status: 'confirmed', risk_level: 'high' }),
        actorUserId: 'reviewer-user',
        actorRole: role,
        runners: {
          runReconciliation: async () => ({
            run_id: '77777777-7777-4777-8777-777777777777',
            findings: [{ id: findingId }]
          })
        }
      });

      expect(result.action.status).toBe('executed');
      expect(result.result.refs.findings_created).toBe(1);
      expect(operations.actionUpdates.at(-1)).toEqual(expect.objectContaining({ status: 'executed' }));
    }

    await expect(executeConfirmedCopilotAction(fakeExecutionSupabase(executionOperations()) as never, {
      action: actionRecord({ action_type: 'prepare_run_reconciliation', status: 'confirmed', risk_level: 'high' }),
      actorUserId: 'viewer-user',
      actorRole: 'viewer',
      runners: {
        runReconciliation: async () => ({ findings: [] })
      }
    })).rejects.toThrow('forbidden');
  });

  it('cannot execute a mutating AI feature action before confirmation', async () => {
    await expect(executeConfirmedCopilotAction(fakeExecutionSupabase(executionOperations()) as never, {
      action: actionRecord({
        action_type: 'prepare_recovery_note',
        target_entity_type: 'finding',
        target_entity_id: findingId,
        status: 'pending',
        risk_level: 'medium',
        payload_refs: { finding_id: findingId }
      }),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer',
      runners: {
        draftRecoveryNote: async () => ({ draft_id: '77777777-7777-4777-8777-777777777777' })
      }
    })).rejects.toThrow('action_not_confirmed');
  });

  it('blocks finding approval when required evidence is missing', async () => {
    const operations = executionOperations({
      finding: findingRow({ status: 'needs_review', outcome_type: 'recoverable_leakage' }),
      evidenceRows: [],
      candidateRows: []
    });

    const result = await executeConfirmedCopilotAction(fakeExecutionSupabase(operations) as never, {
      action: actionRecord({
        status: 'confirmed',
        payload_refs: { proposed_status: 'approved' }
      }),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer'
    });

    expect(result.action.status).toBe('failed');
    expect(operations.findingUpdates).toEqual([]);
    expect(JSON.stringify(operations.actionUpdates)).not.toContain('Raw contract text');
  });

  it('blocks customer_ready without approved evidence', async () => {
    const operations = executionOperations({
      finding: findingRow({ status: 'approved', outcome_type: 'recoverable_leakage' }),
      evidenceRows: [],
      candidateRows: []
    });

    const result = await executeConfirmedCopilotAction(fakeExecutionSupabase(operations) as never, {
      action: actionRecord({
        status: 'confirmed',
        payload_refs: { proposed_status: 'customer_ready' }
      }),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer'
    });

    expect(result.action.status).toBe('failed');
    expect(operations.findingUpdates).toEqual([]);
  });

  it('does not approve cross-workspace evidence', async () => {
    const operations = executionOperations({
      candidateRows: [],
      finding: null
    });

    const result = await executeConfirmedCopilotAction(fakeExecutionSupabase(operations) as never, {
      action: actionRecord({
        action_type: 'prepare_approve_evidence',
        status: 'confirmed',
        target_entity_type: 'evidence_candidate',
        target_entity_id: '77777777-7777-4777-8777-777777777777',
        payload_refs: { evidence_candidate_id: '77777777-7777-4777-8777-777777777777' }
      }),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer'
    });

    expect(result.action.status).toBe('failed');
    expect(operations.evidenceItemUpdates).toEqual([]);
  });

  it('generates report drafts without draft or needs_review findings', async () => {
    const operations = executionOperations({
      reportFindingRows: [
        reportFindingRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'approved' }),
        reportFindingRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'draft' }),
        reportFindingRow({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'needs_review' })
      ],
      evidenceRows: [
        evidenceRow({ finding_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', evidence_type: 'contract_term', sourceType: 'contract' }),
        evidenceRow({ finding_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', evidence_type: 'invoice_row', sourceType: 'invoice' })
      ]
    });

    const result = await executeConfirmedCopilotAction(fakeExecutionSupabase(operations) as never, {
      action: actionRecord({ action_type: 'prepare_generate_report_draft', status: 'confirmed', target_entity_type: 'workspace', target_entity_id: workspaceId }),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer'
    });

    expect(result.action.status).toBe('executed');
    expect(operations.evidencePackInserts[0]?.selected_finding_ids).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  });

  it('marks failed executions with redacted error summaries', async () => {
    const operations = executionOperations();

    const result = await executeConfirmedCopilotAction(fakeExecutionSupabase(operations) as never, {
      action: actionRecord({ action_type: 'prepare_run_reconciliation', status: 'confirmed', risk_level: 'high' }),
      actorUserId: 'reviewer-user',
      actorRole: 'reviewer',
      runners: {
        runReconciliation: async () => {
          throw new Error('Raw contract text and invoice rows leaked into failure.');
        }
      }
    });

    expect(result.action.status).toBe('failed');
    expect(result.result.summary).toBe('Copilot action execution failed.');
    expect(JSON.stringify(operations.actionUpdates)).not.toContain('Raw contract text');
    expect(JSON.stringify(operations.actionUpdates)).not.toContain('invoice rows');
  });
});

function context(): CopilotDataContext {
  return {
    organization: { id: organizationId, name: 'LeakProof Test Org' },
    workspace: { id: workspaceId, organizationId, name: 'Q2 Audit', status: 'ready' },
    documents: [],
    terms: [],
    findings: [{
      id: findingId,
      organizationId,
      workspaceId,
      customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      findingType: 'minimum_commitment_shortfall',
      outcomeType: 'recoverable_leakage',
      severity: 'high',
      title: 'Minimum commitment shortfall',
      summary: 'Customer was billed below minimum commitment.',
      amountMinor: 40_000,
      currency: 'USD',
      confidence: 0.92,
      status: 'needs_review',
      evidenceCoverageStatus: 'complete',
      calculation: {
        formula: 'minimum_commitment_minor - billed_minor',
        minimum_commitment_minor: 100_000,
        billed_minor: 60_000
      },
      reviewerUserId: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
      customerSegment: 'Enterprise',
      billingModel: 'Annual',
      contractType: 'Usage + minimum',
      customerRenewalDate: null
    }],
    evidenceItems: [],
    evidenceCandidates: [],
    evidencePacks: [],
    invoiceRecords: [],
    usageRecords: []
  };
}

function actionRecord(overrides: Partial<AssistantActionRecord> = {}): AssistantActionRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    organization_id: organizationId,
    workspace_id: workspaceId,
    thread_id: '55555555-5555-4555-8555-555555555555',
    message_id: '66666666-6666-4666-8666-666666666666',
    action_type: 'prepare_update_finding_status',
    target_entity_type: 'finding',
    target_entity_id: findingId,
    status: 'pending',
    risk_level: 'high',
    required_role: 'reviewer',
    payload_refs: {},
    preview: {
      title: 'Prepare finding status update',
      description: 'Prepare a confirmation to update a finding status without changing its amount.',
      what_will_change: ['A finding status update will be queued for a later execution phase.'],
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
    ...overrides
  };
}

function executionOperations(overrides: Partial<ExecutionOperations> = {}): ExecutionOperations {
  return {
    actionUpdates: [],
    findingUpdates: [],
    evidenceItemUpdates: [],
    evidenceCandidateUpdates: [],
    evidenceCandidateInserts: [],
    evidenceItemInserts: [],
    evidencePackInserts: [],
    finding: findingRow(),
    evidenceRows: [],
    candidateRows: [],
    reportFindingRows: [],
    ...overrides
  };
}

type ExecutionOperations = {
  actionUpdates: Record<string, unknown>[];
  findingUpdates: Record<string, unknown>[];
  evidenceItemUpdates: Record<string, unknown>[];
  evidenceCandidateUpdates: Record<string, unknown>[];
  evidenceCandidateInserts: Record<string, unknown>[];
  evidenceItemInserts: Record<string, unknown>[];
  evidencePackInserts: Record<string, unknown>[];
  finding: Record<string, unknown> | null;
  evidenceRows: Record<string, unknown>[];
  candidateRows: Record<string, unknown>[];
  reportFindingRows: Record<string, unknown>[];
};

function fakeExecutionSupabase(operations: ExecutionOperations) {
  return {
    from(table: string) {
      return executionBuilder(table, operations);
    }
  };
}

function executionBuilder(table: string, operations: ExecutionOperations) {
  let updatePayload: Record<string, unknown> | null = null;
  let insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let statusFilter: string[] | null = null;

  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    is: () => builder,
    in(column: string, values: unknown[]) {
      if (table === 'leakage_findings' && column === 'status') statusFilter = values as string[];
      return builder;
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      if (table === 'assistant_actions') operations.actionUpdates.push(payload);
      if (table === 'leakage_findings') operations.findingUpdates.push(payload);
      if (table === 'evidence_items') operations.evidenceItemUpdates.push(payload);
      if (table === 'evidence_candidates') operations.evidenceCandidateUpdates.push(payload);
      return builder;
    },
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
      insertPayload = payload;
      if (table === 'evidence_candidates') operations.evidenceCandidateInserts.push(...asArray(payload));
      if (table === 'evidence_items') operations.evidenceItemInserts.push(...asArray(payload));
      if (table === 'evidence_packs') operations.evidencePackInserts.push(...asArray(payload));
      return builder;
    },
    single: async () => resolveExecution(table, operations, updatePayload, insertPayload, statusFilter, true),
    maybeSingle: async () => resolveExecution(table, operations, updatePayload, insertPayload, statusFilter, true),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(resolveExecution(table, operations, updatePayload, insertPayload, statusFilter, false)).then(resolve, reject)
  };
  return builder;
}

function resolveExecution(
  table: string,
  operations: ExecutionOperations,
  updatePayload: Record<string, unknown> | null,
  insertPayload: Record<string, unknown> | Record<string, unknown>[] | null,
  statusFilter: string[] | null,
  single: boolean
): { data: unknown; error: null } {
  if (table === 'assistant_actions' && updatePayload) {
    return { data: actionRecord({ ...(updatePayload as Partial<AssistantActionRecord>) }), error: null };
  }
  if (table === 'leakage_findings' && updatePayload) return { data: null, error: null };
  if (table === 'leakage_findings' && single) return { data: operations.finding, error: null };
  if (table === 'leakage_findings') {
    return {
      data: operations.reportFindingRows.filter((row) => !statusFilter || statusFilter.includes(String(row.status))),
      error: null
    };
  }
  if (table === 'evidence_items' && insertPayload) return { data: { id: '99999999-9999-4999-8999-999999999999' }, error: null };
  if (table === 'evidence_items' && single) return { data: operations.evidenceRows[0] ?? null, error: null };
  if (table === 'evidence_items') return { data: operations.evidenceRows, error: null };
  if (table === 'evidence_candidates' && insertPayload) return { data: { id: '88888888-8888-4888-8888-888888888888' }, error: null };
  if (table === 'evidence_candidates' && single) return { data: operations.candidateRows[0] ?? null, error: null };
  if (table === 'evidence_candidates') return { data: operations.candidateRows, error: null };
  if (table === 'organizations') return { data: { name: 'LeakProof Test Org' }, error: null };
  if (table === 'audit_workspaces') return { data: { name: 'Q2 Audit' }, error: null };
  if (table === 'evidence_packs' && insertPayload) return { data: { id: '77777777-7777-4777-8777-777777777777' }, error: null };
  if (table === 'audit_events') return { data: null, error: null };
  return { data: null, error: null };
}

function asArray(payload: Record<string, unknown> | Record<string, unknown>[]): Record<string, unknown>[] {
  return Array.isArray(payload) ? payload : [payload];
}

function findingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: findingId,
    status: 'needs_review',
    workspace_id: workspaceId,
    outcome_type: 'recoverable_leakage',
    calculation: {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    },
    ...overrides
  };
}

function reportFindingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: findingId,
    title: 'Minimum commitment shortfall',
    finding_type: 'minimum_commitment_shortfall',
    outcome_type: 'recoverable_leakage',
    status: 'approved',
    estimated_amount_minor: 40_000,
    currency: 'USD',
    confidence: 0.92,
    recommended_action: 'Recover the shortfall.',
    calculation: {
      formula: 'minimum_commitment_minor - billed_minor',
      minimum_commitment_minor: 100_000,
      billed_minor: 60_000
    },
    reviewer_user_id: 'reviewer-user',
    reviewed_at: '2026-04-27T00:00:00.000Z',
    ...overrides
  };
}

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    finding_id: findingId,
    evidence_type: 'contract_term',
    excerpt: 'Safe excerpt.',
    approval_state: 'approved',
    reviewed_by: 'reviewer-user',
    reviewed_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
    citation: {
      sourceType: overrides.sourceType ?? 'contract',
      label: 'Source evidence',
      excerpt: 'Safe excerpt.'
    }
  };
}

function fakeSupabase(updates: Record<string, unknown>[]) {
  return {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return chain({ data: { ...actionRecord(), ...payload }, error: null });
        }
      };
    }
  };
}

function chain(result: { data: unknown; error: unknown }) {
  return {
    eq: () => chain(result),
    select: () => chain(result),
    single: async () => result
  };
}
