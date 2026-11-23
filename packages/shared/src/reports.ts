import type {
  ActivityLog,
  AdvisoryState,
  AlertItem,
  CalibrationLog,
  DeviceStatus,
  Reading,
  Role,
  Tank,
  Threshold,
  ValidationRow,
} from './types';
import { DEFAULT_THRESHOLDS } from './rules/status';
import { isValidMeasurement } from './rules/reading';
import { formatMeasuredParameterLabel } from './rules/status';
import { activityInHatchery, hatcheryId } from './hatcheries';

export type ReportSection =
  | 'summary'
  | 'thresholds'
  | 'statistics'
  | 'alerts'
  | 'advisories'
  | 'activity'
  | 'calibration'
  | 'validation'
  | 'data-quality'
  | 'raw-readings';

export interface ReportSpec {
  tankIds: string[];
  from: string;
  to: string;
  sections: ReportSection[];
  format: 'pdf' | 'csv' | 'xlsx';
  generatedBy: { name: string; role: Role };
}

export interface ReportData {
  tanks: Tank[];
  readings: Reading[];
  alerts: AlertItem[];
  thresholds: Threshold[];
  advisories: Record<string, AdvisoryState[]>;
  activityLogs: ActivityLog[];
  calibrationLogs: CalibrationLog[];
  validationRows: ValidationRow[];
  deviceStatuses: DeviceStatus[];
}

export interface ParameterStatistics {
  parameter: 'temperature' | 'do' | 'ph';
  unit: string;
  min: number | null;
  max: number | null;
  mean: number | null;
  standardDeviation: number | null;
  percentInRange: number | null;
  excursions: number;
  longestExcursionHours: number;
  readings: number;
  invalidReadings: number;
}

export interface ReportModel {
  id: string;
  sections: ReportSection[];
  format: ReportSpec['format'];
  generatedAt: string;
  generatedBy: ReportSpec['generatedBy'];
  range: { from: string; to: string };
  tanks: Tank[];
  thresholds: Threshold[];
  statistics: ParameterStatistics[];
  alertCounts: { warning: number; critical: number; open: number; acknowledged: number; resolved: number };
  alerts: AlertItem[];
  advisories: Record<string, AdvisoryState[]>;
  activityLogs: ActivityLog[];
  calibrationLogs: CalibrationLog[];
  validationRows: ValidationRow[];
  deviceStatuses: DeviceStatus[];
  dataQuality: { expectedReadings: number; receivedReadings: number; receivedPercent: number };
  rawReadings: Reading[];
  summary: string;
}

const parameterDefinitions = {
  temperature: { unit: '°C', read: (reading: Reading) => reading.temperature },
  do: { unit: 'mg/L', read: (reading: Reading) => reading.doMgL },
  ph: { unit: 'pH', read: (reading: Reading) => reading.ph },
} as const;

function isWithinRange(timestamp: string, from: number, to: number) {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) && value >= from && value <= to;
}

export function calculateParameterStatistics(
  parameter: keyof typeof parameterDefinitions,
  readings: Reading[],
  thresholds: Threshold[],
): ParameterStatistics {
  const definition = parameterDefinitions[parameter];
  const threshold = thresholds.find((item) => item.parameter === parameter) ?? DEFAULT_THRESHOLDS.find((item) => item.parameter === parameter);
  const min = threshold?.min ?? Number.NEGATIVE_INFINITY;
  const max = threshold?.max ?? Number.POSITIVE_INFINITY;
  const invalidReadings = readings.filter((reading) => !isValidMeasurement(parameter, definition.read(reading))).length;
  const samples = readings
    .map((reading) => ({ tankId: reading.tankId, timestamp: Date.parse(reading.timestamp), value: definition.read(reading) }))
    .filter((sample) => Number.isFinite(sample.timestamp) && isValidMeasurement(parameter, sample.value))
    .sort((left, right) => left.timestamp - right.timestamp);
  if (!samples.length) {
    return {
      parameter,
      unit: definition.unit,
      min: null,
      max: null,
      mean: null,
      standardDeviation: null,
      percentInRange: null,
      excursions: 0,
      longestExcursionHours: 0,
      readings: 0,
      invalidReadings,
    };
  }
  const values = samples.map((sample) => sample.value);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
  const inRange = (value: number) => value >= min && value <= max;
  let excursions = 0;
  let longestExcursionMs = 0;
  for (const tankId of new Set(readings.map((reading) => reading.tankId))) {
    const tankSamples = readings
      .filter((reading) => reading.tankId === tankId)
      .map((reading) => ({ timestamp: Date.parse(reading.timestamp), value: definition.read(reading) }))
      .filter((sample) => Number.isFinite(sample.timestamp))
      .sort((left, right) => left.timestamp - right.timestamp);
    let active = false;
    let duration = 0;
    tankSamples.forEach((sample, index) => {
      const previous = tankSamples[index - 1];
      const interval = previous ? sample.timestamp - previous.timestamp : 0;
      const continuous = previous && interval > 0 && interval <= 3.5 * 60 * 60 * 1000 && isValidMeasurement(parameter, previous.value);
      if (active && continuous && isValidMeasurement(parameter, sample.value)) duration += interval;
      if (!continuous || !isValidMeasurement(parameter, sample.value) || inRange(sample.value)) {
        longestExcursionMs = Math.max(longestExcursionMs, duration);
        duration = 0;
        active = false;
      }
      if (isValidMeasurement(parameter, sample.value) && !inRange(sample.value) && !active) {
        excursions += 1;
        active = true;
      }
    });
    longestExcursionMs = Math.max(longestExcursionMs, duration);
  }
  return {
    parameter,
    unit: definition.unit,
    min: Math.min(...values),
    max: Math.max(...values),
    mean,
    standardDeviation,
    percentInRange: values.filter(inRange).length / values.length * 100,
    excursions,
    longestExcursionHours: longestExcursionMs / 3_600_000,
    readings: values.length,
    invalidReadings,
  };
}

export function buildReport(spec: ReportSpec, data: ReportData, generatedAt = new Date().toISOString()): ReportModel {
  const from = Date.parse(spec.from);
  const to = Date.parse(spec.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new Error('Report date range is invalid.');
  }
  if (spec.tankIds.length === 0) throw new Error('Select at least one tank for the report.');
  const tankIds = new Set(spec.tankIds);
  const tanks = data.tanks.filter((tank) => tankIds.has(tank.id));
  if (tanks.length !== tankIds.size) throw new Error('One or more selected tanks could not be found.');
  const readings = data.readings.filter((reading) => tankIds.has(reading.tankId) && isWithinRange(reading.timestamp, from, to));
  const alerts = data.alerts.filter((alert) => tankIds.has(alert.tankId) && isWithinRange(alert.createdAt, from, to));
  const activityLogs = data.activityLogs.filter((log) => (
    log.tankId === 'hatchery'
      ? tanks.some((tank) => activityInHatchery(log, data.tanks, hatcheryId(tank.site)))
      : tankIds.has(log.tankId)
  ) && isWithinRange(log.occurredAt, from, to));
  const calibrationLogs = data.calibrationLogs.filter((log) => tankIds.has(log.tankId) && isWithinRange(log.date, from, to));
  const thresholds = data.thresholds;
  const statisticsRows = (['temperature', 'do', 'ph'] as const).map((parameter) => calculateParameterStatistics(parameter, readings, thresholds));
  const durationHours = (to - from) / 3_600_000;
  const expectedReadings = Math.max(0, (Math.floor(durationHours / 3) + 1) * tanks.length);
  const alertCounts = {
    warning: alerts.filter((alert) => alert.severity === 'warning').length,
    critical: alerts.filter((alert) => alert.severity === 'critical').length,
    open: alerts.filter((alert) => alert.status === 'open').length,
    acknowledged: alerts.filter((alert) => alert.status === 'acknowledged').length,
    resolved: alerts.filter((alert) => alert.status === 'resolved').length,
  };
  const safePercentages = statisticsRows.filter((item) => item.percentInRange !== null).map((item) => `${formatMeasuredParameterLabel(item.parameter)} ${item.percentInRange!.toFixed(1)}%`);
  const summary = `${readings.length} readings and ${alerts.length} alerts were recorded for ${tanks.map((tank) => tank.name).join(', ')}. ` +
    `${alertCounts.critical} critical and ${alertCounts.warning} warning alerts; in-range reading percentages: ${safePercentages.join(', ') || 'not available'}.`;
  return {
    id: `HS-${generatedAt.replace(/\D/g, '').slice(0, 14)}-${tanks.map((tank) => tank.id).join('-')}`,
    sections: [...spec.sections],
    format: spec.format,
    generatedAt,
    generatedBy: spec.generatedBy,
    range: { from: spec.from, to: spec.to },
    tanks,
    thresholds,
    statistics: statisticsRows,
    alertCounts,
    alerts,
    advisories: Object.fromEntries(tanks.map((tank) => [tank.id, data.advisories[tank.id] ?? []])),
    activityLogs,
    calibrationLogs,
    validationRows: data.validationRows.filter((row) => row.tankId ? tankIds.has(row.tankId) : false),
    deviceStatuses: data.deviceStatuses.filter((status) => tanks.some((tank) => tank.deviceId === status.deviceId)),
    dataQuality: {
      expectedReadings,
      receivedReadings: readings.length,
      receivedPercent: expectedReadings === 0 ? 0 : readings.length / expectedReadings * 100,
    },
    rawReadings: readings,
    summary,
  };
}
