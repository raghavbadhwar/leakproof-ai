import { describe, expect, it } from 'vitest';
import {
  cfoSummarySchema,
  copilotRequestSchema,
  copilotResponseSchema,
  evidenceQualityReviewSchema,
  recoveryNoteDraftSchema
} from './schema';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('Copilot schemas', () => {
  it('allows only read-only Copilot requests', () => {
    expect(copilotRequestSchema.parse({
      organization_id: organizationId,
      message: 'What is total leakage?'
    }).mode).toBe('read_only');

    expect(() => copilotRequestSchema.parse({
      organization_id: organizationId,
      message: 'Approve this finding.',
      mode: 'mutate'
    })).toThrow();
  });

  it('validates Phase 7 answer types and tools', () => {
    const response = copilotResponseSchema.parse({
      mode: 'read_only',
      thread_id: null,
      routed_tool_names: ['falsePositiveRiskCheck'],
      answer_type: 'false_positive_risk',
      answer: 'False-positive risk is high because required evidence is missing.',
      data: {},
      warnings: [],
      suggested_actions: [],
      action_cards: [],
      persisted: {
        thread_id: null,
        user_message_id: null,
        assistant_message_id: null
      }
    });

    expect(response.routed_tool_names).toEqual(['falsePositiveRiskCheck']);
    expect(response.answer_type).toBe('false_positive_risk');
  });

  it('requires advisory-only semantics for intelligence outputs', () => {
    expect(evidenceQualityReviewSchema.parse({
      finding_id: findingId,
      strong_evidence: [],
      weak_evidence: [],
      conflicting_evidence: [],
      needs_more_evidence: ['Approved contract evidence is required for money findings.'],
      overall: 'needs_more_evidence',
      advisory_only: true
    }).advisory_only).toBe(true);

    expect(() => evidenceQualityReviewSchema.parse({
      finding_id: findingId,
      strong_evidence: [],
      weak_evidence: [],
      conflicting_evidence: [],
      needs_more_evidence: [],
      overall: 'strong_evidence',
      advisory_only: false
    })).toThrow();
  });

  it('requires recovery notes to stay draft-only and not auto-send', () => {
    const draft = {
      finding_id: findingId,
      internal_note: 'Internal draft for reviewer.',
      customer_facing_draft: 'Customer-facing draft for human review.',
      contract_basis: 'Approved contract evidence supports the basis.',
      invoice_usage_basis: 'Approved invoice evidence supports the comparison.',
      calculation_summary: 'Calculation uses stored formula only.',
      human_review_disclaimer: 'Human review is required.',
      auto_send: false,
      advisory_only: true
    };

    expect(recoveryNoteDraftSchema.parse(draft).auto_send).toBe(false);
    expect(() => recoveryNoteDraftSchema.parse({ ...draft, auto_send: true })).toThrow();
  });

  it('keeps CFO summary customer-facing and internal amounts separate', () => {
    const summary = cfoSummarySchema.parse({
      workspace_id: workspaceId,
      currency: 'USD',
      customer_facing: {
        total_leakage_minor: 100_000,
        recoverable_leakage_minor: 80_000,
        prevented_leakage_minor: 20_000,
        recovered_amount_minor: 10_000
      },
      internal_pipeline: {
        unapproved_exposure_minor: 900_000,
        needs_review_count: 3,
        finding_count: 5
      },
      top_categories: [],
      top_customers: [],
      readiness_warnings: [],
      advisory_only: true
    });

    expect(summary.customer_facing.total_leakage_minor).toBe(100_000);
    expect(summary.internal_pipeline.unapproved_exposure_minor).toBe(900_000);
  });
});
