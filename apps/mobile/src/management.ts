import { HATCHERIES } from './services/auth';

export function hatcheryLabel(site?: string | null): string {
  const value = site?.trim();
  return HATCHERIES.find((hatchery) => hatchery.id === value)?.name ?? (value || 'Unassigned');
}

export function groupByHatchery<T>(items: T[], getSite: (item: T) => string | null | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = hatcheryLabel(getSite(item));
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return groups;
}
