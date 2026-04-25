import { describe, expect, it } from 'vitest';
import { validateAiConfig, validateEmbeddingDimension } from './config';

describe('Gemini AI configuration', () => {
  it('requires Gemini credentials and model names', () => {
    expect(() => validateAiConfig({})).toThrow(/GEMINI_API_KEY/);
  });

  it('accepts production Gemini model configuration', () => {
    const config = validateAiConfig({
      GEMINI_API_KEY: 'gemini-key',
      GEMINI_GENERATION_MODEL: 'gemini-2.5-pro',
      GEMINI_FAST_MODEL: 'gemini-2.5-flash',
      GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2-preview',
      GEMINI_EMBEDDING_DIMENSION: '1536'
    });

    expect(config.provider).toBe('gemini');
    expect(config.embedding.dimension).toBe(1536);
  });

  it('only allows supported embedding dimensions', () => {
    expect(validateEmbeddingDimension('768')).toBe(768);
    expect(validateEmbeddingDimension('1536')).toBe(1536);
    expect(validateEmbeddingDimension('3072')).toBe(3072);
    expect(() => validateEmbeddingDimension('1024')).toThrow(/dimension/i);
  });
});
