import { createHash } from 'node:crypto';

export type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type MaybePromise<T> = T | Promise<T>;

export interface RateLimiter {
  readonly backend: 'memory' | 'supabase';
  check(input: RateLimitInput): MaybePromise<RateLimitDecision>;
  reset?(): MaybePromise<void>;
}

export type SupabaseRateLimitStore = {
  consume(input: {
    keyHash: string;
    limit: number;
    windowMs: number;
    now: string;
  }): Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export class InMemoryRateLimiter implements RateLimiter {
  readonly backend = 'memory' as const;

  private readonly buckets = new Map<string, Bucket>();

  check(input: RateLimitInput): RateLimitDecision {
    const now = input.now ?? Date.now();
    const bucket = this.buckets.get(input.key);

    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + input.windowMs;
      this.buckets.set(input.key, { count: 1, resetAt });
      return { allowed: true, remaining: input.limit - 1, resetAt };
    }

    if (bucket.count >= input.limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    return { allowed: true, remaining: input.limit - bucket.count, resetAt: bucket.resetAt };
  }

  reset(): void {
    this.buckets.clear();
  }
}

export class SupabaseRateLimiter implements RateLimiter {
  readonly backend = 'supabase' as const;

  constructor(private readonly store: SupabaseRateLimitStore) {}

  async check(input: RateLimitInput): Promise<RateLimitDecision> {
    const { data, error } = await this.store.consume({
      keyHash: hashRateLimitKey(input.key),
      limit: input.limit,
      windowMs: input.windowMs,
      now: new Date(input.now ?? Date.now()).toISOString()
    });

    if (error) {
      throw new Error('rate_limit_backend_unavailable');
    }

    const row = readSupabaseRateLimitRow(data);
    if (!row) {
      throw new Error('rate_limit_backend_unavailable');
    }

    return row;
  }
}

const defaultMemoryLimiter = new InMemoryRateLimiter();
let configuredLimiter: RateLimiter | null = null;
let supabaseLimiterPromise: Promise<RateLimiter> | null = null;

export function enforceRateLimit(input: RateLimitInput): MaybePromise<void> {
  assertValidRateLimitInput(input);
  const limiter = getRateLimiter();

  if (isPromise(limiter)) {
    return limiter.then((resolvedLimiter) => enforceDecision(resolvedLimiter.check(input)));
  }

  return enforceDecision(limiter.check(input));
}

export function configureRateLimiter(limiter: RateLimiter | null): void {
  configuredLimiter = limiter;
  supabaseLimiterPromise = null;
}

export function resetRateLimitBuckets(): MaybePromise<void> {
  defaultMemoryLimiter.reset();

  if (configuredLimiter?.reset) {
    return configuredLimiter.reset();
  }
}

function enforceDecision(decision: MaybePromise<RateLimitDecision>): MaybePromise<void> {
  if (isPromise(decision)) {
    return decision.then(assertAllowed);
  }

  return assertAllowed(decision);
}

function assertAllowed(decision: RateLimitDecision): void {
  if (!decision.allowed) {
    throw new Error('rate_limited');
  }
}

function getRateLimiter(): RateLimiter | Promise<RateLimiter> {
  if (configuredLimiter) {
    return configuredLimiter;
  }

  const backend = process.env.LEAKPROOF_RATE_LIMIT_BACKEND?.trim().toLowerCase();
  if (!backend) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('rate_limit_backend_required');
    }

    return defaultMemoryLimiter;
  }

  if (backend === 'memory') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('rate_limit_backend_required');
    }

    return defaultMemoryLimiter;
  }

  if (backend === 'supabase') {
    supabaseLimiterPromise ??= createSupabaseLimiter();
    return supabaseLimiterPromise;
  }

  throw new Error('rate_limit_backend_required');
}

async function createSupabaseLimiter(): Promise<RateLimiter> {
  const { createSupabaseServiceClient } = await import('@/lib/db/supabaseServer');
  const supabase = createSupabaseServiceClient();

  return new SupabaseRateLimiter({
    async consume(input) {
      const { data, error } = await supabase.rpc('consume_api_rate_limit', {
        p_key_hash: input.keyHash,
        p_limit: input.limit,
        p_window_ms: input.windowMs,
        p_now: input.now
      });

      return { data, error };
    }
  });
}

function hashRateLimitKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function readSupabaseRateLimitRow(data: unknown): RateLimitDecision | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) return null;

  const resetAtValue = row.reset_at ?? row.resetAt;
  const resetAt = typeof resetAtValue === 'string' ? new Date(resetAtValue).getTime() : Number(resetAtValue);
  if (!Number.isFinite(resetAt)) return null;

  return {
    allowed: Boolean(row.allowed),
    remaining: Number(row.remaining ?? 0),
    resetAt
  };
}

function assertValidRateLimitInput(input: RateLimitInput): void {
  if (!input.key || input.limit < 1 || input.windowMs < 1) {
    throw new Error('rate_limit_backend_required');
  }
}

function isPromise<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
