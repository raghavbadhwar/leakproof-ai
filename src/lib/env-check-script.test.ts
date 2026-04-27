import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = join(process.cwd(), 'scripts/env-check.mjs');
const readinessScriptPath = join(process.cwd(), 'scripts/production-readiness.mjs');

const validEnv = {
  GEMINI_API_KEY: 'gemini-test-key',
  GEMINI_GENERATION_MODEL: 'gemini-2.5-pro',
  GEMINI_FAST_MODEL: 'gemini-2.5-flash',
  GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2-preview',
  GEMINI_EMBEDDING_DIMENSION: '1536',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  NEXT_PUBLIC_APP_URL: 'https://leakproof-ai.vercel.app'
};

describe('production env check script', () => {
  it('passes with the required production-shaped environment', () => {
    const result = runEnvCheck(validEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Production environment check passed.');
  });

  it('fails gracefully when required variables are absent', () => {
    const result = runEnvCheck({});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production environment check failed.');
    expect(result.stderr).toContain('Missing: GEMINI_API_KEY');
    expect(result.stderr).not.toContain('undefined');
  });

  it('rejects invalid app URLs', () => {
    const result = runEnvCheck({ ...validEnv, NEXT_PUBLIC_APP_URL: 'not-a-url' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NEXT_PUBLIC_APP_URL must be a valid URL.');
  });

  it('rejects non-Supabase project URLs', () => {
    const result = runEnvCheck({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NEXT_PUBLIC_SUPABASE_URL must be an HTTPS Supabase project URL.');
  });

  it('rejects service-role and anon key reuse', () => {
    const result = runEnvCheck({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'same-key',
      SUPABASE_SERVICE_ROLE_KEY: 'same-key'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SUPABASE_SERVICE_ROLE_KEY must not equal NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  });

  it('rejects embedding dimensions that do not match the database schema', () => {
    const result = runEnvCheck({ ...validEnv, GEMINI_EMBEDDING_DIMENSION: '3072' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GEMINI_EMBEDDING_DIMENSION must match the database schema dimension: 1536.');
  });
});

describe('production readiness script', () => {
  it('separates automated env checks from manual launch checks', () => {
    const result = spawnSync(process.execPath, [readinessScriptPath, '--no-env-files'], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        NODE_ENV: 'test',
        ...validEnv
      },
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Automated checks');
    expect(result.stdout).toContain('Manual checks');
    expect(result.stdout).toContain('supabase link --project-ref');
    expect(result.stdout).toContain('NEXT_PUBLIC_APP_URL=https://leakproof-ai.vercel.app pnpm smoke');
  });

  it('fails before manual launch when automated env checks fail', () => {
    const result = spawnSync(process.execPath, [readinessScriptPath, '--no-env-files'], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        NODE_ENV: 'test'
      },
      encoding: 'utf8'
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Automated checks');
    expect(result.stdout).toContain('Manual checks');
    expect(result.stderr).toContain('Production environment check failed.');
  });
});

function runEnvCheck(env: Record<string, string>) {
  return spawnSync(process.execPath, [scriptPath, '--no-env-files'], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_ENV: 'test',
      ...env
    },
    encoding: 'utf8'
  });
}
