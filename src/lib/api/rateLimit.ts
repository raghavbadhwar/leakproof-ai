type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(input: RateLimitInput): void {
  const now = input.now ?? Date.now();
  const bucket = buckets.get(input.key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return;
  }

  if (bucket.count >= input.limit) {
    throw new Error('rate_limited');
  }

  bucket.count += 1;
}

export function resetRateLimitBuckets(): void {
  buckets.clear();
}
