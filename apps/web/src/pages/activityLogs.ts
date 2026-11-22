import type { ActivityLog, Tank } from '@hydrosense/shared';
import { activityHatcheryName, toCsv } from '@hydrosense/shared';

function manilaTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function manualReadingsText(log: ActivityLog) {
  const readings = log.manualReadings;
  if (!readings) return '';
  return [
    ['Dissolved oxygen', readings.dissolvedOxygen, 'mg/L'],
    ['Temperature', readings.temperature, '°C'],
    ['pH', readings.ph, ''],
    ['Salinity', readings.salinity, 'ppt'],
    ['Ammonia', readings.ammonia, 'mg/L'],
  ].flatMap(([label, value, unit]) => value === undefined ? [] : [`${label}: ${value}${unit ? ` ${unit}` : ''}`])
    .concat(readings.method ? [`Method: ${readings.method}`] : [])
    .join('; ');
}

export function activityLogCsv(logs: ActivityLog[], tanks: Tank[]) {
  const rows: unknown[][] = [
    ['Hatchery', 'Timestamp (PHT)', 'Tank/scope', 'Kind', 'Activity', 'Operator', 'Water change (%)', 'Water source', 'Manual readings', 'Impact', 'Notes'],
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
      manualReadingsText(log),
      log.impact ?? '',
      log.notes,
    ]),
  ];
  return toCsv(rows);
}

export function manilaDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
