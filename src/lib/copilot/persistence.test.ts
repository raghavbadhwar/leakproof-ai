import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Copilot assistant persistence hardening', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/009_copilot_read_only_assistant.sql'), 'utf8');

  it('does not add raw-sensitive assistant table columns', () => {
    const forbiddenColumnPattern = /^\s*(prompt|raw_prompt|raw_content|contract_text|invoice_contents|embedding|model_output|model_response|email_body)\b/im;

    expect(migration).not.toMatch(forbiddenColumnPattern);
    expect(migration).toContain('safe_summary text not null');
    expect(migration).toContain('referenced_entities jsonb not null');
    expect(migration).toContain('input_refs jsonb not null');
    expect(migration).toContain('output_refs jsonb not null');
  });

  it('does not allow direct browser writes to assistant persistence tables', () => {
    const assistantPolicies = migration
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => /^create policy/i.test(statement) && /on public\.assistant_/i.test(statement));
    const writePolicies = assistantPolicies.filter((statement) => /\bfor\s+(insert|update|delete)\b/i.test(statement));

    expect(writePolicies).toEqual([]);
    expect(assistantPolicies.some((statement) => /\bfor\s+select\b/i.test(statement))).toBe(true);
  });
});
