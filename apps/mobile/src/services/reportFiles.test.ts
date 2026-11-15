import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { buildReport } from '@hydrosense/shared';
import type { ReportData, ReportSpec } from '@hydrosense/shared';
import { createReportFile, reportRows } from './reportFiles';

const data: ReportData = {
  tanks: [{ id: 'a', name: 'Tank A', site: 'Hatchery', rearingStartDate: '2026-01-01', deviceId: 'device-a' }],
  readings: [{ id: 'r', tankId: 'a', timestamp: '2026-01-02T03:00:00Z', temperature: 28, doMgL: 5, ph: 7 }],
  alerts: [{ id: 'alert', tankId: 'a', parameter: 'temperature', value: 31, threshold: '30', severity: 'warning', status: 'open', createdAt: '2026-01-02T03:00:00Z', note: '=unsafe' }],
  thresholds: [], advisories: {}, activityLogs: [], calibrationLogs: [], validationRows: [], deviceStatuses: [],
};
const spec: ReportSpec = {
  tankIds: ['a'], from: '2026-01-02T00:00:00Z', to: '2026-01-03T00:00:00Z',
  sections: ['summary', 'statistics', 'alerts', 'raw-readings'], format: 'pdf',
  generatedBy: { name: 'Test', role: 'operator' },
};

describe('mobile report files', () => {
  it('only includes selected sections and their actual data', () => {
    const report = buildReport({ ...spec, sections: ['statistics'] }, data);
    const rows = reportRows(report);
    expect(rows.filter((row) => row[0] === 'Statistics')).toHaveLength(3);
    expect(rows.some((row) => row[0] === 'Readings' || row[0] === 'Alerts' || row[0] === 'Summary')).toBe(false);
    expect(rows.find((row) => row[1] === 'temperature')?.[2]).toContain('mean: 28.00');
  });

  it('generates UTF-8 CSV with the selected content', async () => {
    const file = await createReportFile(buildReport({ ...spec, format: 'csv', generatedBy: { name: '=unsafe', role: 'operator' } }, data));
    const text = new TextDecoder().decode(file.bytes);
    expect(file.mimeType).toBe('text/csv');
    expect(text).toContain('Tank A');
    expect(text).toContain('28.00 °C');
    expect(text).toContain('=unsafe');
    expect(text).toContain("\"'=unsafe (operator)\"");
  });

  it('creates a readable PDF', async () => {
    const file = await createReportFile(buildReport(spec, data));
    const pdf = await PDFDocument.load(file.bytes);
    expect(file.mimeType).toBe('application/pdf');
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(new TextDecoder().decode(file.bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('creates a readable XLSX with actual values as text, not formulas', async () => {
    const file = await createReportFile(buildReport({ ...spec, format: 'xlsx' }, data));
    const workbook = new Workbook();
    await workbook.xlsx.load(file.bytes.buffer as ArrayBuffer);
    const rows = workbook.getWorksheet('HydroSense')?.getSheetValues();
    expect(file.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(JSON.stringify(rows)).toContain('Tank A');
    expect(JSON.stringify(rows)).toContain('=unsafe');
    expect(JSON.stringify(rows)).not.toContain('"formula"');
  });

  it('fails explicitly when the PDF font cannot represent report text', async () => {
    const report = buildReport(spec, { ...data, tanks: [{ ...data.tanks[0], name: '水' }] });
    await expect(createReportFile(report)).rejects.toThrow('Choose CSV or XLSX instead.');
  });
});
