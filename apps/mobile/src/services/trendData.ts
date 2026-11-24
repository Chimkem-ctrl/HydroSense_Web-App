import { isValidMeasurement, SAMPLE_INTERVAL_MS } from '@hydrosense/shared';
import type { MeasuredParameter, Reading } from '@hydrosense/shared';

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export function trendSegments(readings: Reading[], parameter: MeasuredParameter): TrendPoint[][] {
  const sorted = readings.map((reading) => ({
    timestamp: Date.parse(reading.timestamp),
    value: parameter === 'do' ? reading.doMgL : reading[parameter],
  })).filter((point) => Number.isFinite(point.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  const segments: TrendPoint[][] = [];
  let segment: TrendPoint[] = [];
  for (const point of sorted) {
    if (!isValidMeasurement(parameter, point.value)) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    if (segment.length && point.timestamp - segment[segment.length - 1].timestamp > SAMPLE_INTERVAL_MS * 1.5) {
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return segments;
}
