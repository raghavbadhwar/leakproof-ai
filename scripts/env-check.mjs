import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const required = [
  'GEMINI_API_KEY',
  'GEMINI_GENERATION_MODEL',
  'GEMINI_FAST_MODEL',
  'GEMINI_EMBEDDING_MODEL',
  'GEMINI_EMBEDDING_DIMENSION',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL'
];

export const optional = ['SENTRY_DSN'];
export const geminiSupportedEmbeddingDimensions = [768, 1536, 3072];
export const databaseEmbeddingDimensions = [1536];

export function buildRuntimeEnv({ includeEnvFiles = true, cwd = process.cwd(), processEnv = process.env } = {}) {
  const fileEnv = includeEnvFiles ? loadEnvFiles(['.env.local', '.env.production.local'], cwd) : {};
  return { ...fileEnv, ...processEnv };
}

export function validateProductionEnv(env) {
  const missing = required.filter((name) => !hasValue(env[name]));
  const suspicious = required.filter((name) => hasValue(env[name]) && isPlaceholder(env[name]));
  const errors = [];

  if (hasValue(env.GEMINI_EMBEDDING_DIMENSION) && !isPlaceholder(env.GEMINI_EMBEDDING_DIMENSION)) {
    const dimension = Number(env.GEMINI_EMBEDDING_DIMENSION);
    if (!Number.isInteger(dimension)) {
      errors.push('GEMINI_EMBEDDING_DIMENSION must be an integer.');
    } else if (!geminiSupportedEmbeddingDimensions.includes(dimension)) {
      errors.push(`GEMINI_EMBEDDING_DIMENSION must be one of: ${geminiSupportedEmbeddingDimensions.join(', ')}.`);
    } else if (!databaseEmbeddingDimensions.includes(dimension)) {
      errors.push(`GEMINI_EMBEDDING_DIMENSION must match the database schema dimension: ${databaseEmbeddingDimensions.join(', ')}.`);
    }
  }

  if (hasValue(env.NEXT_PUBLIC_APP_URL) && !isPlaceholder(env.NEXT_PUBLIC_APP_URL)) {
    const appUrl = parseUrl(env.NEXT_PUBLIC_APP_URL);
    if (!appUrl) {
      errors.push('NEXT_PUBLIC_APP_URL must be a valid URL.');
    } else if (!['http:', 'https:'].includes(appUrl.protocol)) {
      errors.push('NEXT_PUBLIC_APP_URL must use http or https.');
    }
  }

  if (hasValue(env.NEXT_PUBLIC_SUPABASE_URL) && !isPlaceholder(env.NEXT_PUBLIC_SUPABASE_URL)) {
    const supabaseUrl = parseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
    if (
      !supabaseUrl ||
      supabaseUrl.protocol !== 'https:' ||
      !supabaseUrl.hostname.endsWith('.supabase.co') ||
      supabaseUrl.hostname.split('.')[0].length < 8
    ) {
      errors.push('NEXT_PUBLIC_SUPABASE_URL must be an HTTPS Supabase project URL.');
    }
  }

  if (
    hasValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    hasValue(env.SUPABASE_SERVICE_ROLE_KEY) &&
    !isPlaceholder(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    !isPlaceholder(env.SUPABASE_SERVICE_ROLE_KEY) &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() === env.SUPABASE_SERVICE_ROLE_KEY.trim()
  ) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY must not equal NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return {
    ok: missing.length === 0 && suspicious.length === 0 && errors.length === 0,
    missing,
    suspicious,
    errors,
    optionalPresent: optional.filter((name) => hasUsableValue(env[name])).length
  };
}

export function printEnvCheckResult(result) {
  if (result.ok) {
    console.log('Production environment check passed.');
    console.log(`Required variables present: ${required.length}`);
    console.log(`Optional variables present: ${result.optionalPresent}/${optional.length}`);
    console.log(`Database embedding dimension: ${databaseEmbeddingDimensions.join(', ')}`);
    return;
  }

  console.error('Production environment check failed.');
  if (result.missing.length > 0) {
    console.error(`Missing: ${result.missing.join(', ')}`);
  }
  if (result.suspicious.length > 0) {
    console.error(`Placeholder values: ${result.suspicious.join(', ')}`);
  }
  for (const error of result.errors) {
    console.error(error);
  }
  console.error('Set these locally or in Vercel before running live Supabase/Gemini workflows.');
}

function main() {
  const includeEnvFiles = !process.argv.includes('--no-env-files');
  const env = buildRuntimeEnv({ includeEnvFiles });
  const result = validateProductionEnv(env);
  printEnvCheckResult(result);
  process.exit(result.ok ? 0 : 1);
}

function loadEnvFiles(fileNames, cwd = process.cwd()) {
  const merged = {};
  for (const fileName of fileNames) {
    const path = resolve(cwd, fileName);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      merged[key.trim()] = value;
    }
  }
  return merged;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUsableValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && !isPlaceholder(value);
}

function isPlaceholder(value) {
  if (!value) return false;
  return /^(changeme|change-me|placeholder|todo|your_|your-|your\s|<.*>|\[.*\])$/i.test(value.trim());
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
