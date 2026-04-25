import { z } from 'zod';

export const embeddingDimensionSchema = z.coerce.number().int().refine(
  (value) => [768, 1536, 3072].includes(value),
  'Gemini embedding dimension must be one of 768, 1536, or 3072.'
);

export const aiConfigSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_GENERATION_MODEL: z.string().min(1),
  GEMINI_FAST_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_DIMENSION: embeddingDimensionSchema,
  AI_PROVIDER_FALLBACK_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
});

export type AiConfig = {
  provider: 'gemini';
  generation: {
    model: string;
    fastModel: string;
  };
  embedding: {
    model: string;
    dimension: 768 | 1536 | 3072;
  };
  fallbackEnabled: boolean;
};

export function validateEmbeddingDimension(value: string | number | undefined): 768 | 1536 | 3072 {
  return embeddingDimensionSchema.parse(value) as 768 | 1536 | 3072;
}

export function validateAiConfig(env: Record<string, string | undefined>): AiConfig {
  const parsed = aiConfigSchema.parse(env);

  return {
    provider: 'gemini',
    generation: {
      model: parsed.GEMINI_GENERATION_MODEL,
      fastModel: parsed.GEMINI_FAST_MODEL
    },
    embedding: {
      model: parsed.GEMINI_EMBEDDING_MODEL,
      dimension: parsed.GEMINI_EMBEDDING_DIMENSION as 768 | 1536 | 3072
    },
    fallbackEnabled: parsed.AI_PROVIDER_FALLBACK_ENABLED === 'true'
  };
}
