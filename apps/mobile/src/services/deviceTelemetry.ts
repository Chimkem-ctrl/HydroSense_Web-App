import type { DeviceStatus, Tank } from '@hydrosense/shared';

type TelemetryField = NonNullable<DeviceStatus['reportedFields']>[number];

export function getAssignedDevices(devices: DeviceStatus[], tanks: Tank[]) {
  return devices.flatMap((device) => {
    const tank = tanks.find((item) => item.deviceId === device.deviceId);
    return tank ? [{ device, tank }] : [];
  }).sort((a, b) => a.tank.name.localeCompare(b.tank.name));
}

export function hasReportedField(device: DeviceStatus, field: TelemetryField): boolean {
  return device.reportedFields?.includes(field) === true;
}

export function pendingRecordTotal(devices: DeviceStatus[]): number | null {
  return devices.every((device) => hasReportedField(device, 'pendingSyncCount'))
    ? devices.reduce((total, device) => total + device.pendingSyncCount, 0)
    : null;
}
