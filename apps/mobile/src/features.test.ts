import { describe, expect, it } from 'vitest';
import { canShowPlannedFeature } from './features';

describe('planned mobile feature access', () => {
  it.each(['fleet', 'batchTracking'] as const)('requires both the flag and manager or admin permission for %s', (feature) => {
    for (const role of ['operator', 'manager', 'admin'] as const) {
      expect(canShowPlannedFeature(role, feature, false)).toBe(false);
      expect(canShowPlannedFeature(role, feature, true)).toBe(role !== 'operator');
    }
    expect(canShowPlannedFeature(null, feature, true)).toBe(false);
  });
});
