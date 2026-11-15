import type { MeasuredParameter, Threshold } from '../types';

export const SAMPLE_INTERVAL_MS = 3 * 60 * 60 * 1000;

export function isValidMeasurement(parameter: MeasuredParameter, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (parameter === 'temperature') return value >= -55 && value <= 125;
  if (parameter === 'ph') return value >= 0 && value <= 14;
  return value >= 0;
}

export function readingFreshness(timestamp: string, online: boolean | undefined, now = Date.now()) {
  const parsed = Date.parse(timestamp);
  const ageMs = Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
  return { stale: online === false || ageMs === null || ageMs > 2 * SAMPLE_INTERVAL_MS, ageMs };
}

export function readingAge(ageMs: number | null): string {
  if (ageMs === null) return 'at an unknown time';
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

export function safeRangeGauge(value: number, threshold: Threshold) {
  const { min, max } = threshold;
  if (!Number.isFinite(value) || (min === undefined && max === undefined) ||
      (min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max)) ||
      (min !== undefined && max !== undefined && min >= max)) return null;
  const padding = min !== undefined && max !== undefined ? (max - min) / 2 : 0;
  const scaleMin = min !== undefined && max !== undefined ? min - padding : min !== undefined ? Math.min(0, min) : Math.min(0, max!);
  const scaleMax = min !== undefined && max !== undefined ? max + padding : min !== undefined ? Math.max(min * 2, min + 1) : Math.max(max! * 1.5, max! + 1);
  if (scaleMax <= scaleMin) return null;
  const pct = (n: number) => Math.max(0, Math.min(100, (n - scaleMin) / (scaleMax - scaleMin) * 100));
  return { scaleMin, scaleMax, position: pct(value), safeStart: min === undefined ? 0 : pct(min), safeEnd: max === undefined ? 100 : pct(max) };
}
