import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { handleApiError } from '@/lib/api/responses';
import { DATA_MAPPING_PROMPT_VERSION, dataMappingSuggestRequestSchema } from '@/lib/ai/dataMappingSchema';
import { generateGeminiJson } from '@/lib/ai/geminiClient';
import { suggestDataMapping } from '@/lib/ai/dataMapping';
import { requireWorkspaceMember } from '@/lib/db/auth';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = dataMappingSuggestRequestSchema.parse(await request.json());
    const auth = await requireWorkspaceMember(request, body.organization_id, workspaceId);

    await enforceRateLimit({
      key: `data-mapping-suggest:${auth.userId}:${body.organization_id}:${workspaceId}`,
      limit: 20,
      windowMs: 10 * 60 * 1000
    });

    const suggestion = await suggestDataMapping(body, async ({ prompt, systemInstruction }) => {
      const result = await generateGeminiJson<unknown>({
        prompt,
        systemInstruction,
        promptVersion: DATA_MAPPING_PROMPT_VERSION
      });
      return result.data;
    });

    return NextResponse.json(suggestion);
  } catch (error) {
    return handleApiError(error);
  }
}
