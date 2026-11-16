import { describe, expect, it } from 'vitest';
import type { Reading } from '@hydrosense/shared';
import { trendSegments } from './trendData';

function reading(id: string, hour: number, ph: number): Reading {
  return { id, tankId: 'tank', timestamp: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(), temperature: 28, doMgL: 5, ph };
}

describe('mobile trend segments', () => {
  it('sorts readings and breaks at invalid measurements and missing samples', () => {
    const segments = trendSegments([reading('e', 18, 8), reading('c', 6, 7), reading('b', 3, 15), reading('a', 0, 6), reading('d', 9, 7.5)], 'ph');
    expect(segments.map((segment) => segment.map((point) => point.value))).toEqual([[6], [7, 7.5], [8]]);
    expect(trendSegments([reading('b', 3, 15), reading('a', 0, 6)], 'temperature')).toHaveLength(1);
  });
});
