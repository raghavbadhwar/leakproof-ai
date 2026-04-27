import type { CopilotToolName } from './schema';

export type CopilotEntityReference = {
  type: 'workspace' | 'organization' | 'finding' | 'report' | 'document' | 'thread' | 'unknown';
  id: string;
};

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/g;
const SECRET_PATTERN = /\b(?:sk|pk|api|key|token|secret)[_-]?[A-Za-z0-9]{16,}\b/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;
const DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|ai|co|in|us|uk|dev)\b/gi;

const SENSITIVE_KEY_PATTERN =
  /(content|excerpt|prompt|embedding|secret|token|password|storage_path|parsed_text_path|file_name|raw|model_output|invoice_id|line_item|email|domain|customer_name|relevance_explanation)/i;

export function summarizeCopilotUserMessageForStorage(message: string): string {
  const normalized = message.toLowerCase();
  if (/\b(map|mapping|csv|columns?|headers?)\b/.test(normalized)) {
    return 'User asked for data mapping assistance.';
  }
  if (/\b(total|sum|amount|leakage|recoverable|recovered|prevented)\b/.test(normalized)) {
    return 'User asked for read-only leakage analytics.';
  }
  if (/\b(next best action|what should i do next|next step)\b/.test(normalized)) {
    return 'User asked for deterministic next-best-action guidance.';
  }
  if (/\b(needs? review|review burden|pending review|draft)\b/.test(normalized)) {
    return 'User asked for read-only review queue context.';
  }
  if (/\b(report ready|ready for report|export ready|can.*report|audit ready|readiness)\b/.test(normalized)) {
    return 'User asked for read-only report readiness.';
  }
  if (/\b(missing|upload|data gap|incomplete|no contract|no invoice|no usage)\b/.test(normalized)) {
    return 'User asked for read-only missing data detection.';
  }
  if (/\b(explain|formula|calculation|why)\b/.test(normalized)) {
    return 'User asked for a deterministic finding explanation.';
  }
  if (/\b(evidence quality|false[- ]?positive|reviewer checklist|recovery note)\b/.test(normalized)) {
    return 'User asked for advisory finding intelligence.';
  }
  if (/\b(contract hierarchy|root cause|prevention|prevent|why did.*leak)\b/.test(normalized)) {
    return 'User asked for advisory AI feature guidance.';
  }
  if (/\b(cfo|executive|summary)\b/.test(normalized)) {
    return 'User asked for safe CFO summary data.';
  }
  return 'User asked a read-only Copilot workspace question.';
}

export function summarizeCopilotAssistantForStorage(toolNames: CopilotToolName[]): string {
  return `Read-only Copilot response generated with tools: ${toolNames.join(', ')}.`;
}

export function collectEntityReferences(input: {
  organizationId: string;
  workspaceId: string;
  threadId?: string;
  selectedFindingId?: string;
  selectedReportId?: string;
  message?: string;
}): CopilotEntityReference[] {
  const references: CopilotEntityReference[] = [
    { type: 'organization', id: input.organizationId },
    { type: 'workspace', id: input.workspaceId }
  ];

  if (input.threadId) references.push({ type: 'thread', id: input.threadId });
  if (input.selectedFindingId) references.push({ type: 'finding', id: input.selectedFindingId });
  if (input.selectedReportId) references.push({ type: 'report', id: input.selectedReportId });

  for (const id of input.message?.match(UUID_PATTERN) ?? []) {
    if (!references.some((reference) => reference.id === id)) {
      references.push({ type: 'unknown', id });
    }
  }

  return references;
}

export function redactSafeText(value: string | null | undefined, fallback = 'Redacted text'): string {
  if (!value) return fallback;
  const redacted = value
    .replace(BEARER_PATTERN, '[redacted_token]')
    .replace(EMAIL_PATTERN, '[redacted_email]')
    .replace(SECRET_PATTERN, '[redacted_secret]')
    .replace(DOMAIN_PATTERN, '[redacted_domain]')
    .replace(LONG_TOKEN_PATTERN, '[redacted_token]')
    .replace(/\s+/g, ' ')
    .trim();

  if (!redacted) return fallback;
  return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
}

export function redactCalculationInputs(value: unknown): Record<string, unknown> {
  const redacted = redactCopilotOutput(value);
  if (isRecord(redacted)) return redacted;
  return {};
}

export function redactCopilotOutput<T>(value: T): T {
  return redactValue(value, []) as T;
}

function redactValue(value: unknown, path: string[]): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return redactSafeText(value, '');
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, [...path, String(index)]));
  }

  if (!isRecord(value)) return null;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = redactValue(nested, [...path, key]);
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
