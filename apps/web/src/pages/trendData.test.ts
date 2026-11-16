import { describe, expect, it } from 'vitest';
import type { Reading } from '@hydrosense/shared';
import { calculateTrendStatistics, countMissingSamples, gapRanges, nightRanges, prepareParameterRows, prepareTrendRows, threeHourTicks, trendYAxisDomain } from './trendData';

function reading(timestamp: string): Reading {
  return { id: timestamp, tankId: 'tank-a', timestamp, temperature: 30, doMgL: 5, ph: 7 };
}

describe('trend chart data', () => {
  it('sorts readings and converts ISO timestamps to numeric chart coordinates', () => {
    const later = reading('2025-01-02T03:00:00+08:00');
    const earlier = reading('2025-01-02T00:00:00+08:00');
    const result = prepareTrendRows([later, earlier]);
    expect(result.rows).toEqual([earlier, later]);
    expect(result.chartRows.map((row) => row.timestamp)).toEqual([Date.parse(earlier.timestamp), Date.parse(later.timestamp)]);
  });

  it('includes the preceding overnight window when readings begin before 06:00 Manila time', () => {
    const rows = [reading('2025-01-02T03:00:00+08:00'), reading('2025-01-02T09:00:00+08:00')];
    expect(nightRanges(rows)).toEqual([{ x1: Date.parse('2025-01-01T22:00:00+08:00'), x2: Date.parse('2025-01-02T06:00:00+08:00') }]);
    expect(nightRanges([])).toEqual([]);
  });

  it('uses fixed three-hour ticks aligned to Manila logging times', () => {
    const ticks = threeHourTicks(Date.parse('2025-01-01T16:00:00Z'), Date.parse('2025-01-02T16:00:00Z'));
    expect(ticks).toHaveLength(9);
    expect(ticks.slice(1).map((tick, index) => tick - ticks[index])).toEqual(Array(8).fill(3 * 60 * 60 * 1000));
    expect(new Date(ticks[0]).toISOString()).toBe('2025-01-01T16:00:00.000Z');
  });

  it('excludes impossible pH values but keeps sensor-valid values outside the displayed axis', () => {
    const rows = [
      { ...reading('2025-01-02T00:00:00+08:00'), ph: 2.31 },
      { ...reading('2025-01-02T03:00:00+08:00'), ph: 17.73 },
      { ...reading('2025-01-02T06:00:00+08:00'), ph: 7 },
    ];
    const parameter = { key: 'ph', title: 'pH', unit: 'pH', safeMin: 6, safeMax: 8 } as const;
    const result = calculateTrendStatistics(rows, parameter);
    const chartRows = prepareParameterRows(rows, 'ph');
    expect(result.invalidReadings).toBe(1);
    expect(result.minimum).toBe(2.31);
    expect(result.readings).toBe(2);
    expect(chartRows[1].ph).toBeNull();
    expect(trendYAxisDomain(parameter, rows)).toEqual([2, 9]);
  });

  it('keeps physically valid zero DO readings', () => {
    const rows = [
      { ...reading('2025-01-02T00:00:00+08:00'), doMgL: 6 },
      { ...reading('2025-01-02T03:00:00+08:00'), doMgL: 0 },
      { ...reading('2025-01-02T06:00:00+08:00'), doMgL: 6 },
    ];
    const parameter = { key: 'do', title: 'Dissolved oxygen', unit: 'mg/L', safeMin: 4 } as const;
    const result = calculateTrendStatistics(rows, parameter);
    expect(result.invalidReadings).toBe(0);
    expect(result.readings).toBe(3);
    expect(prepareParameterRows(rows, 'do')[1].doMgL).toBe(0);
    expect(gapRanges(rows, 'do')).toEqual([]);
  });

  it('inserts a broken-line marker and counts missing three-hour samples', () => {
    const rows = [reading('2025-01-02T00:00:00+08:00'), reading('2025-01-02T09:00:00+08:00')];
    const chartRows = prepareParameterRows(rows, 'temperature');
    expect(chartRows).toHaveLength(3);
    expect(chartRows[1].temperature).toBeNull();
    expect(countMissingSamples(rows)).toBe(2);
    expect(gapRanges(rows, 'temperature')).toHaveLength(1);
  });

  it('marks a stale end-of-window interval as an offline gap', () => {
    const rows = [reading('2025-01-02T00:00:00+08:00')];
    expect(gapRanges(rows, 'temperature', Date.parse('2025-01-01T22:00:00+08:00'), Date.parse('2025-01-02T12:00:00+08:00'))).toEqual([
      { x1: Date.parse('2025-01-02T01:30:00+08:00'), x2: Date.parse('2025-01-02T12:00:00+08:00') },
    ]);
  });
});
