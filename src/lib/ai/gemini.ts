export function parseGeminiJsonResponse<T>(content: string | undefined): T {
  const normalized = normalizeJsonContent(content);
  if (!normalized) {
    throw new Error('Gemini returned no structured content.');
  }

  try {
    return JSON.parse(normalized) as T;
  } catch {
    throw new Error('Gemini returned invalid structured content.');
  }
}

function normalizeJsonContent(content: string | undefined): string {
  const trimmed = content?.trim() ?? '';
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}
