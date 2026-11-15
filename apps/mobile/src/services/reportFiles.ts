import { Workbook } from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { toCsv } from '@hydrosense/shared';
import type { ReportModel } from '@hydrosense/shared';

type ReportRow = [string, string, string];

export function reportRows(report: ReportModel): ReportRow[] {
  const rows: ReportRow[] = [
    ['Report', 'ID', report.id],
    ['Report', 'Tanks', report.tanks.map((tank) => tank.name).join(', ')],
    ['Report', 'Period', `${report.range.from} - ${report.range.to}`],
    ['Report', 'Prepared by', `${report.generatedBy.name} (${report.generatedBy.role})`],
  ];
  if (report.sections.includes('summary')) rows.push(['Summary', 'Overview', report.summary]);
  if (report.sections.includes('statistics')) {
    for (const stat of report.statistics) {
      rows.push(['Statistics', stat.parameter, `Min: ${stat.min?.toFixed(2) ?? 'N/A'}; max: ${stat.max?.toFixed(2) ?? 'N/A'}; mean: ${stat.mean?.toFixed(2) ?? 'N/A'} ${stat.unit}; standard deviation: ${stat.standardDeviation?.toFixed(2) ?? 'N/A'}; in range: ${stat.percentInRange?.toFixed(1) ?? 'N/A'}%; excursions: ${stat.excursions}; longest excursion: ${stat.longestExcursionHours.toFixed(1)} hours; valid: ${stat.readings}; invalid excluded: ${stat.invalidReadings}`]);
    }
  }
  if (report.sections.includes('alerts')) {
    for (const alert of report.alerts) {
      rows.push(['Alerts', `${alert.createdAt} ${alert.tankId}`, `${alert.parameter}: ${alert.value}; ${alert.severity}; ${alert.status}; ${alert.note ?? ''}`]);
    }
  }
  if (report.sections.includes('raw-readings')) {
    for (const reading of report.rawReadings) {
      rows.push(['Readings', `${reading.timestamp} ${reading.tankId}`, `Temperature: ${reading.temperature} C; DO: ${reading.doMgL} mg/L; pH: ${reading.ph}`]);
    }
  }
  return rows;
}

export async function createReportFile(report: ReportModel): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }> {
  const rows = reportRows(report);
  if (report.format === 'csv') {
    const encoded = encodeURIComponent(toCsv([['Section', 'Item', 'Details'], ...rows])).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return { bytes: Uint8Array.from(encoded, (character) => character.charCodeAt(0)), mimeType: 'text/csv', extension: 'csv' };
  }
  if (report.format === 'xlsx') {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('HydroSense');
    sheet.columns = [{ header: 'Section', key: 'section', width: 18 }, { header: 'Item', key: 'item', width: 38 }, { header: 'Details', key: 'details', width: 85 }];
    rows.forEach((row) => sheet.addRow(row));
    const data = await workbook.xlsx.writeBuffer();
    return { bytes: new Uint8Array(data), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
  }
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const supportedCharacters = new Set(font.getCharacterSet());
  let page = document.addPage();
  let y = page.getHeight() - 48;
  for (const row of rows) {
    const text = row.join(' | ').replace(/[\r\n\t]+/g, ' ');
    if ([...text].some((character) => !supportedCharacters.has(character.codePointAt(0)!))) {
      throw new Error('This report contains text that the PDF font cannot display. Choose CSV or XLSX instead.');
    }
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 10) <= page.getWidth() - 96) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (font.widthOfTextAtSize(line + character, 10) > page.getWidth() - 96 && line) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    for (const item of lines) {
      if (y < 48) { page = document.addPage(); y = page.getHeight() - 48; }
      page.drawText(item, { x: 48, y, size: 10, font });
      y -= 14;
    }
    y -= 4;
  }
  return { bytes: await document.save(), mimeType: 'application/pdf', extension: 'pdf' };
}
