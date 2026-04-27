import { buildRuntimeEnv, printEnvCheckResult, validateProductionEnv } from './env-check.mjs';

const includeEnvFiles = !process.argv.includes('--no-env-files');
const env = buildRuntimeEnv({ includeEnvFiles });
const result = validateProductionEnv(env);

console.log('LeakProof production readiness gate');
console.log('');
console.log('Automated checks');
console.log('----------------');
printEnvCheckResult(result);

console.log('');
console.log('Manual checks');
console.log('-------------');
console.log('| Status | Command or action | Owner | Expected result |');
console.log('| --- | --- | --- | --- |');
console.log('| Manual | `supabase login` | Founder/engineer | Supabase CLI is authenticated. |');
console.log('| Manual | `supabase link --project-ref <project-ref>` | Founder/engineer | Local repo points at the dedicated LeakProof Supabase project. |');
console.log('| Manual | `supabase db push` | Founder/engineer | All migrations in `supabase/migrations` are applied. |');
console.log('| Manual | Supabase dashboard: Auth > URL Configuration | Founder/engineer | Site URL and redirect URLs include the production Vercel URL and local dev URL. |');
console.log('| Manual | Google AI Studio: create or rotate Gemini API key | Founder | Key is stored only in local env and Vercel server env. |');
console.log('| Manual | `vercel link` | Founder/engineer | Repo is linked to the `leakproof-ai` Vercel project. |');
console.log('| Manual | `vercel env add <name> production` for every required variable | Founder/engineer | Vercel production env contains all required values. |');
console.log('| Manual | `vercel pull --environment=production` | Founder/engineer | Production project settings and env are available locally for final checks. |');
console.log('| Manual | `pnpm production:gate` | Founder/engineer | Env, tests, typecheck, lint, and build pass with real production env values. |');
console.log('| Manual | `pnpm test:e2e` | Founder/engineer | Mocked browser E2E passes without real customer data or live Supabase/Gemini credentials. |');
console.log('| Manual | `vercel deploy --prod` | Founder/engineer | Production deployment is created. |');
console.log('| Manual | `NEXT_PUBLIC_APP_URL=https://leakproof-ai.vercel.app pnpm smoke` | Founder/engineer | Deployed app, health route, and auth guard smoke checks pass. |');
console.log('| Manual | Browser persona test: owner/admin/reviewer/viewer | Founder/QA | Role-gated live flows behave correctly against real Supabase Auth. |');

if (!result.ok) {
  console.error('Automated environment checks must pass before manual launch verification can complete.');
}

process.exit(result.ok ? 0 : 1);
