import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceMember } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import {
  actionCardFromRecord,
  confirmPendingCopilotAction,
  executeConfirmedCopilotAction,
  loadAssistantAction,
  type CopilotWorkflowRunners
} from '@/lib/copilot/actions';
import { copilotActionTransitionRequestSchema } from '@/lib/copilot/schema';
import { POST as runExtractionPost } from '@/app/api/extraction/run/route';
import { POST as runReconciliationPost } from '@/app/api/reconciliation/run/route';
import { POST as generateReportPost } from '@/app/api/workspaces/[workspaceId]/report/route';
import type { CopilotSupabaseClient } from '@/lib/copilot/context';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; actionId: string }> }
) {
  try {
    const { workspaceId, actionId } = await context.params;
    const body = copilotActionTransitionRequestSchema.parse(await request.json());
    const auth = await requireWorkspaceMember(request, body.organization_id, workspaceId);
    const serviceClient = createSupabaseServiceClient();
    const supabase = serviceClient as unknown as CopilotSupabaseClient;
    const action = await loadAssistantAction(supabase, {
      organizationId: body.organization_id,
      workspaceId,
      actionId
    });
    const confirmed = await confirmPendingCopilotAction(supabase, {
      action,
      actorUserId: auth.userId,
      actorRole: auth.role
    });

    await writeAuditEvent(serviceClient, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'copilot.action_confirmed',
      entityType: 'assistant_action',
      entityId: confirmed.id,
      metadata: {
        action_type: confirmed.action_type,
        risk_level: confirmed.risk_level,
        required_role: confirmed.required_role,
        execution_mode: 'confirmed_controlled_execution'
      }
    });
    const execution = await executeConfirmedCopilotAction(supabase, {
      action: confirmed,
      actorUserId: auth.userId,
      actorRole: auth.role,
      runners: workflowRunners(request, workspaceId)
    });

    return NextResponse.json({
      action: actionCardFromRecord(execution.action),
      result: execution.result,
      message: execution.result.status === 'executed'
        ? 'Action confirmed and executed.'
        : 'Action confirmed but execution failed safely.'
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function workflowRunners(request: Request, workspaceId: string): CopilotWorkflowRunners {
  return {
    runExtraction: async ({ organizationId, sourceDocumentId }) => invokeJsonRoute(
      runExtractionPost,
      request,
      '/api/extraction/run',
      {
        organization_id: organizationId,
        workspace_id: workspaceId,
        source_document_id: sourceDocumentId
      }
    ),
    runReconciliation: async ({ organizationId }) => invokeJsonRoute(
      runReconciliationPost,
      request,
      '/api/reconciliation/run',
      {
        organization_id: organizationId,
        workspace_id: workspaceId
      }
    ),
    generateReportDraft: async ({ organizationId }) => {
      const response = await generateReportPost(
        internalJsonRequest(request, `/api/workspaces/${workspaceId}/report`, {
          organization_id: organizationId
        }),
        { params: Promise.resolve({ workspaceId }) }
      );
      return readRouteJson(response);
    }
  };
}

async function invokeJsonRoute(
  handler: (request: Request) => Promise<Response>,
  originalRequest: Request,
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await handler(internalJsonRequest(originalRequest, path, body));
  return readRouteJson(response);
}

function internalJsonRequest(originalRequest: Request, path: string, body: Record<string, unknown>): Request {
  const url = new URL(path, originalRequest.url);
  const headers = new Headers({
    'content-type': 'application/json'
  });
  const authorization = originalRequest.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

async function readRouteJson(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'copilot_workflow_route_failed';
    throw new Error(message);
  }
  return payload;
}
