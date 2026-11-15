import { describe, expect, it } from 'vitest';
import { groupByHatchery, hatcheryLabel } from './management';

describe('hatchery grouping', () => {
  it('groups hatchery IDs and their display labels and keeps unassigned users separate', () => {
    const items = [{ site: 'camiguin-sagay' }, { site: 'Camiguin, Sagay Multispecies Hatchery' }, { site: '' }];
    const groups = groupByHatchery(items, (item) => item.site);
    expect(groups.get(hatcheryLabel('camiguin-sagay'))).toHaveLength(2);
    expect(groups.get('Unassigned')).toHaveLength(1);
    expect(hatcheryLabel(' Custom site ')).toBe('Custom site');
  });
});
