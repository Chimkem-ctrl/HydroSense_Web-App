import { describe, expect, it } from 'vitest';
import type { DeviceStatus } from './types';
import { recentWifiSignal } from './deviceTelemetry';

const now = Date.parse('2026-11-27T00:00:00Z');
const device: DeviceStatus = {
  deviceId: 'device',
  online: true,
  lastSeen: new Date(now - 119_999).toISOString(),
  wifiRssi: -59,
  reportedFields: ['wifiRssi'],
  batteryPct: null,
  powerSource: 'grid',
  pendingSyncCount: 0,
};

describe('recent Wi-Fi signal', () => {
  it('expires at two minutes even if the device remains online', () => {
    expect(recentWifiSignal(device, now)).toBe(-59);
    expect(recentWifiSignal(device, now + 1)).toBeNull();
  });

  it('does not show offline, unreported, invalid, or future data', () => {
    expect(recentWifiSignal({ ...device, online: false }, now)).toBeNull();
    expect(recentWifiSignal({ ...device, reportedFields: [] }, now)).toBeNull();
    expect(recentWifiSignal({ ...device, wifiRssi: NaN }, now)).toBeNull();
    expect(recentWifiSignal({ ...device, lastSeen: 'invalid' }, now)).toBeNull();
    expect(recentWifiSignal({ ...device, lastSeen: new Date(now + 1).toISOString() }, now)).toBeNull();
    expect(recentWifiSignal(undefined, now)).toBeNull();
  });
});
