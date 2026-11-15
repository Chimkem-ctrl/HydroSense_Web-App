import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react-native';
import { formatManilaDateTime } from '@hydrosense/shared';
import { api } from '../services/client';
import { useSession } from '../state';
import { useTheme } from '../theme';
import { Button } from './ui';

export const CRITICAL_ACK_NOTE = 'Acknowledged from the critical alert banner.';

export function CriticalAlertModal() {
  const { colors } = useTheme();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['alerts', 'critical-popup'], queryFn: () => api.listAlerts(), enabled: Boolean(user), refetchInterval: 30000 });
  const critical = (query.data ?? [])
    .filter((alert) => alert.status === 'open' && alert.severity === 'critical')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alert = critical[0];
  const mutation = useMutation({
    mutationFn: (alertId: string) => api.acknowledgeAlert(alertId, { note: CRITICAL_ACK_NOTE, user: user?.name ?? 'Mobile user' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-responses'] }),
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-responses'] }),
      ]);
    },
  });
  if (!alert) return mutation.isError ? <View accessibilityRole="alert" style={{ padding: 12, gap: 6, backgroundColor: colors.surface }}><Text style={{ color: colors.critical }}>Acknowledgement failed: {mutation.error.message}</Text><Button label="Dismiss" secondary onPress={() => mutation.reset()} /></View> : null;
  return <View accessibilityRole="alert" style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.critical, backgroundColor: colors.surface }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <AlertTriangle size={19} color={colors.critical} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.critical, fontWeight: '800' }}>Critical alert · {alert.parameter} {alert.value}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{alert.tankId} · {formatManilaDateTime(alert.createdAt)} PHT{critical.length > 1 ? ` · ${critical.length - 1} more` : ''}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Acknowledge critical alert" disabled={mutation.isPending} onPress={() => mutation.mutate(alert.id)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.critical }}>
        <Text style={{ color: colors.critical, fontWeight: '700' }}>{mutation.isPending ? 'Saving…' : 'Acknowledge'}</Text>
      </Pressable>
    </View>
    {mutation.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{mutation.error.message}</Text>}
  </View>;
}
