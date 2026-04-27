import { generateGeminiJson, type GeminiProvenance } from '../ai/geminiClient';
import { redactSafeText, type CopilotEntityReference } from './redaction';
import {
  buildCopilotGeminiPrompt,
  COPILOT_GEMINI_PROMPT_VERSION,
  leakProofCopilotSystemInstruction,
  summarizeCopilotGeminiOutput
} from './prompts';
import {
  copilotResponseSchema,
  type CopilotAnswerType,
  type CopilotResponse,
  type CopilotSuggestedAction,
  type CopilotToolName
} from './schema';
import { buildCopilotAnswer, type CopilotToolExecution } from './tools';

export type CopilotGeminiInput = {
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
  warnings: string[];
};

export type CopilotGeminiResult = {
  response: CopilotResponse;
  provenance: GeminiProvenance;
};

export async function generateCopilotReadOnlyResponse(input: CopilotGeminiInput): Promise<CopilotGeminiResult> {
  const prompt = buildCopilotGeminiPrompt(input);
  const result = await generateGeminiJson<unknown>({
    prompt,
    systemInstruction: leakProofCopilotSystemInstruction(),
    promptVersion: COPILOT_GEMINI_PROMPT_VERSION
  });
  const parsed = validateCopilotGeminiOutput(result.data);
  const grounded = groundCopilotResponse(parsed, input);

  return {
    response: grounded,
    provenance: result.provenance
  };
}

export function validateCopilotGeminiOutput(output: unknown): CopilotResponse {
  return copilotResponseSchema.parse(output);
}

export function buildSafeFallbackCopilotResponse(input: {
  routedToolNames: CopilotToolName[];
  executions: CopilotToolExecution[];
  warnings: string[];
  threadId?: string | null;
  persisted?: CopilotResponse['persisted'];
}): CopilotResponse {
  return copilotResponseSchema.parse({
    mode: 'read_only',
    thread_id: input.threadId ?? null,
    routed_tool_names: input.routedToolNames,
    answer_type: inferAnswerType(input.routedToolNames),
    answer: buildCopilotAnswer(input.executions),
    data: dataFromExecutions(input.executions),
    warnings: input.warnings,
    suggested_actions: [],
    action_cards: [],
    persisted: input.persisted ?? {
      thread_id: null,
      user_message_id: null,
      assistant_message_id: null
    }
  });
}

export function groundCopilotResponse(response: CopilotResponse, input: CopilotGeminiInput): CopilotResponse {
  if (hasUngroundedNumericClaims(response.answer, input.executions)) {
    throw new Error('copilot_gemini_ungrounded_numbers');
  }

  const routedToolNames = input.routedToolNames;
  return copilotResponseSchema.parse({
    ...response,
    mode: 'read_only',
    thread_id: null,
    routed_tool_names: routedToolNames,
    answer_type: response.answer_type ?? inferAnswerType(routedToolNames),
    answer: redactSafeText(response.answer, buildCopilotAnswer(input.executions)),
    data: dataFromExecutions(input.executions),
    warnings: sanitizeWarnings([...input.warnings, ...response.warnings]),
    suggested_actions: response.suggested_actions.map(enforceSuggestedActionSafety).slice(0, 6),
    action_cards: [],
    persisted: {
      thread_id: null,
      user_message_id: null,
      assistant_message_id: null
    }
  });
}

export function finalizeCopilotResponsePersistence(
  response: CopilotResponse,
  persisted: CopilotResponse['persisted']
): CopilotResponse {
  return copilotResponseSchema.parse({
    ...response,
    thread_id: persisted.thread_id,
    persisted
  });
}

export function safeCopilotGeminiErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'copilot_gemini_ungrounded_numbers') {
      return 'Gemini output contained ungrounded numeric claims.';
    }
    if (/structured content|invalid|Zod|parse|schema/i.test(error.message)) {
      return 'Gemini output failed structured validation.';
    }
  }
  return 'Gemini read-only response unavailable; deterministic fallback used.';
}

export function geminiToolCallSummary(input: {
  response?: CopilotResponse;
  provenance?: GeminiProvenance;
  fallbackUsed: boolean;
  errorSummary?: string | null;
}): Record<string, unknown> {
  return summarizeCopilotGeminiOutput(input);
}

function dataFromExecutions(executions: CopilotToolExecution[]): Record<string, unknown> {
  return Object.fromEntries(executions.map((execution) => [execution.toolName, execution.output]));
}

function inferAnswerType(toolNames: CopilotToolName[]): CopilotAnswerType {
  if (toolNames.includes('falsePositiveRiskCheck')) return 'false_positive_risk';
  if (toolNames.includes('reviewerChecklist')) return 'reviewer_checklist';
  if (toolNames.includes('prepareRecoveryNote')) return 'recovery_note';
  if (toolNames.includes('prepareCfoSummary')) return 'cfo_summary';
  if (toolNames.includes('evidenceQualityReview')) return 'evidence_review';
  if (toolNames.includes('getFindingDetail') || toolNames.includes('explainFindingFormulaDeterministic')) {
    return 'finding_explanation';
  }
  if (toolNames.includes('checkReportReadiness')) return 'report_readiness';
  if (toolNames.includes('detectMissingData')) return 'missing_data';
  if (toolNames.includes('prepareCfoSummaryData') || toolNames.includes('getWorkspaceSummary')) return 'audit_summary';
  return 'direct_answer';
}

function sanitizeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings.map((warning) => redactSafeText(warning, '')).filter(Boolean))).slice(0, 8);
}

function enforceSuggestedActionSafety(action: CopilotSuggestedAction): CopilotSuggestedAction {
  const normalized = `${action.label} ${action.description}`.toLowerCase();
  const looksMutating = /\b(approve|export|send|email|invoice|delete|remove|change role|role|assign|mark|create|generate report)\b/.test(normalized);
  if (!looksMutating) return action;

  return {
    ...action,
    requiresConfirmation: true,
    riskLevel: action.riskLevel === 'low' ? 'medium' : action.riskLevel
  };
}

function hasUngroundedNumericClaims(answer: string, executions: CopilotToolExecution[]): boolean {
  const answerNumbers = normalizedNumbers(answer);
  if (answerNumbers.length === 0) return false;

  const allowedNumbers = new Set<string>();
  for (const execution of executions) {
    for (const value of numbersFromValue(execution.output)) {
      allowedNumbers.add(normalizeNumberToken(String(value)));
      if (Number.isInteger(value) && value !== 0) {
        allowedNumbers.add(normalizeNumberToken(String(value / 100)));
      }
    }
  }

  return answerNumbers.some((number) => number.length > 0 && !allowedNumbers.has(number));
}

function normalizedNumbers(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(normalizeNumberToken).filter(Boolean);
}

function normalizeNumberToken(value: string): string {
  const normalized = value.replaceAll(',', '').trim();
  if (!normalized.includes('.')) return normalized;
  return normalized.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function numbersFromValue(value: unknown): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(numbersFromValue);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(numbersFromValue);
  return [];
}
