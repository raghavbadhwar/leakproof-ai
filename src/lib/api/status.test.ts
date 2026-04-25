import { describe, expect, it } from 'vitest';
import { assertValidFindingStatusTransition } from './status';
import { findingStatusUpdateSchema } from './schemas';

describe('API status validation', () => {
  it('accepts only human review finding statuses', () => {
    expect(findingStatusUpdateSchema.parse({ status: 'approved' }).status).toBe('approved');
    expect(() => findingStatusUpdateSchema.parse({ status: 'exported' })).toThrow();
    expect(() => findingStatusUpdateSchema.parse({ status: 'dismissed' })).toThrow();
    expect(findingStatusUpdateSchema.parse({ status: 'dismissed', note: 'duplicate billing data' }).status).toBe('dismissed');
  });

  it('rejects no-op and unsafe finding status transitions', () => {
    expect(assertValidFindingStatusTransition('draft', 'approved')).toEqual({ from: 'draft', to: 'approved' });
    expect(assertValidFindingStatusTransition('approved', 'customer_ready')).toEqual({ from: 'approved', to: 'customer_ready' });
    expect(assertValidFindingStatusTransition('customer_ready', 'recovered')).toEqual({ from: 'customer_ready', to: 'recovered' });
    expect(() => assertValidFindingStatusTransition('approved', 'approved')).toThrow('invalid_status_transition');
    expect(() => assertValidFindingStatusTransition('draft', 'customer_ready')).toThrow('invalid_status_transition');
    expect(() => assertValidFindingStatusTransition('recovered', 'needs_review')).toThrow('invalid_status_transition');
  });
});
