import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
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

const optional = ['SENTRY_DSN'];
const fileEnv = loadEnvFiles(['.env.local', '.env.production.local']);
const env = { ...fileEnv, ...process.env };

const missing = required.filter((name) => !hasUsableValue(env[name]));
const suspicious = required.filter((name) => isPlaceholder(env[name]));

if (missing.length > 0 || suspicious.length > 0) {
  console.error('Production environment check failed.');
  if (missing.length > 0) {
    console.error(`Missing: ${missing.join(', ')}`);
  }
  if (suspicious.length > 0) {
    console.error(`Placeholder values: ${suspicious.join(', ')}`);
  }
  console.error('Set these locally or in Vercel before running live Supabase/Gemini workflows.');
  process.exit(1);
}

console.log('Production environment check passed.');
console.log(`Required variables present: ${required.length}`);
console.log(`Optional variables present: ${optional.filter((name) => hasUsableValue(env[name])).length}/${optional.length}`);

function loadEnvFiles(fileNames) {
  const merged = {};
  for (const fileName of fileNames) {
    const path = resolve(process.cwd(), fileName);
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

function hasUsableValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && !isPlaceholder(value);
}

function isPlaceholder(value) {
  if (!value) return false;
  return /^(changeme|change-me|placeholder|todo|your_|your-)/i.test(value.trim());
}
