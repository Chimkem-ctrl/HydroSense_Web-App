import { describe, expect, it } from 'vitest';
import type { Reading } from '@hydrosense/shared';
import { calculateTrendStatistics, chartTimeDomain, comparisonStatistics, countMissingSamples, gapRanges, nightRanges, prepareParameterRows, prepareTrendRows, rearingDay, sampleParameterReadings, threeHourTicks, trendYAxisDomain } from './trendData';

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

  it('plots the latest valid value per Manila three-hour slot without changing timestamps or zeroes', () => {
    const rows = prepareTrendRows([
      { ...reading('2025-01-02T03:01:00+08:00'), doMgL: 0 },
      { ...reading('2025-01-02T00:15:00+08:00'), doMgL: 4 },
      { ...reading('2025-01-02T02:59:00+08:00'), doMgL: 5 },
      { ...reading('2025-01-02T03:02:00+08:00'), doMgL: Number.NaN },
      { ...reading('2025-01-02T06:00:00+08:00'), doMgL: 7 },
    ]).rows;
    const sampled = sampleParameterReadings(rows, 'do');
    expect(sampled.map((row) => row.timestamp)).toEqual([
      '2025-01-02T02:59:00+08:00', '2025-01-02T03:01:00+08:00',
      '2025-01-02T03:02:00+08:00', '2025-01-02T06:00:00+08:00',
    ]);
    expect(prepareParameterRows(sampled, 'do').map((row) => row.doMgL)).toEqual([5, 0, null, 7]);
    expect(calculateTrendStatistics(rows, { key: 'do', title: 'DO', unit: 'mg/L', safeMin: 4 })).toMatchObject({ readings: 4, minimum: 0, maximum: 7, mean: 4 });
  });

  it('leaves gaps for empty and invalid slots, including an invalid sample before the next point', () => {
    const rows = prepareTrendRows([
      reading('2025-01-02T02:59:00+08:00'),
      { ...reading('2025-01-02T06:00:00+08:00'), ph: Number.NaN },
      reading('2025-01-02T06:01:00+08:00'),
      { ...reading('2025-01-02T09:00:00+08:00'), ph: Number.NaN },
      { ...reading('2025-01-02T09:30:00+08:00'), ph: Number.NaN },
      reading('2025-01-02T12:00:00+08:00'),
    ]).rows;
    const chart = prepareParameterRows(sampleParameterReadings(rows, 'ph'), 'ph');
    const points = chart.filter((row) => row.ph !== null);
    expect(points.map((row) => row.timestamp)).toEqual([
      Date.parse('2025-01-02T02:59:00+08:00'), Date.parse('2025-01-02T06:01:00+08:00'), Date.parse('2025-01-02T12:00:00+08:00'),
    ]);
    expect(chart.some((row) => row.ph === null && row.timestamp > points[0].timestamp && row.timestamp < points[1].timestamp)).toBe(true);
    expect(chart.some((row) => row.ph === null && row.timestamp > points[1].timestamp && row.timestamp < points[2].timestamp)).toBe(true);
  });

  it('reduces dense observations to one valid chart point per three-hour slot', () => {
    const start = Date.parse('2025-01-02T00:00:00+08:00');
    const rows = Array.from({ length: 2160 }, (_, index) => reading(new Date(start + index * 10_000).toISOString()));
    const sampled = sampleParameterReadings(rows, 'temperature');
    expect(sampled).toHaveLength(2);
    expect(sampled.map((row) => row.timestamp)).toEqual([rows[1079].timestamp, rows[2159].timestamp]);
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
    expect(trendYAxisDomain(parameter, rows)).toEqual([1, 9]);
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

  it('does not draw a vertical line between readings with identical timestamps', () => {
    const time = '2025-01-02T00:00:00+08:00';
    const rows = prepareTrendRows([reading(time), { ...reading(time), id: 'second', temperature: 33 }]).rows;
    expect(prepareParameterRows(rows, 'temperature').map((row) => row.temperature)).toEqual([30, null, 33]);
  });

  it('marks a stale end-of-window interval as an offline gap', () => {
    const rows = [reading('2025-01-02T00:00:00+08:00')];
    expect(gapRanges(rows, 'temperature', Date.parse('2025-01-01T22:00:00+08:00'), Date.parse('2025-01-02T12:00:00+08:00'))).toEqual([
      { x1: Date.parse('2025-01-02T01:30:00+08:00'), x2: Date.parse('2025-01-02T12:00:00+08:00') },
    ]);
  });

  it('uses the same valid, timestamped values for the chart and statistics, retaining real zeroes', () => {
    const missing: Reading = JSON.parse('{"id":"missing","tankId":"tank-a","timestamp":"2025-01-02T00:01:00+08:00","temperature":null,"doMgL":null,"ph":null}');
    const rows = prepareTrendRows([
      { ...reading('2025-01-02T00:02:00+08:00'), doMgL: 0, ph: 13.39 },
      missing,
      { ...reading('2025-01-02T00:00:00+08:00'), doMgL: 5, ph: 7 },
      { ...reading('2025-01-02T00:03:00+08:00'), doMgL: Number.NaN, ph: 17.73 },
      { ...reading('invalid'), doMgL: 20 },
    ]).rows;
    const oxygen = { key: 'do', title: 'Dissolved oxygen', unit: 'mg/L', safeMin: 5 } as const;
    const ph = { key: 'ph', title: 'pH', unit: 'pH', safeMin: 6, safeMax: 8 } as const;
    expect(prepareParameterRows(rows, 'do').map((row) => row.doMgL)).toEqual([5, null, 0, null]);
    expect(calculateTrendStatistics(rows, oxygen)).toMatchObject({ latest: 0, minimum: 0, maximum: 5, mean: 2.5, percentInRange: 50, readings: 2, invalidReadings: 2 });
    expect(calculateTrendStatistics(rows, ph)).toMatchObject({ latest: 13.39, minimum: 7, maximum: 13.39, readings: 2, invalidReadings: 2, percentInRange: 50 });
    expect(calculateTrendStatistics([missing], oxygen)).toMatchObject({ latest: null, minimum: null, maximum: null, mean: null, percentInRange: null });
  });

  it('keeps invalid samples from joining separate excursions', () => {
    const rows = [
      { ...reading('2025-01-02T00:00:00+08:00'), doMgL: 2 },
      { ...reading('2025-01-02T00:30:00+08:00'), doMgL: Number.NaN },
      { ...reading('2025-01-02T01:00:00+08:00'), doMgL: 2 },
    ];
    expect(calculateTrendStatistics(rows, { key: 'do', title: 'DO', unit: 'mg/L', safeMin: 4 })).toMatchObject({ excursions: 2, longestExcursionHours: 0 });
  });

  it('scales to actual reading times and honors upper-only thresholds', () => {
    const rows = prepareTrendRows([reading('2025-01-02T00:00:00+08:00'), reading('2025-01-02T00:02:00+08:00')]).rows;
    const [from, to] = chartTimeDomain(rows, Date.parse('2025-01-01T00:00:00+08:00'), Date.parse('2025-01-10T00:00:00+08:00'));
    expect(to - from).toBe(4 * 60_000);
    expect(trendYAxisDomain({ key: 'do', title: 'DO', unit: 'mg/L', safeMax: 6 }, rows)).toEqual([4, 7]);
    expect(calculateTrendStatistics(rows, { key: 'do', title: 'DO', unit: 'mg/L', safeMax: 6 }).percentInRange).toBe(100);
  });

  it('calculates independent day and night statistics at Manila time boundaries', () => {
    const rows = [
      { ...reading('2025-01-02T05:59:00+08:00'), doMgL: 0 },
      { ...reading('2025-01-02T06:00:00+08:00'), doMgL: 6 },
      { ...reading('2025-01-02T21:59:00+08:00'), doMgL: 8 },
      { ...reading('2025-01-02T22:00:00+08:00'), doMgL: 4 },
      { ...reading('2025-01-02T23:00:00+08:00'), doMgL: Number.NaN },
    ];
    expect(comparisonStatistics(rows, 'do')).toEqual({ day: { mean: 7, min: 6 }, night: { mean: 2, min: 0 } });
    expect(comparisonStatistics(rows.slice(1, 3), 'do').night).toEqual({ mean: null, min: null });
  });

  it('reports the actual rearing day before, during and after the cycle', () => {
    const today = new Date('2025-01-22T02:00:00+08:00');
    expect(rearingDay('2025-01-23', today)).toBe(-1);
    expect(rearingDay('2025-01-22', today)).toBe(0);
    expect(rearingDay('2025-01-01', today)).toBe(21);
    expect(rearingDay('2024-12-30', today)).toBe(23);
    expect(rearingDay('2025-02-30', today)).toBeNull();
    expect(rearingDay('', today)).toBeNull();
  });
});
