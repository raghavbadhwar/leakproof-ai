import { describe, expect, it } from 'vitest';
import { sharedAiPromptRulesText } from './promptRules';

describe('shared AI prompt rules', () => {
  it('states the core finance and human-approval guardrails', () => {
    const rules = sharedAiPromptRulesText();

    expect(rules).toContain('AI is advisory');
    expect(rules).toContain('Code calculates money');
    expect(rules).toContain('Human approves');
    expect(rules).toContain('Never invent numbers');
    expect(rules).toContain('Distinguish customer-facing leakage from internal unapproved exposure');
    expect(rules).toContain('Never provide legal advice');
    expect(rules).toContain('Never approve findings');
    expect(rules).toContain('export reports');
    expect(rules).toContain('send emails');
    expect(rules).toContain('create invoices');
  });
});
