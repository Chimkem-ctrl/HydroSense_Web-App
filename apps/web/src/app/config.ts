import { ROLE_MATRIX } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';

export type Tier = 'free' | 'premium' | 'enterprise';

export interface TierConfig {
  tier: Tier;
  nodeLimit: number;
  refreshIntervalMs: number;
  retentionDays: number;
  analytics: boolean;
  teamAccounts: boolean;
  integrations: boolean;
  fleetView: boolean;
  batchTracking: boolean;
  pilotUnlocked: boolean;
}

function configuredTier(): Tier {
  const value = import.meta.env.VITE_TIER ?? 'enterprise';
  if (value === 'free' || value === 'premium' || value === 'enterprise') return value;
  throw new Error(`Unsupported VITE_TIER "${value}". Expected free, premium, or enterprise.`);
}

const requestedTier = configuredTier();
const unlockSetting = import.meta.env.VITE_PILOT_UNLOCK_ALL;
if (unlockSetting !== undefined && unlockSetting !== 'true' && unlockSetting !== 'false') {
  throw new Error(`Unsupported VITE_PILOT_UNLOCK_ALL "${unlockSetting}". Expected true or false.`);
}
const pilotUnlocked = import.meta.env.VITE_PILOT_UNLOCK_ALL !== 'false';
const tierFeatures: Record<Tier, Omit<TierConfig, 'tier' | 'pilotUnlocked'>> = {
  free: { nodeLimit: 2, refreshIntervalMs: 30_000, retentionDays: 1, analytics: false, teamAccounts: false, integrations: false, fleetView: false, batchTracking: false },
  premium: { nodeLimit: 20, refreshIntervalMs: 10_000, retentionDays: 30, analytics: true, teamAccounts: true, integrations: true, fleetView: false, batchTracking: false },
  enterprise: { nodeLimit: 200, refreshIntervalMs: 5_000, retentionDays: 365, analytics: true, teamAccounts: true, integrations: true, fleetView: true, batchTracking: true },
};

export const tierConfig: TierConfig = {
  tier: requestedTier,
  ...(pilotUnlocked ? tierFeatures.enterprise : tierFeatures[requestedTier]),
  pilotUnlocked,
};

const configuredDataMode = import.meta.env.VITE_DATA_MODE ?? 'mock';
if (configuredDataMode !== 'mock' && configuredDataMode !== 'api') {
  throw new Error(`Unsupported VITE_DATA_MODE "${configuredDataMode}". Expected mock or api.`);
}
export const DATA_MODE: 'mock' | 'api' = configuredDataMode;

export const ROLE_LABELS: Record<Role, string> = {
  operator: 'Operator',
  manager: 'Manager',
  admin: 'Admin',
};

export const ROLE_ACCESS = {
  live: ROLE_MATRIX.live,
  tanks: ROLE_MATRIX.tanks,
  trends: ROLE_MATRIX.trends,
  history: ROLE_MATRIX.history,
  alerts: ROLE_MATRIX.alerts,
  thresholds: ROLE_MATRIX.thresholdsAndRules,
  entries: ROLE_MATRIX.activityLogs,
  reports: ROLE_MATRIX.reports,
  calibration: ROLE_MATRIX.calibration,
  validation: ROLE_MATRIX.validation,
  users: ROLE_MATRIX.usersAndRoles,
  logs: ROLE_MATRIX.auditLogs,
  profile: ROLE_MATRIX.profile,
  enterpriseFeatures: ROLE_MATRIX.fleet,
};

export const NAV_ITEMS = [
  { path: '/', label: 'Live monitor', group: 'Monitor', roles: ROLE_ACCESS.live },
  { path: '/tanks', label: 'Tanks & system health', group: 'Monitor', roles: ROLE_ACCESS.tanks },
  { path: '/trends', label: 'Trends', group: 'Monitor', roles: ROLE_ACCESS.trends },
  { path: '/history', label: 'Historical logs', group: 'Records', roles: ROLE_ACCESS.history },
  { path: '/alerts', label: 'Alerts center', group: 'Monitor', roles: ROLE_ACCESS.alerts },
  { path: '/entries', label: 'Activity logs', group: 'Records', roles: ROLE_ACCESS.entries },
  { path: '/calibration', label: 'Calibration', group: 'Records', roles: ROLE_ACCESS.calibration },
  { path: '/reports', label: 'Export', group: 'Records', roles: ROLE_ACCESS.reports },
  { path: '/validation', label: 'Validation', group: 'Records', roles: ROLE_ACCESS.validation },
  { path: '/settings/thresholds', label: 'Thresholds & rules', group: 'Manage', roles: ROLE_ACCESS.thresholds },
  { path: '/admin/users', label: 'Users & roles', group: 'Manage', roles: ROLE_ACCESS.users },
  { path: '/admin/logs', label: 'Audit & system logs', group: 'Manage', roles: ROLE_ACCESS.logs },
  { path: '/profile', label: 'My profile', group: 'Manage', roles: ROLE_ACCESS.profile },
  { path: '/settings', label: 'Account settings', group: 'Manage', roles: ROLE_ACCESS.profile },
] as const;
