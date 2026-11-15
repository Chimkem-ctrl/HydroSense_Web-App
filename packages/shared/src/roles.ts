import type { Role } from './types';

const all = ['operator', 'manager', 'admin'] as const;
const managers = ['manager', 'admin'] as const;
const admins = ['admin'] as const;

export const ROLE_MATRIX = {
  live: all,
  tanks: all,
  systemHealth: all,
  trends: all,
  alerts: all,
  activityLogs: all,
  manualEntries: all,
  history: all,
  reports: all,
  calibration: all,
  profile: all,
  settings: all,
  validation: managers,
  thresholdsAndRules: managers,
  fleet: managers,
  batchTracking: managers,
  usersAndRoles: admins,
  auditLogs: admins,
  registerTank: managers,
  removeTank: managers,
  editThresholds: managers,
  editAdvisoryRules: managers,
  editValidationTolerances: managers,
  acknowledgeAlert: all,
  resolveAlert: managers,
  exportReports: all,
  exportAlertLog: all,
  exportChart: all,
  assignRoles: admins,
  reviewSignupRequests: admins,
  viewAuditLogs: admins,
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof ROLE_MATRIX;

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return role != null && (ROLE_MATRIX[capability] as readonly Role[]).includes(role);
}
