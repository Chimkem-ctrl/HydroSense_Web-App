import { describe, expect, it } from 'vitest';
import { activityInHatchery, hatcheryId, hatcheryLocations, tankInHatchery } from './hatcheries';
import type { ActivityLog, Tank } from './types';

const tanks: Tank[] = [
  { id: 's', name: 'S1', site: 'Camiguin, Sagay Multispecies Hatchery', rearingStartDate: '2026-01-01', deviceId: 's' },
  { id: 'b', name: 'B1', site: 'Camiguin, Benoni Experimental Station', rearingStartDate: '2026-01-01', deviceId: 'b' },
  { id: 'x', name: 'X1', site: 'Other Site', rearingStartDate: '2026-01-01', deviceId: 'x' },
];

describe('hatchery locations', () => {
  it('merges backend locations with Sagay and Benoni and matches their existing names', () => {
    expect(hatcheryLocations(tanks)).toEqual([
      { id: 'camiguin-sagay', name: 'Sagay' }, { id: 'camiguin-benoni', name: 'Benoni' }, { id: 'Other Site', name: 'Other Site' },
    ]);
    expect(hatcheryId('Sagay Hatchery, Camiguin')).toBe('camiguin-sagay');
    expect(tankInHatchery(tanks[1], 'camiguin-benoni')).toBe(true);
    expect(tankInHatchery(tanks[0], 'camiguin-benoni')).toBe(false);
  });

  it('keeps hatchery-wide and tank records in the correct location, including legacy Sagay records', () => {
    const log: ActivityLog = { id: '1', tankId: 'hatchery', kind: 'ENVIRONMENT', type: 'Rainfall', occurredAt: '2026-01-01', operator: 'A', notes: '' };
    expect(activityInHatchery(log, tanks, 'camiguin-sagay')).toBe(true);
    expect(activityInHatchery(log, tanks, 'camiguin-benoni')).toBe(false);
    expect(activityInHatchery({ ...log, hatcheryId: 'camiguin-benoni' }, tanks, 'camiguin-benoni')).toBe(true);
    expect(activityInHatchery({ ...log, tankId: 'b' }, tanks, 'camiguin-sagay')).toBe(false);
    expect(activityInHatchery({ ...log, tankId: 'unknown' }, tanks, 'camiguin-sagay')).toBe(false);
  });
});
