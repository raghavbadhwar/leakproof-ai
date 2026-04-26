import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateServerEnvObject } from './env';

describe('environment validation', () => {
  it('requires server secrets and public Supabase configuration', () => {
    expect(() => validateServerEnvObject({})).toThrow(/GEMINI_API_KEY/);
  });

  it('accepts the required production environment shape', () => {
    const env = validateServerEnvObject({
      GEMINI_API_KEY: 'gemini-test',
      GEMINI_GENERATION_MODEL: 'gemini-2.5-pro',
      GEMINI_FAST_MODEL: 'gemini-2.5-flash',
      GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2-preview',
      GEMINI_EMBEDDING_DIMENSION: '1536',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      NEXT_PUBLIC_APP_URL: 'https://leakproof.example'
    });

    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key');
  });

  it('keeps service-role and Gemini secrets out of client modules', () => {
    const clientEntryPoints = [
      'src/lib/db/supabaseBrowser.ts',
      'src/components/audit/RevenueAuditWorkspace.tsx',
      'src/app/login/page.tsx'
    ];
    const combinedClientSource = clientEntryPoints.map((file) => readFileSync(join(process.cwd(), file), 'utf8')).join('\n');

    expect(combinedClientSource).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|getServerEnv|supabaseServer|geminiClient/);
  });
});
