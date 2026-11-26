import type { DeviceStatus } from './types';

export function recentWifiSignal(device: DeviceStatus | undefined, now = Date.now()): number | null {
  if (!device?.online || !device.reportedFields?.includes('wifiRssi') || !Number.isFinite(device.wifiRssi)) return null;
  const age = now - Date.parse(device.lastSeen);
  return Number.isFinite(age) && age >= 0 && age < 120_000 ? device.wifiRssi : null;
}
