import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reportedDeviceFields } from '../supabase/functions/api/reportedFields.mjs';

describe('reported device fields', () => {
  it('records only valid values supplied by a live device', () => {
    assert.deepEqual(reportedDeviceFields(true, null, -60, 0), ['wifiRssi', 'pendingSyncCount']);
    assert.deepEqual(reportedDeviceFields(true, 101, null, -1), []);
    assert.deepEqual(reportedDeviceFields(true, 0, 0, 0), ['batteryPct', 'wifiRssi', 'pendingSyncCount']);
  });

  it('does not present historical telemetry as current', () => {
    assert.deepEqual(reportedDeviceFields(false, 80, -60, 1), []);
  });
});
