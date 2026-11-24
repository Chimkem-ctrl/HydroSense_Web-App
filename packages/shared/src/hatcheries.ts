import type { ActivityLog, Tank } from './types';

export interface HatcheryLocation {
  id: string;
  name: string;
}

export const DEFAULT_HATCHERIES: HatcheryLocation[] = [
  { id: 'camiguin-sagay', name: 'Sagay' },
  { id: 'camiguin-benoni', name: 'Benoni' },
];

export function hatcheryId(site: string): string {
  const value = site.trim();
  if (/\bsagay\b/i.test(value)) return 'camiguin-sagay';
  if (/\bbenoni\b/i.test(value)) return 'camiguin-benoni';
  return value;
}

export function hatcheryLocations(tanks: Tank[]): HatcheryLocation[] {
  const locations = [...DEFAULT_HATCHERIES];
  for (const tank of tanks) {
    const id = hatcheryId(tank.site);
    if (id && !locations.some((item) => item.id === id)) locations.push({ id, name: tank.site });
  }
  return locations;
}

export function tankInHatchery(tank: Tank, location: string): boolean {
  return location === 'all' || hatcheryId(tank.site) === location;
}

export function activityInHatchery(log: ActivityLog, tanks: Tank[], location: string): boolean {
  if (location === 'all') return true;
  if (log.tankId === 'hatchery') return hatcheryId(log.hatcheryId ?? 'camiguin-sagay') === location;
  const tank = tanks.find((item) => item.id === log.tankId);
  return Boolean(tank && tankInHatchery(tank, location));
}

export function activityHatcheryName(log: ActivityLog, tanks: Tank[]): string {
  if (log.tankId !== 'hatchery') return tanks.find((tank) => tank.id === log.tankId)?.site ?? '';
  const id = hatcheryId(log.hatcheryId ?? 'camiguin-sagay');
  return hatcheryLocations(tanks).find((location) => location.id === id)?.name ?? log.hatcheryId ?? 'Sagay';
}
