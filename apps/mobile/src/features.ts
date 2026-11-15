import { can } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';

export type PlannedFeature = 'fleet' | 'batchTracking';

export function canShowPlannedFeature(role: Role | null | undefined, feature: PlannedFeature, enabled: boolean): boolean {
  return enabled && can(role, feature);
}

export const mobileFeatureFlags: Record<PlannedFeature, boolean> = {
  fleet: process.env.EXPO_PUBLIC_ENABLE_FLEET === 'true',
  batchTracking: process.env.EXPO_PUBLIC_ENABLE_BATCH_TRACKING === 'true',
};
