import { describe, expect, it } from 'vitest';
import { can, ROLE_MATRIX } from './roles';
import type { Capability } from './roles';

describe('role matrix v5', () => {
  const all: Capability[] = [
    'live', 'tanks', 'systemHealth', 'trends', 'alerts', 'activityLogs', 'manualEntries',
    'history', 'reports', 'profile', 'settings', 'acknowledgeAlert',
    'exportReports', 'exportAlertLog', 'exportChart',
  ];
  const managers: Capability[] = [
    'validation', 'calibration', 'usersAndRoles', 'thresholdsAndRules', 'fleet', 'batchTracking', 'registerTank', 'removeTank',
    'editThresholds', 'editAdvisoryRules', 'editValidationTolerances', 'resolveAlert',
  ];
  const admins: Capability[] = ['auditLogs', 'assignRoles', 'reviewSignupRequests', 'viewAuditLogs'];
  const roles = ['operator', 'manager', 'admin'] as const;

  it('covers every capability and grants the specified roles', () => {
    expect([...all, ...managers, ...admins].sort()).toEqual(Object.keys(ROLE_MATRIX).sort());
    for (const capability of all) {
      expect(roles.map((role) => can(role, capability))).toEqual([true, true, true]);
    }
    for (const capability of managers) {
      expect(roles.map((role) => can(role, capability))).toEqual([false, true, true]);
    }
    for (const capability of admins) {
      expect(roles.map((role) => can(role, capability))).toEqual([false, false, true]);
    }
    expect(can(null, 'live')).toBe(false);
  });
});
