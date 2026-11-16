import type { Role } from '@hydrosense/shared';

const access: Record<'history' | 'validation' | 'users' | 'admin' | 'canEditThresholds' | 'canExport' | 'canCalibrate', Role[]> = {
  history: ['operator', 'manager', 'admin'],
  validation: ['manager', 'admin'],
  users: ['manager', 'admin'],
  admin: ['admin'],
  canEditThresholds: ['manager', 'admin'],
  canExport: ['manager', 'admin'],
  canCalibrate: ['manager', 'admin'],
};

export function canAccess(role: Role | null, feature: keyof typeof access): boolean {
  return role !== null && access[feature].includes(role);
}
