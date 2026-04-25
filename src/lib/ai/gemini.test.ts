import { describe, expect, it } from 'vitest';
import { parseGeminiJsonResponse } from './gemini';

describe('Gemini response helpers', () => {
  it('parses JSON content from Gemini text responses', () => {
    expect(parseGeminiJsonResponse<{ ok: boolean }>('{ "ok": true }')).toEqual({ ok: true });
  });

  it('rejects missing or malformed JSON without exposing raw content in the error', () => {
    expect(() => parseGeminiJsonResponse('')).toThrow('Gemini returned no structured content.');
    expect(() => parseGeminiJsonResponse('not json')).toThrow('Gemini returned invalid structured content.');
  });
});
