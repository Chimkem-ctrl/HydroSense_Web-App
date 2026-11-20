import type { ActivityLog, Tank } from '@hydrosense/shared';
import { activityHatcheryName } from '@hydrosense/shared';

function manilaTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function csvCell(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function activityLogCsv(logs: ActivityLog[], tanks: Tank[]) {
  const rows: string[][] = [
    ['Hatchery', 'Timestamp (PHT)', 'Tank', 'Type', 'Activity', 'Operator', 'Water change (%)', 'Water source', 'Manual salinity (ppt)', 'Manual DO (mg/L)', 'Manual temperature (°C)', 'Manual pH', 'Manual ammonia (mg/L)', 'Manual method', 'Impact', 'Notes'],
    ...logs.map((log) => [
      activityHatcheryName(log, tanks),
      manilaTimestamp(log.occurredAt),
      log.tankId === 'hatchery'
        ? 'Hatchery-wide'
        : tanks.find((tank) => tank.id === log.tankId)?.name ?? log.tankId,
      log.kind,
      log.type,
      log.operator,
      log.waterChangePercent === undefined ? '' : String(log.waterChangePercent),
      log.waterSource ?? '',
      log.manualReadings?.salinity === undefined ? '' : String(log.manualReadings.salinity),
      log.manualReadings?.dissolvedOxygen === undefined ? '' : String(log.manualReadings.dissolvedOxygen),
      log.manualReadings?.temperature === undefined ? '' : String(log.manualReadings.temperature),
      log.manualReadings?.ph === undefined ? '' : String(log.manualReadings.ph),
      log.manualReadings?.ammonia === undefined ? '' : String(log.manualReadings.ammonia),
      log.manualReadings?.method ?? '',
      log.impact ?? '',
      log.notes,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function manilaDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
