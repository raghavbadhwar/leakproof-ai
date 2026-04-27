import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { loadCopilotContext, type CopilotSupabaseClient } from '@/lib/copilot/context';
import { copilotRequestSchema, copilotResponseSchema, type CopilotToolName } from '@/lib/copilot/schema';
import {
  actionCardFromRecord,
  actionForbiddenAnswer,
  actionPreparedAnswer,
  buildPendingCopilotActionProposal,
  detectCopilotActionIntent,
  insertPendingCopilotAction,
  type PendingCopilotActionProposal
} from '@/lib/copilot/actions';
import {
  routeCopilotTools,
  runCopilotTool,
  type CopilotToolExecution
} from '@/lib/copilot/tools';
import {
  buildSafeFallbackCopilotResponse,
  finalizeCopilotResponsePersistence,
  geminiToolCallSummary,
  generateCopilotReadOnlyResponse,
  safeCopilotGeminiErrorSummary
} from '@/lib/copilot/gemini';
import { COPILOT_GEMINI_PROMPT_VERSION } from '@/lib/copilot/prompts';
import {
  collectEntityReferences,
  summarizeCopilotAssistantForStorage,
  summarizeCopilotUserMessageForStorage
} from '@/lib/copilot/redaction';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = copilotRequestSchema.parse(await request.json());
    const auth = await requireWorkspaceMember(request, body.organization_id, workspaceId);

    await enforceRateLimit({
      key: `copilot:${auth.userId}:${body.organization_id}:${workspaceId}`,
      limit: 30,
      windowMs: 10 * 60 * 1000
    });

    const serviceClient = createSupabaseServiceClient();
    const supabase = serviceClient as unknown as CopilotSupabaseClient;
    const thread = await ensureAssistantThread(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      actorUserId: auth.userId,
      threadId: body.thread_id,
      message: body.message,
      selectedFindingId: body.selected_finding_id,
      selectedReportId: body.selected_report_id
    });

    const userMessage = await insertAssistantMessage(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      threadId: thread.id,
      actorUserId: auth.userId,
      role: 'user',
      safeSummary: summarizeCopilotUserMessageForStorage(body.message),
      referencedEntities: collectEntityReferences({
        organizationId: body.organization_id,
        workspaceId,
        threadId: thread.id,
        selectedFindingId: body.selected_finding_id,
        selectedReportId: body.selected_report_id,
        message: body.message
      }),
      uiPayload: {
        selected_finding_id: body.selected_finding_id ?? null,
        selected_report_id: body.selected_report_id ?? null,
        mode: body.mode
      }
    });

    const dataContext = await loadCopilotContext(supabase, {
      organizationId: body.organization_id,
      workspaceId
    });
    const routedTools = routeCopilotTools({
      organizationId: body.organization_id,
      workspaceId,
      message: body.message,
      selectedFindingId: body.selected_finding_id,
      selectedReportId: body.selected_report_id
    });
    const executions = routedTools.map((tool) => runCopilotTool(dataContext, tool.toolName, tool.input));
    const toolNames = executions.map((execution) => execution.toolName);
    const warnings = responseWarnings(executions);
    const entityReferences = collectEntityReferences({
      organizationId: body.organization_id,
      workspaceId,
      threadId: thread.id,
      selectedFindingId: body.selected_finding_id,
      selectedReportId: body.selected_report_id,
      message: body.message
    });
    let copilotDraft = buildSafeFallbackCopilotResponse({
      routedToolNames: toolNames,
      executions,
      warnings
    });
    let geminiStatus: 'completed' | 'failed' = 'completed';
    let geminiErrorSummary: string | null = null;
    let geminiWasCalled = false;
    let pendingActionProposal: PendingCopilotActionProposal | null = null;
    let geminiOutputSummary: Record<string, unknown> = geminiToolCallSummary({
      response: copilotDraft,
      fallbackUsed: true
    });
    const actionIntent = detectCopilotActionIntent({
      message: body.message,
      selectedFindingId: body.selected_finding_id,
      selectedReportId: body.selected_report_id
    });

    if (actionIntent) {
      try {
        pendingActionProposal = buildPendingCopilotActionProposal({
          context: dataContext,
          intent: actionIntent,
          actorRole: auth.role
        });
        copilotDraft = copilotResponseSchema.parse({
          ...copilotDraft,
          answer: actionPreparedAnswer(pendingActionProposal),
          warnings: [...copilotDraft.warnings, ...pendingActionProposal.preview.blockers],
          suggested_actions: []
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'forbidden') {
          copilotDraft = copilotResponseSchema.parse({
            ...copilotDraft,
            answer: actionForbiddenAnswer(),
            warnings: [...copilotDraft.warnings, 'Your role cannot prepare this Copilot action.'],
            suggested_actions: [],
            action_cards: []
          });
        } else {
          throw error;
        }
      }
    } else {
      geminiWasCalled = true;
      try {
        const gemini = await generateCopilotReadOnlyResponse({
          userIntentSummary: summarizeCopilotUserMessageForStorage(body.message),
          userRole: auth.role,
          organizationId: body.organization_id,
          workspaceId,
          threadId: thread.id,
          selectedFindingId: body.selected_finding_id,
          selectedReportId: body.selected_report_id,
          routedToolNames: toolNames,
          entityReferences,
          executions,
          warnings
        });
        copilotDraft = gemini.response;
        geminiOutputSummary = geminiToolCallSummary({
          response: gemini.response,
          provenance: gemini.provenance,
          fallbackUsed: false
        });
      } catch (error) {
        geminiStatus = 'failed';
        geminiErrorSummary = safeCopilotGeminiErrorSummary(error);
        geminiOutputSummary = geminiToolCallSummary({
          response: copilotDraft,
          fallbackUsed: true,
          errorSummary: geminiErrorSummary
        });
      }
    }

    const toolCallLogs = toolCallLogsFromExecutions(executions);
    if (geminiWasCalled) {
      toolCallLogs.push({
        toolName: 'gemini_read_only_copilot',
        status: geminiStatus,
        inputRefs: {
          prompt_version: COPILOT_GEMINI_PROMPT_VERSION,
          routed_tool_names: toolNames,
          user_intent_summary: summarizeCopilotUserMessageForStorage(body.message)
        },
        outputRefs: geminiOutputSummary,
        resultSummary: geminiStatus === 'completed'
          ? 'Gemini generated a schema-validated read-only explanation.'
          : 'Gemini explanation failed validation or generation; deterministic fallback used.',
        errorSummary: geminiErrorSummary
      });
    }

    const assistantMessage = await insertAssistantMessage(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      threadId: thread.id,
      actorUserId: auth.userId,
      role: 'assistant',
      safeSummary: summarizeCopilotAssistantForStorage(toolNames),
      referencedEntities: entityReferences,
      uiPayload: {
        mode: body.mode,
        tool_names: toolNames,
        answer_type: copilotDraft.answer_type,
        suggested_action_count: copilotDraft.suggested_actions.length,
        pending_action_count: pendingActionProposal ? 1 : 0
      }
    });

    if (pendingActionProposal) {
      const action = await insertPendingCopilotAction(supabase, {
        proposal: pendingActionProposal,
        threadId: thread.id,
        messageId: assistantMessage.id,
        actorUserId: auth.userId
      });
      const actionCard = actionCardFromRecord(action);
      copilotDraft = copilotResponseSchema.parse({
        ...copilotDraft,
        action_cards: [actionCard],
        data: {
          ...copilotDraft.data,
          assistantAction: actionCard
        }
      });
      await writeAuditEvent(serviceClient, {
        organizationId: body.organization_id,
        actorUserId: auth.userId,
        eventType: 'copilot.action_created',
        entityType: 'assistant_action',
        entityId: action.id,
        metadata: {
          action_type: action.action_type,
          risk_level: action.risk_level,
          required_role: action.required_role,
          target_entity_type: action.target_entity_type,
          target_entity_id: action.target_entity_id,
          blocker_count: actionCard.blockers.length,
          execution_deferred: true
        }
      });
    }

    await insertToolCalls(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      threadId: thread.id,
      assistantMessageId: assistantMessage.id,
      toolCalls: toolCallLogs
    });

    const response = copilotResponseSchema.parse(
      finalizeCopilotResponsePersistence(copilotDraft, {
        thread_id: thread.id,
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id
      })
    );

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

type AssistantToolCallLog = {
  toolName: string;
  status: 'completed' | 'failed';
  inputRefs: Record<string, unknown>;
  outputRefs: Record<string, unknown>;
  resultSummary: string;
  errorSummary?: string | null;
};

async function ensureAssistantThread(
  supabase: CopilotSupabaseClient,
  input: {
    organizationId: string;
    workspaceId: string;
    actorUserId: string;
    threadId?: string;
    message: string;
    selectedFindingId?: string;
    selectedReportId?: string;
  }
): Promise<{ id: string }> {
  if (input.threadId) {
    const { data, error } = await supabase
      .from('assistant_threads')
      .select('id')
      .eq('id', input.threadId)
      .eq('organization_id', input.organizationId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();
    if (error || !isRowWithId(data)) throw new Error('forbidden');
    return { id: data.id };
  }

  const { data, error } = await supabase
    .from('assistant_threads')
    .insert({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      created_by: input.actorUserId,
      title_safe_summary: summarizeCopilotUserMessageForStorage(input.message),
      referenced_entities: collectEntityReferences({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        selectedFindingId: input.selectedFindingId,
        selectedReportId: input.selectedReportId,
        message: input.message
      })
    })
    .select('id')
    .single();

  if (error || !isRowWithId(data)) throw error ?? new Error('assistant_thread_insert_failed');
  return { id: data.id };
}

async function insertAssistantMessage(
  supabase: CopilotSupabaseClient,
  input: {
    organizationId: string;
    workspaceId: string;
    threadId: string;
    actorUserId: string;
    role: 'user' | 'assistant';
    safeSummary: string;
    referencedEntities: unknown[];
    uiPayload: Record<string, unknown>;
  }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .insert({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      thread_id: input.threadId,
      actor_user_id: input.actorUserId,
      role: input.role,
      safe_summary: input.safeSummary,
      referenced_entities: input.referencedEntities,
      ui_payload: input.uiPayload
    })
    .select('id')
    .single();

  if (error || !isRowWithId(data)) throw error ?? new Error('assistant_message_insert_failed');
  return { id: data.id };
}

async function insertToolCalls(
  supabase: CopilotSupabaseClient,
  input: {
    organizationId: string;
    workspaceId: string;
    threadId: string;
    assistantMessageId: string;
    toolCalls: AssistantToolCallLog[];
  }
): Promise<void> {
  if (input.toolCalls.length === 0) return;

  const { error } = await supabase.from('assistant_tool_calls').insert(
    input.toolCalls.map((toolCall) => ({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      thread_id: input.threadId,
      assistant_message_id: input.assistantMessageId,
      tool_name: toolCall.toolName,
      status: toolCall.status,
      input_refs: toolCall.inputRefs,
      output_refs: toolCall.outputRefs,
      result_summary: toolCall.resultSummary,
      error_summary: toolCall.errorSummary ?? null
    }))
  );

  if (error) throw error;
}

function toolCallLogsFromExecutions(executions: CopilotToolExecution[]): AssistantToolCallLog[] {
  return executions.map((execution) => ({
    toolName: execution.toolName,
    status: 'completed',
    inputRefs: execution.inputRefs,
    outputRefs: execution.outputRefs,
    resultSummary: safeToolResultSummary(execution.toolName, execution.outputRefs)
  }));
}

function safeToolResultSummary(toolName: CopilotToolName, outputRefs: Record<string, unknown>): string {
  if (toolName === 'getFindings' && Array.isArray(outputRefs.finding_ids)) {
    return `Returned ${outputRefs.finding_ids.length} finding references.`;
  }
  if (toolName === 'checkReportReadiness') {
    return `Report readiness checked: ${String(outputRefs.report_ready)}.`;
  }
  if (['evidenceQualityReview', 'falsePositiveRiskCheck', 'reviewerChecklist', 'prepareCfoSummary', 'prepareRecoveryNote'].includes(toolName)) {
    return `Completed advisory intelligence tool ${toolName}.`;
  }
  return `Completed read-only tool ${toolName}.`;
}

function responseWarnings(executions: CopilotToolExecution[]): string[] {
  return executions.flatMap((execution) => {
    if (execution.toolName === 'getWorkspaceSummary' && isRecord(execution.output) && Array.isArray(execution.output.readiness_warnings)) {
      return execution.output.readiness_warnings.filter((warning): warning is string => typeof warning === 'string');
    }
    if (execution.toolName === 'checkReportReadiness' && isRecord(execution.output) && execution.output.report_ready === false) {
      return ['Report is not ready for customer-facing export yet.'];
    }
    if (execution.toolName === 'evidenceQualityReview' && isRecord(execution.output)) {
      const warnings: string[] = [];
      if (Array.isArray(execution.output.needs_more_evidence) && execution.output.needs_more_evidence.length > 0) {
        warnings.push('Evidence quality review found missing required evidence.');
      }
      if (Array.isArray(execution.output.conflicting_evidence) && execution.output.conflicting_evidence.length > 0) {
        warnings.push('Evidence quality review found possible conflicting evidence.');
      }
      return warnings;
    }
    if (execution.toolName === 'falsePositiveRiskCheck' && isRecord(execution.output) && execution.output.riskLevel === 'high') {
      return ['False-positive risk is high; resolve reviewer checklist items before approval.'];
    }
    return [];
  });
}

function isRowWithId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
