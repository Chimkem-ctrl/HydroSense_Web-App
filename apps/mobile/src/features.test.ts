import { describe, expect, it } from 'vitest';
import { generateReportId } from '@hydrosense/shared';
import { canShowPlannedFeature } from './features';

describe('planned mobile feature access', () => {
  it.each(['fleet', 'batchTracking'] as const)('requires both the flag and manager or admin permission for %s', (feature) => {
    for (const role of ['operator', 'manager', 'admin'] as const) {
      expect(canShowPlannedFeature(role, feature, false)).toBe(false);
      expect(canShowPlannedFeature(role, feature, true)).toBe(role !== 'operator');
    }
    expect(canShowPlannedFeature(null, feature, true)).toBe(false);
  });

  describe('mobile report IDs', () => {
    it('uses the non-identifying report ID format', () => {
      const reportId = generateReportId(new Date('2025-12-31T16:30:00.000Z'));
      expect(reportId).toMatch(/^RPT-20260101-[A-HJ-NP-Z2-9]{6}$/);
      expect(reportId).not.toContain('tank-1');
    });
  });
});
