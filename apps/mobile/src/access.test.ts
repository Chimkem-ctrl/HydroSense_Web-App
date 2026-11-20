import { describe, expect, it } from 'vitest';
import { canAccess } from './access';

describe('mobile role access', () => {
  it('matches the web access matrix for restricted mobile views', () => {
    const features = ['history', 'validation', 'users', 'admin', 'canEditThresholds', 'canExport', 'canCalibrate'] as const;
    expect(features.map((feature) => canAccess('operator', feature))).toEqual([true, false, false, false, false, false, false]);
    expect(features.map((feature) => canAccess('manager', feature))).toEqual([true, true, true, false, true, true, true]);
    expect(features.map((feature) => canAccess('admin', feature))).toEqual([true, true, true, true, true, true, true]);
    expect(canAccess(null, 'admin')).toBe(false);
  });

  it('allows only managers to register tanks on mobile', () => {
    expect(canAccess('manager', 'registerTank')).toBe(true);
    expect(canAccess('admin', 'registerTank')).toBe(false);
    expect(canAccess('operator', 'registerTank')).toBe(false);
    expect(canAccess(null, 'registerTank')).toBe(false);
  });
});
