import { describe, expect, it } from 'vitest';
import { buildReport, calculateParameterStatistics } from './reports';
import { formatMeasuredParameterLabel } from './rules/status';
import type { ReportData, ReportSpec } from './reports';

const spec: ReportSpec = {
  tankIds: ['tank-a'],
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-01T06:00:00.000Z',
  sections: ['summary', 'statistics', 'alerts', 'raw-readings'],
  format: 'pdf',
  generatedBy: { name: 'Test Manager', role: 'manager' },
};

const data: ReportData = {
  tanks: [{ id: 'tank-a', name: 'Tank A', site: 'Hatchery', rearingStartDate: '2025-12-01', deviceId: 'device-a' }],
  readings: [
    { id: 'r1', tankId: 'tank-a', timestamp: '2026-01-01T00:00:00.000Z', temperature: 30, doMgL: 5, ph: 7 },
    { id: 'r2', tankId: 'tank-a', timestamp: '2026-01-01T03:00:00.000Z', temperature: 33, doMgL: 3, ph: 7 },
    { id: 'r3', tankId: 'tank-a', timestamp: '2026-01-01T06:00:00.000Z', temperature: 29, doMgL: 6, ph: 7 },
  ],
  alerts: [{
    id: 'alert-a', tankId: 'tank-a', parameter: 'temperature', value: 33, threshold: '32', severity: 'critical',
    status: 'open', createdAt: '2026-01-01T03:00:00.000Z',
  }],
  thresholds: [],
  advisories: {},
  activityLogs: [],
  calibrationLogs: [],
  validationRows: [],
  deviceStatuses: [],
};

describe('formatMeasuredParameterLabel', () => {
  it('uses the conventional casing for water-quality parameters', () => {
    expect(formatMeasuredParameterLabel('do')).toBe('DO');
    expect(formatMeasuredParameterLabel('PH')).toBe('pH');
    expect(formatMeasuredParameterLabel('temperature')).toBe('Temperature');
    expect(formatMeasuredParameterLabel('custom')).toBe('custom');
  });
});

describe('buildReport', () => {
  it('filters data to the selected tanks and range and calculates report statistics', () => {
    const report = buildReport(spec, data, '2026-01-01T08:00:00.000Z');
    const temperature = report.statistics.find((item) => item.parameter === 'temperature');
    const oxygen = report.statistics.find((item) => item.parameter === 'do');

    expect(report.rawReadings).toHaveLength(3);
    expect(report.alertCounts).toEqual({ warning: 0, critical: 1, open: 1, acknowledged: 0, resolved: 0 });
    expect(temperature).toMatchObject({
      min: 29,
      max: 33,
      mean: 30.666666666666668,
      percentInRange: 66.66666666666666,
      excursions: 1,
      longestExcursionHours: 3,
    });
    expect(oxygen).toMatchObject({ excursions: 1, longestExcursionHours: 3 });
    expect(report.dataQuality).toEqual({ expectedReadings: 3, receivedReadings: 3, receivedPercent: 100 });
    expect(report.generatedBy).toEqual(spec.generatedBy);
    expect(report.sections).toEqual(spec.sections);
    expect(report.id).toContain('HS-20260101080000');
    expect(report.summary).toContain('DO');
    expect(report.summary).toContain('pH');
    expect(report.summary).not.toContain(' do ');
    expect(report.summary).not.toContain(' ph ');
  });

  it('rejects invalid date ranges and unknown tanks', () => {
    expect(() => buildReport({ ...spec, from: 'bad-date' }, data)).toThrow('Report date range is invalid.');
    expect(() => buildReport({ ...spec, tankIds: ['missing'] }, data)).toThrow('One or more selected tanks could not be found.');
  });

  it('only includes hatchery-wide activity and validation for the selected tanks', () => {
    const report = buildReport(spec, {
      ...data,
      tanks: [{ ...data.tanks[0], site: 'Sagay Hatchery' }, { ...data.tanks[0], id: 'tank-b', site: 'Benoni Hatchery' }],
      activityLogs: [
        { id: 's', tankId: 'hatchery', kind: 'ENVIRONMENT', type: 'Sagay', occurredAt: spec.from, operator: 'A', notes: '' },
        { id: 'b', tankId: 'hatchery', hatcheryId: 'camiguin-benoni', kind: 'ENVIRONMENT', type: 'Benoni', occurredAt: spec.from, operator: 'A', notes: '' },
      ],
      validationRows: [
        { tankId: 'tank-a', parameter: 'Sagay', hydrosenseMean: 1, reference: 1, error: 0, pctError: 0, tolerance: 1, pass: true },
        { tankId: 'tank-b', parameter: 'Benoni', hydrosenseMean: 1, reference: 1, error: 0, pctError: 0, tolerance: 1, pass: true },
      ],
    });
    expect(report.activityLogs.map((log) => log.type)).toEqual(['Sagay']);
    expect(report.validationRows.map((row) => row.parameter)).toEqual(['Sagay']);
  });

  it('excludes physically invalid measurements from statistics', () => {
    const report = buildReport(spec, { ...data, readings: [
      ...data.readings,
      { id: 'invalid', tankId: 'tank-a', timestamp: '2026-01-01T04:00:00Z', temperature: 126, doMgL: -1, ph: 15 },
    ] });
    expect(report.statistics.map((row) => row.invalidReadings)).toEqual([1, 1, 1]);
    expect(report.statistics.find((row) => row.parameter === 'temperature')?.max).toBe(33);
  });

  it('does not combine excursions between tanks or across invalid or missing samples', () => {
    const rows = [
      { ...data.readings[0], temperature: 33 },
      { ...data.readings[1], tankId: 'tank-b', temperature: 33 },
      { ...data.readings[1], temperature: 126 },
      { ...data.readings[2], temperature: 33 },
      { ...data.readings[2], id: 'later', timestamp: '2026-01-01T15:00:00Z', temperature: 33 },
    ];
    expect(calculateParameterStatistics('temperature', rows, [])).toMatchObject({
      excursions: 4, longestExcursionHours: 0, invalidReadings: 1,
    });
  });
});
