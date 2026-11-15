import { describe, expect, it } from 'vitest';
import { canAccess } from './access';

describe('mobile role access', () => {
  it('matches the web access matrix for restricted mobile views', () => {
    const features = ['history', 'validation', 'admin', 'canEditThresholds', 'canExport', 'canCalibrate'] as const;
    expect(features.map((feature) => canAccess('operator', feature))).toEqual([false, false, false, false, false, false]);
    expect(features.map((feature) => canAccess('manager', feature))).toEqual([true, true, false, true, true, true]);
    expect(features.map((feature) => canAccess('admin', feature))).toEqual([true, true, true, true, true, true]);
    expect(canAccess(null, 'admin')).toBe(false);
  });
});
