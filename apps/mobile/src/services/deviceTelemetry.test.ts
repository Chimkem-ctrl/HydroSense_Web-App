import { describe, expect, it } from 'vitest';
import type { DeviceStatus, Tank } from '@hydrosense/shared';
import { getAssignedDevices, hasReportedField, pendingRecordTotal } from './deviceTelemetry';

const device: DeviceStatus = {
  deviceId: 'device-1', online: false, lastSeen: '2026-01-01T00:00:00Z',
  batteryPct: 0, powerSource: 'grid', wifiRssi: 0, pendingSyncCount: 0,
};

describe('device telemetry provenance', () => {
  it('only includes assigned devices, sorted by tank name', () => {
    const tanks: Tank[] = [
      { id: '1', name: 'Tank B', deviceId: 'device-1', site: '', rearingStartDate: '' },
      { id: '2', name: 'Tank A', deviceId: 'device-2', site: '', rearingStartDate: '' },
    ];
    const devices = [device, { ...device, deviceId: 'device-2' }, { ...device, deviceId: 'unassigned' }];
    expect(getAssignedDevices(devices, tanks).map(({ tank, device: status }) => [tank.name, status.deviceId]))
      .toEqual([['Tank A', 'device-2'], ['Tank B', 'device-1']]);
    expect(getAssignedDevices(devices, [])).toEqual([]);
  });

  it('does not present legacy or missing values as reported telemetry', () => {
    expect(hasReportedField(device, 'batteryPct')).toBe(false);
    expect(pendingRecordTotal([device])).toBeNull();
  });

  it('counts reported zeroes and refuses an incomplete total', () => {
    const reported: DeviceStatus = { ...device, reportedFields: ['batteryPct', 'pendingSyncCount'] };
    expect(hasReportedField(reported, 'batteryPct')).toBe(true);
    expect(pendingRecordTotal([reported])).toBe(0);
    expect(pendingRecordTotal([reported, device])).toBeNull();
  });
});
