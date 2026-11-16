import { describe, expect, it } from 'vitest';
import { isValidMeasurement, readingAge, readingFreshness, safeRangeGauge, SAMPLE_INTERVAL_MS } from './reading';

describe('physical reading limits', () => {
  it('accepts inclusive sensor limits and rejects physically impossible values', () => {
    expect([-56, -55, 125, 126].map((value) => isValidMeasurement('temperature', value))).toEqual([false, true, true, false]);
    expect([-1, 0, 14, 15].map((value) => isValidMeasurement('ph', value))).toEqual([false, true, true, false]);
    expect([-1, 0, 5, Number.NaN].map((value) => isValidMeasurement('do', value))).toEqual([false, true, true, false]);
  });
});

describe('reading freshness', () => {
  const timestamp = '2026-01-01T00:00:00Z';
  const base = Date.parse(timestamp);

  it('marks offline devices and readings older than two intervals stale', () => {
    expect(readingFreshness(timestamp, true, base + 2 * SAMPLE_INTERVAL_MS).stale).toBe(false);
    expect(readingFreshness(timestamp, true, base + 2 * SAMPLE_INTERVAL_MS + 1).stale).toBe(true);
    expect(readingFreshness(timestamp, false, base).stale).toBe(true);
    expect(readingFreshness('bad', true, base)).toEqual({ stale: true, ageMs: null });
    expect(readingAge(2 * SAMPLE_INTERVAL_MS)).toBe('6 h ago');
  });
});

describe('safe-range gauge', () => {
  it('calculates padded scale positions and clamps out-of-scale values', () => {
    expect(safeRangeGauge(28, { parameter: 'temperature', min: 26, max: 30 })).toEqual({
      scaleMin: 24, scaleMax: 32, position: 50, safeStart: 25, safeEnd: 75,
    });
    expect(safeRangeGauge(9, { parameter: 'do', min: 4 })).toEqual({
      scaleMin: 0, scaleMax: 8, position: 100, safeStart: 50, safeEnd: 100,
    });
    expect(safeRangeGauge(1, { parameter: 'ph', min: 8, max: 6 })).toBeNull();
  });
});
