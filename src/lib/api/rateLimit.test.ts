import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRateLimiter, SupabaseRateLimiter, configureRateLimiter, enforceRateLimit, resetRateLimitBuckets } from './rateLimit';

const originalBackend = process.env.LEAKPROOF_RATE_LIMIT_BACKEND;

describe('API rate limiting', () => {
  beforeEach(() => {
    delete process.env.LEAKPROOF_RATE_LIMIT_BACKEND;
    configureRateLimiter(null);
    resetRateLimitBuckets();
  });

  afterEach(() => {
    if (originalBackend === undefined) {
      delete process.env.LEAKPROOF_RATE_LIMIT_BACKEND;
    } else {
      process.env.LEAKPROOF_RATE_LIMIT_BACKEND = originalBackend;
    }
    configureRateLimiter(null);
    resetRateLimitBuckets();
  });

  it('allows requests inside the window and rejects the next request over the route limit', () => {
    expect(() => enforceRateLimit({ key: 'upload:user:org:workspace', limit: 2, windowMs: 60_000, now: 1000 })).not.toThrow();
    expect(() => enforceRateLimit({ key: 'upload:user:org:workspace', limit: 2, windowMs: 60_000, now: 2000 })).not.toThrow();
    expect(() => enforceRateLimit({ key: 'upload:user:org:workspace', limit: 2, windowMs: 60_000, now: 3000 })).toThrow('rate_limited');
  });

  it('resets a bucket after the configured window', () => {
    enforceRateLimit({ key: 'search:user:org:workspace', limit: 1, windowMs: 1000, now: 1000 });

    expect(() => enforceRateLimit({ key: 'search:user:org:workspace', limit: 1, windowMs: 1000, now: 2001 })).not.toThrow();
  });

  it('can reset an explicit in-memory limiter instance', () => {
    const limiter = new InMemoryRateLimiter();
    configureRateLimiter(limiter);

    enforceRateLimit({ key: 'report:user:org:workspace', limit: 1, windowMs: 60_000, now: 1000 });
    expect(() => enforceRateLimit({ key: 'report:user:org:workspace', limit: 1, windowMs: 60_000, now: 1001 })).toThrow('rate_limited');

    resetRateLimitBuckets();

    expect(() => enforceRateLimit({ key: 'report:user:org:workspace', limit: 1, windowMs: 60_000, now: 1002 })).not.toThrow();
  });

  it('supports an async shared-store adapter without requiring live infrastructure', async () => {
    const limiter = new SupabaseRateLimiter({
      async consume() {
        return {
          data: [{ allowed: false, remaining: 0, reset_at: new Date(60_000).toISOString() }],
          error: null
        };
      }
    });
    configureRateLimiter(limiter);

    await expect(
      Promise.resolve(enforceRateLimit({ key: 'extraction:user:org:workspace', limit: 1, windowMs: 60_000, now: 1000 }))
    ).rejects.toThrow('rate_limited');
  });
});
