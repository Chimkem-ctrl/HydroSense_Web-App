import { describe, expect, it } from 'vitest';
import { bottomBarRoutes, isBottomBarRoute } from './navigation';

describe('mobile bottom navigation', () => {
  it('keeps records pages out of the bottom bar', () => {
    expect(bottomBarRoutes).toEqual(['Home', 'Alerts', 'Trends', 'Status']);
    expect(['Home', 'Alerts', 'Trends', 'Activity', 'Calibration', 'Reports', 'Status', 'History', 'Review', 'Settings'].filter(isBottomBarRoute))
      .toEqual(bottomBarRoutes);
  });
});
