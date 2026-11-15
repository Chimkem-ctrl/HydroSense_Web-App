import { can } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';

const access = {
  history: 'history',
  thresholds: 'thresholdsAndRules',
  validation: 'validation',
  admin: 'usersAndRoles',
} as const;

export function canAccess(role: Role | null, feature: keyof typeof access): boolean {
  return can(role, access[feature]);
}
