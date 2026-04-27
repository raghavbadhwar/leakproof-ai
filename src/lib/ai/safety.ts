import { aiEntityReferenceTypeSchema, type AiEntityReferenceType, type AiSafeEntityReference } from './taskTypes';

const MAX_SAFE_TEXT_LENGTH = 800;
const MAX_SAFE_EXCERPT_LENGTH = 500;
const MAX_RAW_SOURCE_TEXT_LENGTH = 1200;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|ai|co|in|us|uk|dev)\b/gi;
const PHONE_PATTERN = /\b(?:\+\d{1,3}[\s.])?(?:\(?\d{3}\)?[\s.]\d{3}[\s.]\d{4})\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi;
const GEMINI_KEY_PATTERN = /\bAIza[0-9A-Za-z_-]{20,}\b/g;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const ENV_SECRET_ASSIGNMENT_PATTERN = /\b(?:SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|OPENAI_API_KEY)\s*[:=]\s*\S+/gi;

const SECRET_VALUE_PATTERNS = [
  BEARER_PATTERN,
  GEMINI_KEY_PATTERN,
  OPENAI_KEY_PATTERN,
  JWT_PATTERN,
  ENV_SECRET_ASSIGNMENT_PATTERN
];

const SENSITIVE_KEY_PATTERNS = [
  /raw/i,
  /contract[_-]?(text|content|body)/i,
  /invoice[_-]?(text|content|contents|rows?|line[_-]?items?)/i,
  /usage[_-]?(raw|rows?|content|contents)/i,
  /document[_-]?(text|content|contents|body)/i,
  /source[_-]?(text|content|contents|body)/i,
  /full[_-]?(text|content|contents|response|output)/i,
  /prompt/i,
  /model[_-]?(response|output|raw)/i,
  /gemini[_-]?(response|output|raw)/i,
  /embedding|vector/i,
  /api[_-]?key/i,
  /authorization/i,
  /secret/i,
  /token/i,
  /password/i,
  /session/i,
  /storage[_-]?path/i,
  /file[_-]?name/i,
  /customer[_-]?(name|email|domain|phone|contact)/i,
  /^email$/i,
  /email[_-]?address/i,
  /^domain$/i,
  /phone/i,
  /pii/i
];

const RAW_SOURCE_KEY_PATTERNS = [
  /raw/i,
  /contract[_-]?(text|content|body)/i,
  /invoice[_-]?(text|content|contents|rows?|line[_-]?items?)/i,
  /usage[_-]?(raw|rows?|content|contents)/i,
  /document[_-]?(text|content|contents|body)/i,
  /source[_-]?(text|content|contents|body)/i,
  /full[_-]?(text|content|contents|response|output)/i,
  /prompt/i,
  /model[_-]?(response|output|raw)/i,
  /gemini[_-]?(response|output|raw)/i,
  /embedding|vector/i
];

const SECRET_KEY_PATTERNS = [
  /api[_-]?key/i,
  /authorization/i,
  /secret/i,
  /token/i,
  /password/i,
  /session/i,
  /credential/i
];

export function redactSensitiveAiInput<T>(value: T): T {
  return redactAiValue(value) as T;
}

export function redactSensitiveAiOutput<T>(value: T): T {
  return redactAiValue(value) as T;
}

export function assertNoRawSourceText(value: unknown): void {
  visitAiValue(value, (entry) => {
    if (
      typeof entry.key === 'string' &&
      RAW_SOURCE_KEY_PATTERNS.some((pattern) => pattern.test(entry.key as string)) &&
      hasSubstantiveValue(entry.value)
    ) {
      throw new Error(`AI payload contains raw source data at ${entry.path}.`);
    }

    if (typeof entry.value === 'string' && normalizedText(entry.value).length > MAX_RAW_SOURCE_TEXT_LENGTH) {
      throw new Error(`AI payload contains overlong source text at ${entry.path}.`);
    }
  });
}

export function assertNoSecrets(value: unknown): void {
  visitAiValue(value, (entry) => {
    if (
      typeof entry.key === 'string' &&
      SECRET_KEY_PATTERNS.some((pattern) => pattern.test(entry.key as string)) &&
      hasSubstantiveValue(entry.value)
    ) {
      throw new Error(`AI payload contains secret-bearing metadata at ${entry.path}.`);
    }

    if (typeof entry.value === 'string' && containsSecretValue(entry.value)) {
      throw new Error(`AI payload contains a secret-like value at ${entry.path}.`);
    }
  });
}

export function truncateSafeExcerpt(value: string | null | undefined, maxLength = MAX_SAFE_EXCERPT_LENGTH): string {
  const normalized = redactSensitiveText(value ?? '');
  if (!normalized) return '';

  const limit = Math.max(40, Math.min(maxLength, 2000));
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

export function safeEntityReference(input: {
  type: AiEntityReferenceType;
  id: string;
  label?: string | null;
}): AiSafeEntityReference {
  const type = aiEntityReferenceTypeSchema.parse(input.type);
  const id = truncateSafeIdentifier(input.id);
  const label = input.label ? truncateSafeExcerpt(input.label, 180) : undefined;

  const reference: AiSafeEntityReference = { type, id };
  if (label) reference.label = label;
  return reference;
}

function redactAiValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;

  if (key && SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    return '[redacted]';
  }

  if (typeof value === 'string') {
    return truncateString(redactSensitiveText(value), MAX_SAFE_TEXT_LENGTH);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactAiValue(item));
  }

  if (!isRecord(value)) return null;

  return Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => [nestedKey, redactAiValue(nestedValue, nestedKey)]));
}

function redactSensitiveText(value: string): string {
  return normalizedText(value)
    .replace(BEARER_PATTERN, '[redacted_token]')
    .replace(GEMINI_KEY_PATTERN, '[redacted_secret]')
    .replace(OPENAI_KEY_PATTERN, '[redacted_secret]')
    .replace(JWT_PATTERN, '[redacted_token]')
    .replace(ENV_SECRET_ASSIGNMENT_PATTERN, '[redacted_secret]')
    .replace(EMAIL_PATTERN, '[redacted_email]')
    .replace(DOMAIN_PATTERN, '[redacted_domain]')
    .replace(PHONE_PATTERN, '[redacted_phone]')
    .trim();
}

function truncateSafeIdentifier(value: string): string {
  const redacted = truncateSafeExcerpt(value, 180);
  if (!redacted) {
    throw new Error('AI entity reference id is required.');
  }
  return redacted;
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function containsSecretValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function hasSubstantiveValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

function visitAiValue(
  value: unknown,
  visitor: (entry: { key?: string; value: unknown; path: string }) => void,
  path = '$',
  key?: string
): void {
  visitor({ key, value, path });

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitAiValue(item, visitor, `${path}[${index}]`));
    return;
  }

  if (!isRecord(value)) return;

  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    visitAiValue(nestedValue, visitor, `${path}.${nestedKey}`, nestedKey);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
