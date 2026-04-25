import { describe, expect, it } from 'vitest';
import { planAuditAgentNextStep, type AuditAgentWorkspaceState } from './auditAgent';

const baseState: AuditAgentWorkspaceState = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  documents: {
    contracts: 0,
    invoiceCsvs: 0,
    usageCsvs: 0
  },
  terms: {
    extracted: 0,
    needsReview: 0,
    approved: 0,
    rejected: 0
  },
  records: {
    invoices: 0,
    usage: 0
  },
  findings: {
    draft: 0,
    needsReview: 0,
    approved: 0,
    customerReady: 0,
    recovered: 0,
    dismissed: 0,
    notRecoverable: 0
  }
};

describe('audit agent workflow planner', () => {
  it('starts by requiring contract and billing uploads', () => {
    const decision = planAuditAgentNextStep(baseState);

    expect(decision.phase).toBe('needs_uploads');
    expect(decision.canRunReconciliation).toBe(false);
    expect(decision.actions.every((action) => action.humanRequired)).toBe(true);
  });

  it('runs extraction only after source files exist', () => {
    const decision = planAuditAgentNextStep({
      ...baseState,
      documents: { contracts: 1, invoiceCsvs: 1, usageCsvs: 0 },
      records: { invoices: 12, usage: 0 }
    });

    expect(decision.phase).toBe('ready_for_extraction');
    expect(decision.canRunExtraction).toBe(true);
    expect(decision.actions[0]?.kind).toBe('extract');
  });

  it('blocks reconciliation until extracted terms are human reviewed', () => {
    const decision = planAuditAgentNextStep({
      ...baseState,
      documents: { contracts: 1, invoiceCsvs: 1, usageCsvs: 0 },
      records: { invoices: 12, usage: 0 },
      terms: { extracted: 4, needsReview: 1, approved: 0, rejected: 0 }
    });

    expect(decision.phase).toBe('needs_term_review');
    expect(decision.canRunReconciliation).toBe(false);
    expect(decision.actions[0]?.humanRequired).toBe(true);
  });

  it('allows deterministic reconciliation after approved terms and billing data exist', () => {
    const decision = planAuditAgentNextStep({
      ...baseState,
      documents: { contracts: 1, invoiceCsvs: 1, usageCsvs: 1 },
      records: { invoices: 12, usage: 6 },
      terms: { extracted: 0, needsReview: 0, approved: 5, rejected: 0 }
    });

    expect(decision.phase).toBe('ready_for_reconciliation');
    expect(decision.canRunReconciliation).toBe(true);
    expect(decision.actions[0]?.kind).toBe('reconcile');
  });

  it('requires human finding review before report export', () => {
    const decision = planAuditAgentNextStep({
      ...baseState,
      documents: { contracts: 1, invoiceCsvs: 1, usageCsvs: 0 },
      records: { invoices: 12, usage: 0 },
      terms: { extracted: 0, needsReview: 0, approved: 5, rejected: 0 },
      findings: { ...baseState.findings, draft: 2 }
    });

    expect(decision.phase).toBe('needs_finding_review');
    expect(decision.canExportReport).toBe(false);
    expect(decision.actions[0]?.kind).toBe('review_findings');
  });

  it('exports only after approved customer-facing findings exist', () => {
    const decision = planAuditAgentNextStep({
      ...baseState,
      documents: { contracts: 1, invoiceCsvs: 1, usageCsvs: 0 },
      records: { invoices: 12, usage: 0 },
      terms: { extracted: 0, needsReview: 0, approved: 5, rejected: 0 },
      findings: { ...baseState.findings, approved: 1 }
    });

    expect(decision.phase).toBe('ready_for_report');
    expect(decision.canExportReport).toBe(true);
    expect(decision.guardrails).toContain('LLM extracts contract terms only.');
  });
});
