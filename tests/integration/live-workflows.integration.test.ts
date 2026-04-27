import { describe, expect, it } from 'vitest';

const runIntegration = process.env.RUN_INTEGRATION === '1';
const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'GEMINI_GENERATION_MODEL',
  'GEMINI_EMBEDDING_MODEL',
  'GEMINI_EMBEDDING_DIMENSION',
  'INTEGRATION_OWNER_EMAIL',
  'INTEGRATION_OWNER_PASSWORD',
  'INTEGRATION_ORGANIZATION_ID',
  'INTEGRATION_WORKSPACE_ID'
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const describeLive = runIntegration ? describe : describe.skip;

describeLive('live Supabase and Gemini integration workflows', () => {
  it('has explicit live credentials before integration tests run', () => {
    expect(missingEnv).toEqual([]);
  });

  it.todo('real Supabase Auth signs in the seeded owner persona');
  it.todo('real upload stores a contract, invoice CSV, and usage CSV under the tenant workspace');
  it.todo('real extraction returns cited contract terms from Gemini without logging raw text');
  it.todo('real embedding creates tenant-scoped document embeddings and semantic search results');
  it.todo('real report generation includes only approved findings and approved evidence');
});
