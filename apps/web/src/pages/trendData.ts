import { isValidMeasurement as isValidSensorMeasurement, SAMPLE_INTERVAL_MS } from '@hydrosense/shared';
import type { MeasuredParameter, Reading } from '@hydrosense/shared';

export { SAMPLE_INTERVAL_MS };
const MAX_CONTIGUOUS_INTERVAL_MS = SAMPLE_INTERVAL_MS + 30 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface TrendParameter {
  key: MeasuredParameter;
  title: string;
  unit: string;
  safeMin: number;
  safeMax?: number;
}

export interface TrendStatistic {
  parameter: MeasuredParameter;
  latest: number | null;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  standardDeviation: number | null;
  percentInRange: number | null;
  excursions: number;
  longestExcursionHours: number;
  readings: number;
  invalidReadings: number;
}

export function prepareTrendRows(readings: Reading[]) {
  const rows = [...readings].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { rows, chartRows: rows.map((row) => ({ ...row, timestamp: Date.parse(row.timestamp) })) };
}

export function trendMarkerIndices(values: number[]) {
  if (!values.length) return [];
  return [...new Set([values.indexOf(Math.min(...values)), values.indexOf(Math.max(...values)), values.length - 1])];
}

export function parameterValue(reading: Reading, parameter: MeasuredParameter) {
  return parameter === 'do' ? reading.doMgL : reading[parameter];
}

export function isValidMeasurement(value: number, parameter: MeasuredParameter) {
  return isValidSensorMeasurement(parameter, value);
}

export function trendYAxisDomain(parameter: TrendParameter, rows: Reading[]): [number, number] {
  const values = rows.map((row) => parameterValue(row, parameter.key)).filter((value) => isValidMeasurement(value, parameter.key));
  if (parameter.key === 'ph') return [Math.max(0, Math.floor(Math.min(5, ...values))), Math.min(14, Math.ceil(Math.max(9, ...values)))];
  if (parameter.key === 'do') return [0, Math.max(10, Math.ceil(Math.max(...values, 4) + 1))];
  if (parameter.safeMax === undefined) throw new Error(`A maximum safe limit is required for ${parameter.title}.`);
  const minimum = Math.min(parameter.safeMin, ...values);
  const maximum = Math.max(parameter.safeMax, ...values);
  const padding = Math.max(0.5, (maximum - minimum) * 0.1);
  return [Math.floor(minimum - padding), Math.ceil(maximum + padding)];
}

export function prepareParameterRows(rows: Reading[], parameter: MeasuredParameter) {
  const chartRows: Array<Omit<Reading, 'timestamp'> & { timestamp: number; [key: string]: unknown }> = [];
  rows.forEach((row, index) => {
    chartRows.push({
      ...row,
      timestamp: Date.parse(row.timestamp),
      [parameter === 'do' ? 'doMgL' : parameter]: isValidMeasurement(parameterValue(row, parameter), parameter)
        ? parameterValue(row, parameter)
        : null,
    });
    const next = rows[index + 1];
    if (!next) return;
    const currentTime = Date.parse(row.timestamp);
    const nextTime = Date.parse(next.timestamp);
    if (nextTime - currentTime > MAX_CONTIGUOUS_INTERVAL_MS) {
      chartRows.push({
        ...row,
        id: `${row.id}-gap-${next.id}`,
        timestamp: currentTime + (nextTime - currentTime) / 2,
        [parameter === 'do' ? 'doMgL' : parameter]: null,
      });
    }
  });
  return chartRows.sort((a, b) => a.timestamp - b.timestamp);
}

export function gapRanges(rows: Reading[], _parameter: MeasuredParameter, from?: number, to?: number) {
  const ranges: Array<{ x1: number; x2: number }> = [];
  if (!rows.length) return ranges;
  const firstTimestamp = Date.parse(rows[0].timestamp);
  const lastTimestamp = Date.parse(rows[rows.length - 1].timestamp);
  if (from !== undefined && firstTimestamp - from > MAX_CONTIGUOUS_INTERVAL_MS) {
    ranges.push({ x1: from, x2: firstTimestamp - SAMPLE_INTERVAL_MS / 2 });
  }
  rows.forEach((row, index) => {
    const timestamp = Date.parse(row.timestamp);
    const next = rows[index + 1];
    if (!next) return;
    const nextTimestamp = Date.parse(next.timestamp);
    if (nextTimestamp - timestamp > MAX_CONTIGUOUS_INTERVAL_MS) {
      ranges.push({
        x1: timestamp + SAMPLE_INTERVAL_MS / 2,
        x2: nextTimestamp - SAMPLE_INTERVAL_MS / 2,
      });
    }
  });
  if (to !== undefined && to - lastTimestamp > MAX_CONTIGUOUS_INTERVAL_MS) {
    ranges.push({ x1: lastTimestamp + SAMPLE_INTERVAL_MS / 2, x2: to });
  }
  return ranges;
}

export function countMissingSamples(rows: Reading[]) {
  return rows.slice(1).reduce((count, row, index) => {
    const interval = Date.parse(row.timestamp) - Date.parse(rows[index].timestamp);
    if (interval <= MAX_CONTIGUOUS_INTERVAL_MS) return count;
    return count + Math.max(1, Math.round(interval / SAMPLE_INTERVAL_MS) - 1);
  }, 0);
}

export function calculateTrendStatistics(rows: Reading[], parameter: TrendParameter): TrendStatistic {
  let invalidReadings = 0;
  const samples = rows.flatMap((reading) => {
    const value = parameterValue(reading, parameter.key);
    if (!isValidMeasurement(value, parameter.key)) {
      invalidReadings += 1;
      return [];
    }
    return [{ timestamp: Date.parse(reading.timestamp), value }];
  }).filter((sample) => Number.isFinite(sample.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  if (!samples.length) {
    return {
      parameter: parameter.key,
      latest: null,
      minimum: null,
      maximum: null,
      mean: null,
      standardDeviation: null,
      percentInRange: null,
      excursions: 0,
      longestExcursionHours: 0,
      readings: 0,
      invalidReadings,
    };
  }

  const values = samples.map(({ value }) => value);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
  const inRange = (value: number) => value >= parameter.safeMin && (parameter.safeMax === undefined || value <= parameter.safeMax);
  let excursions = 0;
  let longestExcursionMs = 0;
  let currentExcursionMs = 0;
  let inExcursion = false;
  samples.forEach((sample, index) => {
    const outside = !inRange(sample.value);
    const previous = samples[index - 1];
    const contiguous = previous && sample.timestamp - previous.timestamp <= MAX_CONTIGUOUS_INTERVAL_MS;
    if (!outside || !contiguous) {
      if (inExcursion) longestExcursionMs = Math.max(longestExcursionMs, currentExcursionMs);
      currentExcursionMs = 0;
      inExcursion = false;
    }
    if (!outside) return;
    if (!inExcursion) {
      excursions += 1;
      inExcursion = true;
    }
    const next = samples[index + 1];
    if (next && next.timestamp - sample.timestamp <= MAX_CONTIGUOUS_INTERVAL_MS) {
      currentExcursionMs += next.timestamp - sample.timestamp;
    }
  });
  longestExcursionMs = Math.max(longestExcursionMs, currentExcursionMs);

  return {
    parameter: parameter.key,
    latest: samples[samples.length - 1].value,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    mean,
    standardDeviation,
    percentInRange: values.filter(inRange).length / values.length * 100,
    excursions,
    longestExcursionHours: longestExcursionMs / 3_600_000,
    readings: values.length,
    invalidReadings,
  };
}

export function threeHourTicks(from: number, to: number) {
  const firstSlot = Math.ceil((from + MANILA_OFFSET_MS) / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS - MANILA_OFFSET_MS;
  const ticks: number[] = [];
  for (let timestamp = firstSlot; timestamp <= to; timestamp += SAMPLE_INTERVAL_MS) ticks.push(timestamp);
  return ticks;
}

export function dailyTicks(from: number, to: number) {
  const interval = 24 * 60 * 60 * 1000;
  const firstSlot = Math.ceil((from + MANILA_OFFSET_MS) / interval) * interval - MANILA_OFFSET_MS;
  const ticks: number[] = [];
  for (let timestamp = firstSlot; timestamp <= to; timestamp += interval) ticks.push(timestamp);
  return ticks;
}

export function nightRanges(rows: Reading[]) {
  if (!rows.length) return [];
  const start = new Date(rows[0].timestamp);
  const end = new Date(rows[rows.length - 1].timestamp);
  const ranges: Array<{ x1: number; x2: number }> = [];
  for (let day = -1; day <= 22; day += 1) {
    const date = new Date(start.getTime() + day * 86_400_000);
    const localDate = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const x1 = Date.parse(`${localDate}T22:00:00+08:00`);
    const next = new Date(Date.parse(`${localDate}T00:00:00+08:00`) + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const x2 = Date.parse(`${next}T06:00:00+08:00`);
    if (x2 >= start.getTime() && x1 <= end.getTime()) ranges.push({ x1, x2 });
  }
  return ranges;
}
