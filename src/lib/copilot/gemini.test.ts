import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateGeminiJson } from '../ai/geminiClient';
import {
  buildSafeFallbackCopilotResponse,
  generateCopilotReadOnlyResponse,
  groundCopilotResponse,
  safeCopilotGeminiErrorSummary,
  validateCopilotGeminiOutput
} from './gemini';
import { buildCopilotGeminiPrompt, leakProofCopilotSystemInstruction } from './prompts';
import type { CopilotGeminiInput } from './gemini';
import type { CopilotResponse } from './schema';
import type { CopilotToolExecution } from './tools';

vi.mock('../ai/geminiClient', () => ({
  generateGeminiJson: vi.fn()
}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';

describe('Gemini read-only Copilot', () => {
  beforeEach(() => {
    vi.mocked(generateGeminiJson).mockReset();
  });

  it('validates Gemini JSON against the Copilot response schema', () => {
    const parsed = validateCopilotGeminiOutput(validResponse({
      answer: 'Customer-facing leakage is 1750 USD. Internal exposure is 17000 USD.'
    }));

    expect(parsed.answer_type).toBe('direct_answer');
    expect(parsed.mode).toBe('read_only');
  });

  it('returns a deterministic safe fallback when Gemini output is invalid', () => {
    expect(() => validateCopilotGeminiOutput({ answer: '' })).toThrow();

    const fallback = buildSafeFallbackCopilotResponse({
      routedToolNames: ['getAnalyticsSummary'],
      executions: [analyticsExecution()],
      warnings: []
    });

    expect(fallback.answer).toContain('Customer-facing leakage is 175000 USD minor units');
    expect(fallback.suggested_actions).toEqual([]);
  });

  it('uses analytics tool data for total leakage and keeps internal exposure separate', async () => {
    vi.mocked(generateGeminiJson).mockResolvedValue({
      data: validResponse({
        answer: 'Customer-facing leakage is 1750 USD. Internal unapproved exposure is 17000 USD and remains separate.'
      }),
      provenance: provenance()
    });

    const result = await generateCopilotReadOnlyResponse(inputWithExecutions([analyticsExecution()]));

    expect(result.response.data).toEqual({
      getAnalyticsSummary: analyticsExecution().output
    });
    expect(result.response.answer).toContain('Customer-facing leakage');
    expect(result.response.answer).toContain('Internal unapproved exposure');
  });

  it('rejects invented total leakage numbers from Gemini', async () => {
    vi.mocked(generateGeminiJson).mockResolvedValue({
      data: validResponse({
        answer: 'Customer-facing leakage is 9999 USD.'
      }),
      provenance: provenance()
    });

    await expect(generateCopilotReadOnlyResponse(inputWithExecutions([analyticsExecution()]))).rejects.toThrow(
      'copilot_gemini_ungrounded_numbers'
    );
  });

  it('does not let a finding explanation alter the deterministic amount', () => {
    const response = validResponse({
      routed_tool_names: ['getFindingDetail'],
      answer_type: 'finding_explanation',
      answer: 'This finding amount is 450 USD based on the formula.'
    });

    expect(() => groundCopilotResponse(response, inputWithExecutions([findingDetailExecution()]))).toThrow(
      'copilot_gemini_ungrounded_numbers'
    );
  });

  it('forces suggested mutating actions to require confirmation and a non-low risk level', () => {
    const grounded = groundCopilotResponse(
      validResponse({
        answer: 'The report is not ready because approved evidence is missing.',
        suggested_actions: [
          {
            label: 'Approve evidence',
            description: 'Approve the evidence for this finding.',
            requiresConfirmation: false,
            riskLevel: 'low'
          }
        ]
      }),
      inputWithExecutions([reportReadinessExecution()])
    );

    expect(grounded.suggested_actions).toEqual([
      {
        label: 'Approve evidence',
        description: 'Approve the evidence for this finding.',
        requiresConfirmation: true,
        riskLevel: 'medium'
      }
    ]);
  });

  it('redacts raw contract-like fields from Gemini prompt context', () => {
    const prompt = buildCopilotGeminiPrompt(inputWithExecutions([
      {
        toolName: 'getFindingDetail',
        inputRefs: { organization_id: organizationId, workspace_id: workspaceId, finding_id: findingId },
        outputRefs: { finding_id: findingId },
        output: {
          finding_id: findingId,
          content: 'Raw contract text should never appear.',
          invoice_id: 'invoice-123',
          formula: 'minimum_commitment_minor - billed_minor'
        }
      }
    ]));

    expect(prompt).not.toContain('Raw contract text should never appear.');
    expect(prompt).not.toContain('invoice-123');
    expect(prompt).toContain('[redacted]');
  });

  it('includes required finance-audit guardrails in the system prompt', () => {
    const prompt = leakProofCopilotSystemInstruction();

    expect(prompt).toContain('You are LeakProof Copilot, a finance audit assistant.');
    expect(prompt).toContain('You do not invent numbers.');
    expect(prompt).toContain('Customer-facing leakage means approved, customer_ready, recovered only.');
    expect(prompt).toContain('Draft and needs_review are internal pipeline, not customer-facing leakage.');
    expect(prompt).toContain('You do not approve findings, evidence, or reports.');
    expect(prompt).toContain('Finding intelligence is advisory only');
  });

  it('falls back safely when intelligence model output is invalid', async () => {
    vi.mocked(generateGeminiJson).mockResolvedValue({
      data: { answer: '' },
      provenance: provenance()
    });
    const executions = [evidenceQualityExecution()];

    await expect(generateCopilotReadOnlyResponse(inputWithExecutions(executions))).rejects.toThrow();
    const fallback = buildSafeFallbackCopilotResponse({
      routedToolNames: ['evidenceQualityReview'],
      executions,
      warnings: []
    });

    expect(safeCopilotGeminiErrorSummary(new Error('schema validation failed'))).toBe('Gemini output failed structured validation.');
    expect(fallback.answer).toContain('advisory');
    expect(fallback.suggested_actions).toEqual([]);
  });
});

function validResponse(overrides: Partial<CopilotResponse> = {}): CopilotResponse {
  return {
    mode: 'read_only',
    thread_id: null,
    routed_tool_names: ['getAnalyticsSummary'],
    answer_type: 'direct_answer',
    answer: 'Customer-facing leakage is 1750 USD. Internal exposure is 17000 USD.',
    data: {},
    warnings: [],
    suggested_actions: [],
    action_cards: [],
    persisted: {
      thread_id: null,
      user_message_id: null,
      assistant_message_id: null
    },
    ...overrides
  };
}

function inputWithExecutions(executions: CopilotToolExecution[]): CopilotGeminiInput {
  return {
    userIntentSummary: 'User asked for read-only leakage analytics.',
    userRole: 'reviewer',
    organizationId,
    workspaceId,
    threadId: '44444444-4444-4444-8444-444444444444',
    routedToolNames: executions.map((execution) => execution.toolName),
    entityReferences: [
      { type: 'organization', id: organizationId },
      { type: 'workspace', id: workspaceId }
    ],
    executions,
    warnings: []
  };
}

function analyticsExecution(): CopilotToolExecution {
  return {
    toolName: 'getAnalyticsSummary',
    inputRefs: { organization_id: organizationId, workspace_id: workspaceId },
    outputRefs: { tool_name: 'getAnalyticsSummary' },
    output: {
      currency: 'USD',
      total_customer_facing_leakage_minor: 175_000,
      recoverable_leakage_minor: 125_000,
      prevented_leakage_minor: 50_000,
      recovered_amount_minor: 25_000,
      internal_unapproved_exposure_minor: 1_700_000
    }
  };
}

function findingDetailExecution(): CopilotToolExecution {
  return {
    toolName: 'getFindingDetail',
    inputRefs: { organization_id: organizationId, workspace_id: workspaceId, finding_id: findingId },
    outputRefs: { finding_id: findingId },
    output: {
      finding_id: findingId,
      amount_minor: 40_000,
      currency: 'USD',
      formula: 'minimum_commitment_minor - billed_minor',
      calculation_inputs: {
        minimum_commitment_minor: 100_000,
        billed_minor: 60_000
      }
    }
  };
}

function reportReadinessExecution(): CopilotToolExecution {
  return {
    toolName: 'checkReportReadiness',
    inputRefs: { organization_id: organizationId, workspace_id: workspaceId },
    outputRefs: { report_ready: false, included_findings_count: 0 },
    output: {
      report_ready: false,
      included_findings_count: 0,
      missing_approved_evidence: [findingId]
    }
  };
}

function evidenceQualityExecution(): CopilotToolExecution {
  return {
    toolName: 'evidenceQualityReview',
    inputRefs: { organization_id: organizationId, workspace_id: workspaceId, finding_id: findingId },
    outputRefs: { finding_id: findingId, advisory_only: true },
    output: {
      finding_id: findingId,
      strong_evidence: [],
      weak_evidence: [],
      conflicting_evidence: [],
      needs_more_evidence: ['Approved contract evidence is required for money findings.'],
      overall: 'needs_more_evidence',
      advisory_only: true
    }
  };
}

function provenance() {
  return {
    provider: 'gemini' as const,
    model: 'gemini-test',
    modelVersion: 'test-version',
    promptVersion: 'copilot-read-only-v1'
  };
}
