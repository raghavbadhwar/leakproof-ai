import type { GeminiProvenance } from '../ai/geminiClient';
import { redactCopilotOutput, type CopilotEntityReference } from './redaction';
import type { CopilotResponse, CopilotToolName } from './schema';
import type { CopilotToolExecution } from './tools';

export const COPILOT_GEMINI_PROMPT_VERSION = 'copilot-read-only-v1';

export function leakProofCopilotSystemInstruction(): string {
  return [
    'You are LeakProof Copilot, a finance audit assistant.',
    'You explain audit data using provided tool context only.',
    'You do not invent numbers.',
    'You distinguish customer-facing leakage from internal unapproved exposure.',
    'Customer-facing leakage means approved, customer_ready, recovered only.',
    'Draft and needs_review are internal pipeline, not customer-facing leakage.',
    'You do not give legal advice.',
    'You do not approve findings, evidence, or reports.',
    'You do not change calculations.',
    'You do not send emails or create invoices.',
    'Finding intelligence is advisory only and must not change finding amount, status, evidence, report state, or customer communications.',
    'Recovery note drafts must avoid legal threats, legal conclusions, and aggressive collection language.',
    'If context is insufficient, say what is missing.',
    'Return only JSON matching the provided schema.',
    'Suggested mutating actions must have requiresConfirmation true and riskLevel medium, high, or critical.'
  ].join(' ');
}

export function buildCopilotGeminiPrompt(input: {
  userIntentSummary: string;
  userRole: string;
  organizationId: string;
  workspaceId: string;
  threadId: string | null;
  selectedFindingId?: string;
  selectedReportId?: string;
  routedToolNames: CopilotToolName[];
  entityReferences: CopilotEntityReference[];
  executions: CopilotToolExecution[];
}): string {
  return [
    'Generate a concise read-only LeakProof Copilot answer.',
    'Use only the JSON context below. Do not use outside knowledge or invent values.',
    'The server will attach the canonical tool data after validation; keep data as an empty object unless echoing simple safe refs.',
    'Use answer_type as one of: audit_summary, direct_answer, finding_explanation, evidence_review, report_readiness, missing_data, false_positive_risk, reviewer_checklist, cfo_summary, recovery_note.',
    'Use suggested_actions only for suggestions; any action that would approve, export, send, create, delete, change roles, or mutate records requires confirmation.',
    'For evidence quality, false-positive risk, reviewer checklist, CFO summary, and recovery-note requests, explain the provided advisory tool output. Do not add new facts.',
    '',
    JSON.stringify({
      prompt_version: COPILOT_GEMINI_PROMPT_VERSION,
      request: {
        user_intent_summary: input.userIntentSummary,
        user_role: input.userRole,
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        thread_id: input.threadId,
        selected_finding_id: input.selectedFindingId,
        selected_report_id: input.selectedReportId
      },
      policy: {
        customer_facing_statuses: ['approved', 'customer_ready', 'recovered'],
        internal_pipeline_statuses: ['draft', 'needs_review'],
        dismissed_and_not_recoverable_excluded: true,
        approved_evidence_only_for_reports: true,
        code_calculates_money: true,
        human_approves: true
      },
      routed_tool_names: input.routedToolNames,
      entity_references: input.entityReferences,
      tool_context: input.executions.map((execution) => ({
        tool_name: execution.toolName,
        input_refs: compactValue(redactCopilotOutput(execution.inputRefs)),
        output: compactValue(redactCopilotOutput(execution.output))
      })),
      response_shape: {
        mode: 'read_only',
        thread_id: null,
        routed_tool_names: input.routedToolNames,
        answer_type: 'direct_answer',
        answer: 'string',
        data: {},
        warnings: [],
        suggested_actions: [
          {
            label: 'string',
            description: 'string',
            requiresConfirmation: true,
            riskLevel: 'medium'
          }
        ],
        action_cards: [],
        persisted: {
          thread_id: null,
          user_message_id: null,
          assistant_message_id: null
        }
      } satisfies CopilotResponse
    })
  ].join('\n');
}

export function summarizeCopilotGeminiOutput(input: {
  response?: CopilotResponse;
  provenance?: GeminiProvenance;
  fallbackUsed: boolean;
  errorSummary?: string | null;
}): Record<string, unknown> {
  return {
    provider: input.provenance?.provider ?? 'gemini',
    model: input.provenance?.model,
    prompt_version: input.provenance?.promptVersion ?? COPILOT_GEMINI_PROMPT_VERSION,
    answer_type: input.response?.answer_type,
    suggested_action_count: input.response?.suggested_actions.length ?? 0,
    fallback_used: input.fallbackUsed,
    error_summary: input.errorSummary ?? null
  };
}

function compactValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 320 ? `${value.slice(0, 317)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => compactValue(item, depth + 1));
  if (typeof value !== 'object') return null;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 24)
      .map(([key, nested]) => [key, compactValue(nested, depth + 1)])
  );
}
