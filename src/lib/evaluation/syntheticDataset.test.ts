import { describe, expect, it } from 'vitest';
import cases from '../../../sample-data/synthetic-audit-cases.json';

describe('synthetic audit evaluation dataset', () => {
  it('contains the required twenty full-build synthetic cases', () => {
    expect(cases).toHaveLength(20);
  });

  it('covers every required leakage and false-positive category', () => {
    const types = new Set(cases.flatMap((entry) => entry.expected_findings.map((finding) => finding.type)));

    expect(Array.from(types)).toEqual(expect.arrayContaining([
      'minimum_commitment_shortfall',
      'missed_annual_uplift',
      'expired_discount_still_applied',
      'seat_underbilling',
      'usage_overage_unbilled',
      'renewal_window_risk',
      'amendment_conflict'
    ]));
    expect(cases.some((entry) => entry.expected_findings.length === 0)).toBe(true);
  });
});
