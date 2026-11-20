/**
 * @param {boolean} live
 * @param {number | null} batteryPct
 * @param {number | null} wifiRssi
 * @param {number | null} pendingSyncCount
 * @returns {string[]}
 */
export function reportedDeviceFields(live, batteryPct, wifiRssi, pendingSyncCount) {
  if (!live) return [];
  return [
    ...(batteryPct !== null && batteryPct >= 0 && batteryPct <= 100 ? ["batteryPct"] : []),
    ...(wifiRssi !== null ? ["wifiRssi"] : []),
    ...(pendingSyncCount !== null && Number.isInteger(pendingSyncCount) && pendingSyncCount >= 0 ? ["pendingSyncCount"] : []),
  ];
}
