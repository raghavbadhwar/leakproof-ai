import { describe, expect, it, beforeEach } from 'vitest';
import { enforceRateLimit, resetRateLimitBuckets } from './rateLimit';

describe('API rate limiting', () => {
  beforeEach(() => {
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
});
