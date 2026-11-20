import { describe, expect, it } from 'vitest';
import { activityLogCsv } from './activityLogs';
import type { ActivityLog } from '@hydrosense/shared';

describe('activity log CSV export', () => {
  it('uses Manila timestamps and escapes formula-like cell values', () => {
    const logs: ActivityLog[] = [{
      id: 'log-1',
      tankId: 'tank-a',
      kind: 'OPERATION',
      type: 'Feeding',
      occurredAt: '2025-01-01T16:30:00.000Z',
      operator: '=HYPERLINK("https://example.test")',
      notes: '@SUM(1,2)',
      manualReadings: {
        dissolvedOxygen: 5.2,
        salinity: 30.2,
        ammonia: 0.1,
        method: 'test kit',
      },
    }];

    const csv = activityLogCsv(logs, [{
      id: 'tank-a',
      name: '+Tank A',
      site: 'Sagay',
      rearingStartDate: '2025-01-01',
      deviceId: 'HS-001',
    }]);

    expect(csv).toContain('"Jan 2, 2025, 12:30 AM"');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain('"\'@SUM(1,2)"');
    expect(csv).toContain(`"'+Tank A"`);
    expect(csv).toContain('"Hatchery","Timestamp (PHT)"');
    expect(csv).toContain('"Sagay","Jan 2, 2025');
    expect(csv).toContain('"Water source"');
    expect(csv).toContain('"Manual readings"');
    expect(csv).toContain('"Dissolved oxygen: 5.2 mg/L; Salinity: 30.2 ppt; Ammonia: 0.1 mg/L; Method: test kit"');
    expect(csv).not.toContain('"Manual ammonia (mg/L)"');
  });

  it('includes the location of hatchery-wide activity', () => {
    const csv = activityLogCsv([{ id: 'b', tankId: 'hatchery', hatcheryId: 'camiguin-benoni', kind: 'ENVIRONMENT', type: 'Rainfall', occurredAt: '2025-01-01T00:00:00Z', operator: 'A', notes: '' }], []);
    expect(csv).toContain('"Benoni"');
  });
});
