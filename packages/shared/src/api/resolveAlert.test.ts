import { describe, expect, it, vi } from 'vitest';
import { resolveAlertWithActivityLog } from './resolveAlert';
import type { AlertItem } from '../types';

const alert: AlertItem = {
  id: 'a', tankId: 'tank', parameter: 'ph', value: 9, threshold: '8',
  severity: 'warning', status: 'resolved', createdAt: '2026-01-01T00:00:00Z',
};
const input = { user: 'Manager', note: 'Checked' };

describe('resolve alert with activity log', () => {
  it('records the resolution for the same tank and user', async () => {
    const api = { resolveAlert: vi.fn().mockResolvedValue(alert), createActivityLog: vi.fn().mockResolvedValue({}) };
    expect(await resolveAlertWithActivityLog(api, alert.id, input)).toEqual({ alert, activityError: null });
    expect(api.createActivityLog).toHaveBeenCalledWith({
      tankId: 'tank', kind: 'ALERT RESOLUTION', type: 'Resolved: ph', operator: 'Manager', notes: 'Checked',
    });
  });

  it('distinguishes a saved resolution from a failed activity log', async () => {
    const api = { resolveAlert: vi.fn().mockResolvedValue(alert), createActivityLog: vi.fn().mockRejectedValue(new Error('offline')) };
    expect(await resolveAlertWithActivityLog(api, alert.id, input)).toEqual({ alert, activityError: 'offline' });
  });

  it('does not create an activity log when resolving fails', async () => {
    const api = { resolveAlert: vi.fn().mockRejectedValue(new Error('Forbidden')), createActivityLog: vi.fn() };
    await expect(resolveAlertWithActivityLog(api, alert.id, input)).rejects.toThrow('Forbidden');
    expect(api.createActivityLog).not.toHaveBeenCalled();
  });
});
