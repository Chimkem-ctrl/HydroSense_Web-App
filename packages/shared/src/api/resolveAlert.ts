import type { AcknowledgeAlertInput, HydroSenseApi } from './types';
import type { AlertItem } from '../types';

export async function resolveAlertWithActivityLog(
  api: Pick<HydroSenseApi, 'resolveAlert' | 'createActivityLog'>,
  alertId: string,
  input: AcknowledgeAlertInput,
): Promise<{ alert: AlertItem; activityError: string | null }> {
  const alert = await api.resolveAlert(alertId, input);
  try {
    await api.createActivityLog({
      tankId: alert.tankId,
      kind: 'ALERT RESOLUTION',
      type: `Resolved: ${alert.parameter}`,
      operator: input.user,
      notes: input.note,
    });
    return { alert, activityError: null };
  } catch (error) {
    return { alert, activityError: error instanceof Error ? error.message : String(error) };
  }
}
