import type { DeviceStatus, Tank } from '@hydrosense/shared';

type TelemetryField = NonNullable<DeviceStatus['reportedFields']>[number];

export function getAssignedDevices(devices: DeviceStatus[], tanks: Tank[]) {
  return tanks.map((tank) => ({
    tank,
    device: tank.deviceId ? devices.find((device) => device.deviceId === tank.deviceId) : undefined,
  })).sort((a, b) => a.tank.name.localeCompare(b.tank.name));
}

export function hasReportedField(device: DeviceStatus, field: TelemetryField): boolean {
  return device.reportedFields?.includes(field) === true;
}

export function pendingRecordTotal(devices: DeviceStatus[]): number | null {
  const reported = devices.filter((device) => hasReportedField(device, 'pendingSyncCount') && Number.isFinite(device.pendingSyncCount));
  return reported.length ? reported.reduce((total, device) => total + device.pendingSyncCount, 0) : null;
}
