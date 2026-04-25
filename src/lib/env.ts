import { z } from 'zod';

const serverEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_GENERATION_MODEL: z.string().min(1),
  GEMINI_FAST_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_DIMENSION: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SENTRY_DSN: z.string().url().optional().or(z.literal(''))
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function validateServerEnvObject(env: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(env);
}

export function getServerEnv(): ServerEnv {
  return validateServerEnvObject({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_GENERATION_MODEL: process.env.GEMINI_GENERATION_MODEL,
    GEMINI_FAST_MODEL: process.env.GEMINI_FAST_MODEL,
    GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL,
    GEMINI_EMBEDDING_DIMENSION: process.env.GEMINI_EMBEDDING_DIMENSION,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SENTRY_DSN: process.env.SENTRY_DSN
  });
}
