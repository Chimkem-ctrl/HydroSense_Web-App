import { useMemo, useState, useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Portal } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart } from 'react-native-gifted-charts';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_OPERATION_TYPES,
  DEFAULT_ADVISORY_RULES,
  formatManilaDateTime,
  formatParameter,
  getManilaDateString,
  getParameterStatus,
  getReadingStatuses,
  getRaisingDay,
  toCsv,
  validateAcknowledgeNote,
  validateActivityLog,
  validateAdvisoryRules,
  validateThresholds,
} from '@hydrosense/shared';
import type { ActivityLog, ActivityLogKind, AdvisoryRuleSettings, AlertItem, CalibrationLog, MeasuredParameter, Reading, Role, Threshold } from '@hydrosense/shared';
import type { MainTabParamList, RootStackParamList } from './navigation';
import { DATA_MODE, api, listPendingAccounts, reviewPendingAccount } from './services/client';
import { canAccess } from './access';
import { useSession, useTankSelection } from './state';
import { Button, Card, Chip, createFormStyles, createRecordStyles, DataRow, FilterField, Page, StateMessage, Title } from './components/ui';
import { uiScale, useTheme } from './theme';
import type { Palette, ThemeChoice } from './theme';

type Props<T extends keyof MainTabParamList> = BottomTabScreenProps<MainTabParamList, T>;
type RootProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', secureTextEntry = false }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  secureTextEntry?: boolean;
}) {
  const { colors } = useTheme();
  const ui = createFormStyles(colors);
  return <View style={ui.formField}><Text style={ui.label}>{label}</Text><TextInput style={ui.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} /></View>;
}

function TankPicker({ horizontal = false }: { horizontal?: boolean }) {
  const { colors } = useTheme();
  const { tanks, tankId, setTankId, isLoading, error, refetch } = useTankSelection();
  if (isLoading) return <StateMessage message="Loading tanks…" loading />;
  if (error) return <Card><StateMessage message={`Could not load tanks: ${error.message}`} /><Button label="Retry tank list" onPress={refetch} secondary /></Card>;
  if (tanks.length === 0) return <StateMessage message="No tanks are available for this account." />;
  const chips = tanks.map((tank) => <Pressable accessibilityRole="button" accessibilityState={{ selected: tank.id === tankId }} key={tank.id} onPress={() => setTankId(tank.id)} style={{ minHeight: horizontal ? 44 : 48, justifyContent: 'center', borderRadius: uiScale.radius.pill, borderWidth: 1, borderColor: tank.id === tankId ? colors.teal : colors.border, paddingVertical: uiScale.spacing[2], paddingHorizontal: uiScale.spacing[4], backgroundColor: tank.id === tankId ? colors.selected : colors.surface }}><Text style={{ color: tank.id === tankId ? colors.teal : colors.ink, fontWeight: '700', fontSize: uiScale.type.body }}>{tank.name}</Text></Pressable>);
  return horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Select tank" contentContainerStyle={{ gap: uiScale.spacing[2], alignItems: 'stretch' }}>{chips}</ScrollView>
    : <View accessibilityLabel="Select tank" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>{chips}</View>;
}

const createLogScreenStyles = (colors: Palette) => StyleSheet.create({
  cards: { gap: uiScale.spacing[4] },
  filters: { gap: uiScale.spacing[3] },
  dates: { flexDirection: 'row', gap: uiScale.spacing[3], alignItems: 'flex-start' },
  label: { color: colors.muted, fontSize: uiScale.type.caption },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: uiScale.spacing[3] },
  stackedActions: { flexDirection: 'column' },
  actionButton: { flex: 1 },
  count: { color: colors.muted, fontSize: uiScale.type.caption },
  modalOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: uiScale.spacing[4] },
  modalScroll: { width: '100%', maxHeight: '90%' },
  modalInput: { position: 'relative', zIndex: 1, minHeight: 44, color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, padding: uiScale.spacing[2] },
  modalNotes: { minHeight: 96, textAlignVertical: 'top' },
  modalTitle: { color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700' },
  modalError: { color: colors.critical },
});

function ReadingCard({ parameter, reading, threshold }: { parameter: MeasuredParameter; reading: Reading; threshold?: Threshold }) {
  const { colors } = useTheme();
  const value = parameter === 'do' ? reading.doMgL : reading[parameter];
  const status = getParameterStatus(parameter, value, threshold);
  const label = parameter === 'temperature' ? 'Temperature' : parameter === 'do' ? 'Dissolved oxygen' : 'pH';
  const unit = parameter === 'temperature' ? '°C' : parameter === 'do' ? 'mg/L' : 'pH';
  const min = threshold?.min;
  const max = threshold?.max;
  const safe = min !== undefined && max !== undefined ? `${min}–${max} ${unit}` : min !== undefined ? `≥${min} ${unit}` : max !== undefined ? `≤${max} ${unit}` : 'Not configured';
  const scaleMin = min !== undefined && max !== undefined ? min : min !== undefined ? Math.min(0, min) : max !== undefined ? Math.min(0, max) : undefined;
  const scaleMax = min !== undefined && max !== undefined ? max : min !== undefined ? Math.max(min * 2, min + 1) : max !== undefined ? Math.max(max, 1) : undefined;
  const position = scaleMin !== undefined && scaleMax !== undefined && scaleMax > scaleMin
    ? Math.max(0, Math.min(100, (value - scaleMin) / (scaleMax - scaleMin) * 100)) : null;
  const statusColor = status.level === 'normal' ? colors.normal : status.level === 'warning' ? colors.warning : colors.critical;
  const StatusIcon = status.level === 'normal' ? CheckCircle2 : status.level === 'warning' ? AlertTriangle : AlertCircle;
  return <Card>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: uiScale.spacing[2] }}>
      <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: statusColor, borderWidth: 1, borderRadius: uiScale.radius.pill, paddingHorizontal: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] }}>
        <StatusIcon size={16} color={statusColor} />
        <Text style={{ color: statusColor, fontSize: uiScale.type.caption, fontWeight: '700' }}>{status.label}</Text>
      </View>
    </View>
    <Text style={{ color: colors.ink, fontSize: 38, fontWeight: '400', fontVariant: ['tabular-nums'] }}>{formatParameter(parameter, value)}</Text>
    <Text style={{ color: colors.muted, lineHeight: 20 }}>{status.distance}{'\n'}Safe {safe}</Text>
    {position !== null && <View style={{ gap: uiScale.spacing[2], marginTop: uiScale.spacing[1] }}>
      <LinearGradient colors={['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 8, borderRadius: 8, marginHorizontal: 7 }}>
        <View style={{ position: 'absolute', left: `${position}%`, top: -4, marginLeft: -7, height: 16, width: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.surface }} />
      </LinearGradient>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Display scale {scaleMin}–{scaleMax} {unit}{scaleMin !== undefined && scaleMax !== undefined && (value < scaleMin || value > scaleMax) ? ' · marker at scale edge' : ''}</Text>
    </View>}
    <Text style={{ color: colors.muted, fontSize: 12 }}>Updated {formatManilaDateTime(reading.timestamp)} PHT</Text>
  </Card>;
}

export function HomeScreen({ navigation }: Props<'Home'>) {
  const { colors } = useTheme();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const { tankId, tanks } = useTankSelection();
  const { data: reading, isLoading, isError, refetch } = useQuery({ queryKey: ['latest-reading', tankId], queryFn: () => api.getLatestReading(tankId), enabled: Boolean(tankId) });
  const thresholds = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const advisories = useQuery({ queryKey: ['advisories', tankId], queryFn: () => api.listAdvisories(tankId), enabled: Boolean(tankId) });
  const devices = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const alerts = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const tank = tanks.find((item) => item.id === tankId);
  const statuses = reading && thresholds.data ? getReadingStatuses(reading, thresholds.data) : null;
  const device = devices.data?.find((item) => item.deviceId === tank?.deviceId);
  const openCount = alerts.data?.filter((item) => item.status !== 'resolved').length ?? 0;
  return <Page>
    <View style={{ gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700', letterSpacing: 1 }}>WATER QUALITY MONITORING</Text><Text style={{ color: colors.ink, fontSize: uiScale.type.title, fontWeight: '500' }}>Welcome, {user?.name}.</Text></View>
    <Title detail={tank ? `${tank.name} · ${tank.site} · rearing day ${getRaisingDay(tank.rearingStartDate)}/21` : 'Live water-quality status'}>Live monitor</Title>
    <TankPicker />
    {isLoading || thresholds.isLoading ? <StateMessage message="Loading latest readings and thresholds…" loading /> : isError || thresholds.isError ? <Card><StateMessage message={`Could not load readings or thresholds: ${(thresholds.error ?? null)?.message ?? 'Check your connection.'}`} /><Button label="Retry" onPress={() => { void refetch(); void thresholds.refetch(); }} secondary /></Card> : reading && statuses ? <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>
        {(['temperature', 'do', 'ph'] as const).map((parameter) => <View key={parameter} style={{ width: width >= 950 ? '32%' : width >= 600 ? '48%' : '100%' }}><ReadingCard parameter={parameter} reading={reading} threshold={thresholds.data?.find((item) => item.parameter === parameter)} /></View>)}
      </View>
      <Card title="Water-quality advisories">
        <Text style={{ color: colors.muted, lineHeight: 20 }}>Salinity and ammonia are not measured by the sensors. These rule-based advisories are not readings.</Text>
        {advisories.isLoading ? <StateMessage message="Loading advisories…" loading /> : advisories.isError ? <StateMessage message="Could not load advisories." /> : (advisories.data ?? []).length === 0 ? <StateMessage message="No advisories are available for this tank." /> : advisories.data?.map((item) => <DataRow key={item.kind} label={`${item.kind === 'salinity' ? 'Salinity' : 'Ammonia'} risk`} value={item.level.toUpperCase()} />)}
      </Card>
      <Card title="Last update"><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatManilaDateTime(reading.timestamp)} PHT</Text><Text style={{ color: colors.muted }}>Readings are sampled every 3 hours.</Text></Card>
      <Card title="Device connection">
        {devices.isLoading ? <StateMessage message="Loading device status…" loading /> : devices.isError ? <StateMessage message="Could not load device status." /> : !device ? <StateMessage message="No device is registered for this tank." /> : <>
          <DataRow label="Connection" value={device.online ? 'Online' : 'Offline'} />
          <DataRow label="Battery" value={device.batteryPct > 0 ? `${device.batteryPct}%` : 'Unavailable'} detail={`Power source: ${device.powerSource}`} />
          {alerts.isError ? <StateMessage message="Could not load alerts." /> : <DataRow label="Active alerts" value={alerts.isLoading ? 'Loading…' : `${openCount}`} />}
        </>}
        <Button label="Calibration helper" secondary onPress={() => navigation.getParent()?.navigate('Calibration')} />
      </Card>
    </> : <StateMessage message="No reading is available for this tank." />}
    <Button label="Record manual water test" onPress={() => navigation.getParent()?.navigate('FieldEntry')} secondary />
  </Page>;
}

function alertTitle(alert: AlertItem) {
  return `${alert.parameter} · ${alert.severity}`;
}

export function AlertsScreen({ navigation }: Props<'Alerts'>) {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const query = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const rows = [...(query.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <Page>
    <Title detail="Review alerts and responses">Alerts</Title>
    <TankPicker />
    <Card title="Alert list">
      {query.isLoading ? <StateMessage message="Loading alerts…" loading /> : query.isError ? <StateMessage message="Alert data could not be loaded." /> : rows.length === 0 ? <StateMessage message="No alerts are recorded for this tank." /> : rows.map((alert) => {
        const StatusIcon = alert.severity === 'critical' ? AlertCircle : AlertTriangle;
        const statusColor = alert.severity === 'critical' ? colors.critical : colors.warning;
        return <Pressable key={alert.id} onPress={() => navigation.getParent()?.navigate('AlertDetail', { alertId: alert.id })} style={{ minHeight: 64, justifyContent: 'center', paddingVertical: uiScale.spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[1] }}><StatusIcon size={16} color={statusColor} /><Text style={{ color: statusColor, fontWeight: '800' }}>{alertTitle(alert)} · {alert.status}</Text></View>
        <Text style={{ color: colors.ink }}>{alert.value} · threshold {alert.threshold}</Text>
        <Text style={{ color: colors.muted }}>{formatManilaDateTime(alert.createdAt)} PHT · tap for details</Text>
      </Pressable>;
      })}
    </Card>
  </Page>;
}

export function AlertDetailScreen({ route }: RootProps<'AlertDetail'>) {
  const { colors } = useTheme();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const alertQuery = useQuery({ queryKey: ['alert-detail', route.params.alertId], queryFn: async () => (await api.listAlerts()).find((item) => item.id === route.params.alertId) ?? null });
  const responses = useQuery({ queryKey: ['alert-responses', route.params.alertId], queryFn: () => api.listAlertResponses(route.params.alertId) });
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: async (status: 'acknowledge' | 'resolve') => {
      const issues = validateAcknowledgeNote(note);
      if (issues.length) throw new Error(issues[0].message);
      const input = { note: note.trim(), user: user?.name ?? 'Mobile user' };
      if (status === 'acknowledge') return api.acknowledgeAlert(route.params.alertId, input);
      const resolved = await api.resolveAlert(route.params.alertId, input);
      await api.createActivityLog({
        tankId: resolved.tankId,
        kind: 'ALERT RESOLUTION',
        type: `Resolved: ${resolved.parameter}`,
        operator: input.user,
        notes: input.note.trim(),
      });
      return resolved;
    },
    onSuccess: async () => {
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-detail', route.params.alertId] }),
        queryClient.invalidateQueries({ queryKey: ['alert-responses', route.params.alertId] }),
        queryClient.invalidateQueries({ queryKey: ['activity-logs'] }),
      ]);
    },
  });
  const alert = alertQuery.data;
  return <Page>
    <Title detail="Review the alert and record verified actions">Alert detail</Title>
    {alertQuery.isLoading ? <StateMessage message="Loading alert…" loading /> : alertQuery.isError ? <StateMessage message="Could not load alert details." /> : !alert ? <StateMessage message="Alert was not found." /> : <Card title={alertTitle(alert)}>
      <DataRow label="Tank" value={alert.tankId} />
      <DataRow label="Value" value={`${alert.value}`} detail={`Threshold: ${alert.threshold}`} />
      <DataRow label="Status" value={alert.status} detail={`Created ${formatManilaDateTime(alert.createdAt)} PHT`} />
      <Field label="Response note" value={note} onChangeText={setNote} placeholder="What did you observe or verify?" />
      {alert.status === 'open' && <Button label="Acknowledge" disabled={mutation.isPending} onPress={() => mutation.mutate('acknowledge')} secondary />}
      {alert.status !== 'resolved' && <Button label="Resolve alert" disabled={mutation.isPending} onPress={() => mutation.mutate('resolve')} />}
      {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
      <Text style={{ color: colors.ink, fontWeight: '800', marginTop: 8 }}>Response history</Text>
      {responses.isLoading ? <StateMessage message="Loading responses…" loading /> : responses.isError ? <><StateMessage message={`Could not load responses: ${responses.error.message}`} /><Button label="Retry responses" secondary onPress={() => void responses.refetch()} /></> : (responses.data ?? []).length === 0 ? <Text style={{ color: colors.muted }}>No responses recorded.</Text> : responses.data?.map((response) => <Text key={response.id} style={{ color: colors.muted }}>{response.status} · {response.createdBy} · {formatManilaDateTime(response.createdAt)} PHT · {response.note}</Text>)}
    </Card>}
  </Page>;
}

export function TrendsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { tankId } = useTankSelection();
  const from = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const readings = useQuery({ queryKey: ['mobile-trends', tankId], queryFn: () => api.listReadings({ tankId, from }), enabled: Boolean(tankId) });
  const data = [...(readings.data ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map((row, index) => ({ value: row.doMgL, label: index % 2 === 0 ? new Date(row.timestamp).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }) : '' }));
  return <Page>
    <Title detail="24 hours · 3-hour intervals">Trends</Title>
    <TankPicker />
    {readings.isLoading ? <StateMessage message="Loading trend data…" loading /> : readings.isError ? <StateMessage message="Could not load trends." /> : data.length < 2 ? <StateMessage message="Not enough readings to draw a trend." /> : <Card title="Dissolved oxygen · mg/L">
      <LineChart data={data} width={Math.min(width - 64, 640)} height={240} spacing={Math.min(50, (width - 100) / Math.max(data.length - 1, 1))} color={colors.teal} thickness={3} dataPointsColor={colors.teal} yAxisTextStyle={{ color: colors.muted, fontSize: 12 }} xAxisLabelTextStyle={{ color: colors.muted, fontSize: 12 }} />
      <Text style={{ color: colors.muted }}>Trend view is informational; review each point alongside configured thresholds and alert history.</Text>
    </Card>}
  </Page>;
}

export function StatusScreen() {
  const { tankId, tanks } = useTankSelection();
  const statuses = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const tank = tanks.find((item) => item.id === tankId);
  const device = statuses.data?.find((item) => item.deviceId === tank?.deviceId);
  return <Page>
    <Title detail="Sensor and connectivity health">System status</Title>
    <TankPicker />
    {statuses.isLoading ? <StateMessage message="Loading device status…" loading /> : statuses.isError ? <StateMessage message="Could not load device status." /> : !device ? <StateMessage message="No device is registered for this tank." /> : <Card title={device.deviceId}>
      <DataRow label="Connection" value={device.online ? 'Online' : 'Offline'} detail={`Last seen ${formatManilaDateTime(device.lastSeen)} PHT`} />
      <DataRow label="Battery" value={`${device.batteryPct}%`} detail={`Power source: ${device.powerSource}`} />
      <DataRow label="Wi-Fi signal" value={`${device.wifiRssi} dBm`} />
      <DataRow label="Pending offline records" value={`${device.pendingSyncCount}`} />
    </Card>}
  </Page>;
}

export function ManagerReviewScreen() {
  const { user } = useSession();
  const allowed = canAccess(user?.role ?? null, 'validation');
  const rows = useQuery({ queryKey: ['validation'], queryFn: () => api.listValidationRows(), enabled: allowed });
  const tolerances = useQuery({ queryKey: ['validation-tolerances'], queryFn: () => api.getValidationTolerances(), enabled: allowed });
  if (!allowed) return <Page><StateMessage message="You do not have access to validation." /></Page>;
  return <Page>
    <Title detail="Compare sensor averages with reference readings">Manager review</Title>
    {rows.isLoading || tolerances.isLoading ? <StateMessage message="Loading validation…" loading /> :
      rows.isError || tolerances.isError ? <Card><StateMessage message={`Could not load validation: ${(rows.error ?? tolerances.error)?.message ?? 'Unknown error'}`} /><Button label="Retry" secondary onPress={() => { void rows.refetch(); void tolerances.refetch(); }} /></Card> :
      !rows.data?.length || !tolerances.data ? <StateMessage message="No validation comparisons are available." /> :
      rows.data.map((row, index) => {
        const key = row.parameter.toLowerCase().includes('temp') ? 'temperature' : row.parameter.toLowerCase().includes('ph') ? 'ph' : 'do';
        const tolerance = tolerances.data[key];
        const difference = row.hydrosenseMean - row.reference;
        const percent = row.reference === 0 ? 0 : Number((Math.abs(difference) / Math.abs(row.reference) * 100).toFixed(2));
        return <Card key={`${row.parameter}-${index}`} title={row.parameter}>
          <DataRow label="Sensor mean" value={`${row.hydrosenseMean}`} />
          <DataRow label="Reference" value={`${row.reference}`} />
          <DataRow label="Error" value={`${Number(difference.toFixed(3))} (${percent}%)`} />
          <DataRow label="Tolerance" value={`±${tolerance}`} />
          <DataRow label="Result" value={Math.abs(difference) <= tolerance ? 'Pass' : 'Fail'} />
        </Card>;
      })}
  </Page>;
}

export function AdminReviewScreen({ navigation }: Props<'Review'>) {
  const { colors } = useTheme();
  const { user } = useSession();
  const allowed = canAccess(user?.role ?? null, 'admin');
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role | undefined>>({});
  const pending = useQuery({ queryKey: ['pending-accounts'], queryFn: listPendingAccounts, enabled: allowed && DATA_MODE === 'api' });
  const review = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role | null }) => reviewPendingAccount(id, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pending-accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.listUsers(), enabled: allowed });
  const logs = useQuery({ queryKey: ['audit-logs'], queryFn: () => api.listAuditLogs(), enabled: allowed });
  if (!allowed) return <Page><StateMessage message="You do not have access to administration." /></Page>;
  return <Page>
    <Title detail="Review account requests and audit events">Admin overview</Title>
    <Button label="Review validation comparisons" secondary onPress={() => navigation.getParent()?.navigate('ValidationReview')} />
    <Card title="Pending requests">
      {DATA_MODE === 'mock' ? <StateMessage message="Account review is unavailable in mobile demo mode. Connect to the backend to review requests." /> :
        pending.isLoading ? <StateMessage message="Loading requests…" loading /> : pending.isError ? <><StateMessage message={`Could not load requests: ${pending.error.message}`} /><Button label="Retry requests" secondary onPress={() => void pending.refetch()} /></> :
          !pending.data?.length ? <StateMessage message="No account requests are awaiting review." /> : pending.data.map((account) => <View key={account.id} style={{ gap: 8, paddingVertical: 10 }}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{account.firstName} {account.lastName}</Text>
            <Text style={{ color: colors.muted }}>{account.email} · {account.employeeId ?? '—'}</Text>
            <Text style={{ color: colors.ink }}>Choose an approval role:</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['operator', 'manager', 'admin'] as const).map((role) => <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: selectedRoles[account.id] === role }} onPress={() => setSelectedRoles((current) => ({ ...current, [account.id]: role }))}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: uiScale.spacing[3], borderWidth: 1, borderRadius: uiScale.radius.control, borderColor: selectedRoles[account.id] === role ? colors.teal : colors.border, backgroundColor: selectedRoles[account.id] === role ? colors.selected : colors.surface }}>
                <Text style={{ color: colors.ink }}>{role[0].toUpperCase() + role.slice(1)}</Text>
              </Pressable>)}
            </View>
            <Button label="Approve" disabled={!selectedRoles[account.id] || review.isPending} onPress={() => { const role = selectedRoles[account.id]; if (role) review.mutate({ id: account.id, role }); }} />
            <Button label="Reject" secondary disabled={review.isPending} onPress={() => review.mutate({ id: account.id, role: null })} />
          </View>)}
      {review.isError && <StateMessage message={`Could not review request: ${review.error.message}`} />}
    </Card>
    <Card title="Accounts">
      {users.isLoading ? <StateMessage message="Loading accounts…" loading /> : users.isError ? <><StateMessage message={`Could not load accounts: ${users.error.message}`} /><Button label="Retry accounts" secondary onPress={() => void users.refetch()} /></> : !users.data?.length ? <StateMessage message="No accounts found." /> : users.data.map((account) => <DataRow key={account.id} label={account.name || account.email} value={account.role ?? 'Unassigned'} detail={account.email} />)}
    </Card>
    <Card title="Recent audit events">
      {logs.isLoading ? <StateMessage message="Loading audit events…" loading /> : logs.isError ? <><StateMessage message={`Could not load audit events: ${logs.error.message}`} /><Button label="Retry events" secondary onPress={() => void logs.refetch()} /></> : !logs.data?.length ? <StateMessage message="No audit events found." /> : logs.data.slice(0, 20).map((log) => <View key={log.id} style={{ gap: 4, paddingVertical: 8 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{log.action} · {log.user}</Text><Text style={{ color: colors.muted }}>{formatManilaDateTime(log.timestamp)} PHT · {log.detail}</Text></View>)}
    </Card>
  </Page>;
}

export function SettingsScreen({ navigation }: Props<'Settings'>) {
  const { colors } = useTheme();
  const { user, signOut } = useSession();
  const { tankId } = useTankSelection();
  return <Page>
    <Title detail={`${user?.name ?? 'User'} · ${user?.role ?? ''}`}>Settings</Title>
    <TankPicker />
    <Card title="Appearance">
      <Button label="Choose theme" secondary onPress={() => navigation.getParent()?.navigate('Appearance')} />
    </Card>
    <Button label="Sign out" secondary onPress={() => void signOut().catch((error: unknown) => Alert.alert('Sign-out cleanup issue', error instanceof Error ? error.message : 'Some local data could not be cleared.'))} />
    <Text style={{ color: colors.muted, fontSize: 12 }}>Mode: {DATA_MODE} · Tank: {tankId}</Text>
  </Page>;
}

const themeOptions: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Match your device setting' },
  { value: 'light', label: 'Light', hint: 'Light background' },
  { value: 'dark', label: 'Dark', hint: 'Dark background, easier to read at night' },
];

export function AppearanceScreen() {
  const { choice, setChoice, colors, error } = useTheme();
  return <Page>
    <Title detail="Set appearance preferences">Appearance</Title>
    <Card title="Theme">
      {themeOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: choice === option.value }} onPress={() => void setChoice(option.value)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: choice === option.value ? colors.selected : colors.surface, borderWidth: 1, borderColor: choice === option.value ? colors.teal : colors.border }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: choice === option.value ? colors.teal : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
          {choice === option.value && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal }} />}
        </View>
        <View style={{ flex: 1, gap: uiScale.spacing[1] }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{option.label}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{option.hint}</Text></View>
      </Pressable>)}
      {error && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{error}</Text>}
    </Card>
  </Page>;
}

export function ActivityLogsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const layout = createLogScreenStyles(colors);
  const record = createRecordStyles(colors);
  const { tankId } = useTankSelection();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const tanks = useTankSelection();
  const canExport = canAccess(user?.role ?? null, 'canExport');
  const logs = useQuery({ queryKey: ['activity-logs'], queryFn: () => api.listActivityLogs() });
  const [modalKind, setModalKind] = useState<'OPERATION' | 'ENVIRONMENT' | null>(null);
  const [scope, setScope] = useState(tankId);
  const [activityType, setActivityType] = useState<string>(ACTIVITY_OPERATION_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [waterChangePercent, setWaterChangePercent] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [impact, setImpact] = useState('Moderate');
  const [kindFilter, setKindFilter] = useState<ActivityLogKind | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [formError, setFormError] = useState('');
  const createLog = useMutation({
    mutationFn: (entry: Omit<ActivityLog, 'id' | 'occurredAt'>) => api.createActivityLog(entry),
    onSuccess: async () => {
      setModalKind(null);
      setNotes('');
      setWaterChangePercent('');
      setWaterSource('');
      setImpact('Moderate');
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
      if (scope !== 'hatchery') {
        await queryClient.invalidateQueries({ queryKey: ['advisories', scope] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['advisories'] });
      }
    },
  });
  const filteredLogs = (logs.data ?? [])
    .filter((log) => kindFilter === 'all' || log.kind === kindFilter)
    .filter((log) => {
      const date = log.occurredAt.substring(0, 10);
      return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const tankNames = new Map((tanks.tanks ?? []).map((tank) => [tank.id, tank.name]));
  function openLog(kind: 'OPERATION' | 'ENVIRONMENT') {
    setModalKind(kind);
    setScope(kind === 'ENVIRONMENT' ? 'hatchery' : tankId);
    setActivityType(kind === 'OPERATION' ? ACTIVITY_OPERATION_TYPES[0] : ACTIVITY_EVENT_TYPES[0]);
    setNotes('');
    setWaterChangePercent('');
    setWaterSource('');
    setImpact('Moderate');
    setFormError('');
  }
  function submitLog() {
    if (!modalKind) return;
    const rawPercent = waterChangePercent.trim();
    const parsedPercent = rawPercent ? Number(rawPercent) : undefined;
    const entry: Omit<ActivityLog, 'id' | 'occurredAt'> = {
      tankId: scope,
      kind: modalKind,
      type: activityType,
      operator: user?.name ?? 'Mobile user',
      notes: notes.trim(),
      ...(modalKind === 'OPERATION' && activityType === 'Water change / exchange' ? {
        waterChangePercent: parsedPercent ?? Number.NaN,
        ...(waterSource.trim() ? { waterSource: waterSource.trim() } : {}),
      } : {}),
      ...(modalKind === 'ENVIRONMENT' ? { impact } : {}),
    };
    const issues = validateActivityLog(entry);
    if (issues.length) {
      setFormError(issues[0].message);
      return;
    }
    setFormError('');
    createLog.mutate(entry);
  }
  return <Page bottomPadding={tabBarHeight + uiScale.spacing[4]}>
    <Title detail="Log operations and environmental events">Activity logs</Title>
    <TankPicker horizontal />
    <View style={[layout.actions, width < 360 && layout.stackedActions]}>
      <Button style={layout.actionButton} label="Log operation" onPress={() => openLog('OPERATION')} />
      <Button style={layout.actionButton} label="Log weather / event" onPress={() => openLog('ENVIRONMENT')} />
    </View>
    <View style={layout.cards}>
      <Card title="Filters">
        <View style={layout.filters}>
          <View style={layout.filters}>
            <Text style={layout.label}>Kind</Text>
            <View accessibilityRole="radiogroup" style={layout.options}>
              {([{ value: 'all', label: 'All kinds' }, { value: 'OPERATION', label: 'Operation' }, { value: 'ENVIRONMENT', label: 'Environment' }, { value: 'ALERT RESOLUTION', label: 'Alert resolution' }] as const).map((option) => <Chip key={option.value} label={option.label} selected={kindFilter === option.value} onPress={() => setKindFilter(option.value)} />)}
            </View>
          </View>
          <View style={layout.dates}>
            <FilterField label="From date (PHT)" value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" />
            <FilterField label="To date (PHT)" value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" />
          </View>
        </View>
      </Card>
      <Card title="Activity records">
        {logs.isLoading ? <StateMessage message="Loading activity logs…" loading /> : logs.isError ? <><StateMessage message="Could not load activity logs." /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></> : filteredLogs.length === 0 ? <StateMessage message="No activity logs match the selected filters." spacious /> : <View>{filteredLogs.slice(0, 20).map((log) => <View key={log.id} style={record.row}>
          <View style={record.top}>
            <Text style={record.caption}>{formatManilaDateTime(log.occurredAt)} PHT</Text>
            <Chip label={log.kind.charAt(0).toUpperCase() + log.kind.slice(1).toLowerCase()} />
          </View>
          <Text style={record.title}>{log.type}</Text>
          <Text style={record.caption}>{log.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(log.tankId) ?? log.tankId} · {log.operator}</Text>
          <Text style={record.body} numberOfLines={3}>{log.notes}</Text>
        </View>)}</View>}
      </Card>
    </View>
    {modalKind && (
      <Portal>
        <View style={layout.modalOverlay}>
          <ScrollView style={layout.modalScroll} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={layout.modalTitle}>{modalKind === 'OPERATION' ? 'Log operation' : 'Log weather / event'}</Text>
            <TextInput placeholder="Tank or scope" style={layout.modalInput} placeholderTextColor={colors.muted} value={scope} onChangeText={setScope} />
            <TextInput placeholder="Type" style={layout.modalInput} placeholderTextColor={colors.muted} value={activityType} onChangeText={setActivityType} />
            <TextInput placeholder="Notes" style={[layout.modalInput, layout.modalNotes]} placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes} multiline />
            {formError ? <Text style={layout.modalError}>{formError}</Text> : null}
            <View style={[layout.actions, width < 360 && layout.stackedActions]}>
              <Button style={layout.actionButton} label="Cancel" secondary onPress={() => setModalKind(null)} />
              <Button style={layout.actionButton} label="Submit" disabled={createLog.isPending} onPress={submitLog} />
            </View>
          </Card>
          </ScrollView>
        </View>
      </Portal>
    )}
  </Page>;
}

export function CalibrationAndMaintenanceScreen() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canCalibrate = canAccess(user?.role ?? null, 'canCalibrate');
  const canEditThresholds = canAccess(user?.role ?? null, 'canEditThresholds');
  const [parameter, setParameter] = useState<CalibrationLog['parameter']>('ph');
  const [standard, setStandard] = useState('pH 7.00 buffer');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [date, setDate] = useState(getManilaDateString());
  const [nextDue, setNextDue] = useState(getManilaDateString(new Date(Date.now() + 30 * 86_400_000)));
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [rules, setRules] = useState<AdvisoryRuleSettings>(DEFAULT_ADVISORY_RULES);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const calibrationQuery = useQuery({ queryKey: ['calibrations', tankId], queryFn: () => api.listCalibrationLogs(tankId), enabled: Boolean(tankId) && canCalibrate });
  const thresholdsQuery = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const rulesQuery = useQuery({ queryKey: ['advisory-rules'], queryFn: () => api.getAdvisorySettings() });
  useEffect(() => { if (thresholdsQuery.data) setThresholds(thresholdsQuery.data); }, [thresholdsQuery.data]);
  useEffect(() => { if (rulesQuery.data) setRules(rulesQuery.data); }, [rulesQuery.data]);
  const calibrationMutation = useMutation({
    mutationFn: () => api.createCalibrationLog({
      tankId,
      parameter,
      standard: standard.trim(),
      before: Number(before),
      after: Number(after),
      date: new Date(`${date}T12:00:00+08:00`).toISOString(),
      user: user?.name ?? 'Mobile user',
      nextDue: new Date(`${nextDue}T12:00:00+08:00`).toISOString(),
    }),
    onSuccess: async () => {
      setBefore('');
      setAfter('');
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['calibrations'] });
    },
  });
  const thresholdMutation = useMutation({
    mutationFn: async () => {
      const mapped = Object.fromEntries(['temperature', 'do', 'ph'].map((parameter) => {
        const item = thresholds.find((threshold) => threshold.parameter === parameter as MeasuredParameter);
        return [parameter, { min: item?.min, max: item?.max }];
      })) as Record<MeasuredParameter, { min?: number; max?: number }>;
      const errors = [...validateThresholds(mapped), ...validateAdvisoryRules(rules)];
      if (errors.length) throw new Error(errors[0].message);
      const [savedThresholds, savedRules] = await Promise.all([
        api.updateThresholds(thresholds, user?.name ?? 'Mobile user'),
        api.updateAdvisorySettings(rules, user?.name ?? 'Mobile user'),
      ]);
      return { savedThresholds, savedRules };
    },
    onSuccess: async () => {
      setConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      await queryClient.invalidateQueries({ queryKey: ['advisory-rules'] });
    },
  });
  function submitCalibration() {
    if (!tankId || !standard.trim() || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) ||
        !before || !after || !date || !nextDue || new Date(`${nextDue}T00:00:00`) <= new Date(`${date}T00:00:00`)) {
      setError('Enter a calibration standard, valid before/after readings, and a due date after the calibration date.');
      return;
    }
    setError('');
    calibrationMutation.mutate();
  }
  function updateThreshold(parameter: MeasuredParameter, key: 'min' | 'max', value: string) {
    if (canEditThresholds) {
      setThresholds((current) => {
        const existing = current.find((item) => item.parameter === parameter) ?? { parameter };
        const number = value === '' ? undefined : Number(value);
        const updated = { ...existing, [key]: number };
        return [...current.filter((item) => item.parameter !== parameter), updated];
      });
    }
  }
  return <Page>
    <Title detail="Calibration logs and measurement thresholds">Calibration & maintenance</Title>
    <TankPicker />
    {canCalibrate && (
      <Card title="Log calibration">
        <View style={{ flexDirection: 'row', gap: 8 }}><Button label="pH" secondary={parameter !== 'ph'} onPress={() => setParameter('ph')} /><Button label="Dissolved oxygen" secondary={parameter !== 'do'} onPress={() => setParameter('do')} /></View>
        <Field label="Calibration standard" value={standard} onChangeText={setStandard} />
        <Field label="Before" value={before} onChangeText={setBefore} keyboardType="numeric" />
        <Field label="After" value={after} onChangeText={setAfter} keyboardType="numeric" />
        <Field label="Calibration date" value={date} onChangeText={setDate} />
        <Field label="Next due" value={nextDue} onChangeText={setNextDue} />
        {error && <Text style={{ color: colors.critical }}>{error}</Text>}
        <Button label="Save calibration log" disabled={calibrationMutation.isPending} onPress={submitCalibration} />
        {calibrationMutation.isError && <Text style={{ color: colors.critical }}>{calibrationMutation.error.message}</Text>}
      </Card>
    )}
    {canCalibrate && (
      <Card title="Calibration due dates">
        {calibrationQuery.isLoading ? <StateMessage message="Loading calibrations…" loading /> : calibrationQuery.isError ? <><StateMessage message="Could not load calibrations." /><Button label="Retry" secondary onPress={() => void calibrationQuery.refetch()} /></> : !calibrationQuery.data?.length ? <StateMessage message="No calibration records." /> : calibrationQuery.data.map((log) => {
          const overdue = new Date(log.nextDue) < new Date();
          return <View key={log.id} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: overdue ? colors.critical : colors.ink, fontWeight: '700' }}>{log.parameter.toUpperCase()} · {formatManilaDateTime(log.nextDue)} {overdue ? '· OVERDUE' : ''}</Text>
            <Text style={{ color: colors.muted }}>{log.standard} · Before: {log.before}, After: {log.after}</Text>
          </View>;
        })}
      </Card>
    )}
    <Card title="Measurement thresholds">
      {thresholdsQuery.isLoading ? <StateMessage message="Loading thresholds…" loading /> : thresholdsQuery.isError ? <><StateMessage message="Could not load thresholds." /><Button label="Retry" secondary onPress={() => void thresholdsQuery.refetch()} /></> : (['temperature', 'do', 'ph'] as const).map((param) => {
        const item = thresholds.find((threshold) => threshold.parameter === param);
        return <View key={param} style={{ gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>{param === 'do' ? 'Dissolved oxygen (mg/L)' : param === 'temperature' ? 'Temperature (°C)' : 'pH'}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontSize: 12 }}>Minimum</Text><Text style={{ color: colors.ink }}>{item?.min ?? 'Not set'}</Text></View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontSize: 12 }}>Maximum</Text><Text style={{ color: colors.ink }}>{item?.max ?? 'Not set'}</Text></View>
          </View>
          {canEditThresholds && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholder="Min" keyboardType="numeric" value={item?.min === undefined ? '' : String(item.min)} onChangeText={(value) => updateThreshold(param, 'min', value)} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.ink }} placeholderTextColor={colors.muted} />
              <TextInput placeholder="Max" keyboardType="numeric" value={item?.max === undefined ? '' : String(item.max)} onChangeText={(value) => updateThreshold(param, 'max', value)} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.ink }} placeholderTextColor={colors.muted} />
            </View>
          )}
        </View>;
      })}
    </Card>
    {canEditThresholds && (
      <Button label="Review and save thresholds" onPress={() => setConfirm(true)} />
    )}
    {confirm && (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
        <View style={{ width: '90%' }}>
          <Card>
            <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Confirm rule changes</Text>
            <Text style={{ color: colors.muted, marginBottom: 16 }}>These thresholds change how measured data is labeled and alerts are evaluated. No equipment will be controlled.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Cancel" secondary onPress={() => setConfirm(false)} />
              <Button label="Confirm changes" disabled={thresholdMutation.isPending} onPress={() => thresholdMutation.mutate()} />
            </View>
          </Card>
        </View>
      </View>
    )}
  </Page>;
}

function ManualEntryCard() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [salinity, setSalinity] = useState('');
  const [ammonia, setAmmonia] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const values = {
        ...(salinity.trim() ? { salinity: Number(salinity) } : {}),
        ...(ammonia.trim() ? { ammonia: Number(ammonia) } : {}),
        method: 'Field test kit / refractometer',
      };
      const entry: Omit<ActivityLog, 'id' | 'occurredAt'> = {
        tankId,
        kind: 'OPERATION',
        type: ACTIVITY_OPERATION_TYPES[1],
        operator: user?.name ?? 'Mobile operator',
        notes: notes.trim(),
        manualReadings: values,
      };
      const issues = validateActivityLog(entry);
      if (!tankId || issues.length) throw new Error(issues[0]?.message ?? 'Select a tank first.');
      if (salinity && (!Number.isFinite(Number(salinity)) || Number(salinity) < 0 || Number(salinity) > 100)) throw new Error('Salinity must be between 0 and 100 ppt.');
      if (ammonia && (!Number.isFinite(Number(ammonia)) || Number(ammonia) < 0 || Number(ammonia) > 100)) throw new Error('Ammonia must be between 0 and 100.');
      return api.createActivityLog(entry);
    },
    onSuccess: async () => {
      setSalinity(''); setAmmonia(''); setNotes('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-logs'] }),
        queryClient.invalidateQueries({ queryKey: ['advisories', tankId] }),
      ]);
      Alert.alert('Manual readings saved', 'The field readings are available in the activity log.');
    },
  });
  return <Card title="Field water-quality entry">
    <Field label="Salinity (ppt)" value={salinity} onChangeText={setSalinity} keyboardType="numeric" placeholder="Optional" />
    <Field label="Ammonia (mg/L)" value={ammonia} onChangeText={setAmmonia} keyboardType="numeric" placeholder="Optional" />
    <Field label="Notes (required)" value={notes} onChangeText={setNotes} placeholder="At least 4 characters" />
    <Button label="Save field readings" disabled={mutation.isPending} onPress={() => mutation.mutate()} />
    {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
  </Card>;
}

export function HistoryScreen() {
  const { colors } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const layout = createLogScreenStyles(colors);
  const record = createRecordStyles(colors);
  const { tankId } = useTankSelection();
  const [parameter, setParameter] = useState<'all' | 'temperature' | 'do' | 'ph'>('all');
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const query = useQuery({
    queryKey: ['history', tankId, from, to, parameter],
    queryFn: () => api.listReadings({
      tankId,
      from: `${from}T00:00:00+08:00`,
      to: `${to}T23:59:59+08:00`,
      ...(parameter !== 'all' && { parameter }),
    }),
    enabled: Boolean(tankId),
  });
  const parameterValue = (reading: Reading, param: 'do' | 'temperature' | 'ph') => param === 'do' ? reading.doMgL : reading[param];
  const rows = (query.data ?? []).filter((row) => parameter === 'all' || Number.isFinite(parameterValue(row, parameter)));
  return <Page bottomPadding={tabBarHeight + uiScale.spacing[4]}>
    <Title detail="View readings in date range">History</Title>
    <TankPicker horizontal />
    <View style={layout.cards}>
      <Card title="Filters">
        <View style={layout.filters}>
          <View style={layout.dates}>
            <FilterField label="From date (PHT)" value={from} onChangeText={setFrom} placeholder={from} />
            <FilterField label="To date (PHT)" value={to} onChangeText={setTo} placeholder={to} />
          </View>
          <View style={layout.filters}>
            <Text style={layout.label}>Parameter</Text>
            <View accessibilityRole="radiogroup" style={layout.options}>
              {([{ value: 'all', label: 'All measured' }, { value: 'temperature', label: 'Temperature' }, { value: 'do', label: 'Dissolved oxygen' }, { value: 'ph', label: 'pH' }] as const).map((option) => <Chip key={option.value} label={option.label} selected={parameter === option.value} onPress={() => setParameter(option.value)} />)}
            </View>
          </View>
        </View>
      </Card>
      <Card title="Readings">
        {query.isLoading ? <StateMessage message="Loading readings…" loading /> : query.isError ? <><StateMessage message="Could not load readings." /><Button label="Retry" secondary onPress={() => void query.refetch()} /></> : <>
          <Text style={layout.count}>{rows.length} readings{rows.length > 50 ? ' · Showing 50' : ''}</Text>
          {rows.length === 0 ? <StateMessage message="No readings match the selected filters." spacious /> : <View>{rows.slice(0, 50).map((row) => <View key={row.id} style={record.row}>
            <Text style={record.title}>{formatManilaDateTime(row.timestamp)} PHT</Text>
            <View style={record.metrics}>
              {([{ label: 'Temp (°C)', value: row.temperature }, { label: 'DO (mg/L)', value: row.doMgL }, { label: 'pH', value: row.ph }]).map((metric) => <View key={metric.label} style={record.metric}>
                <Text style={record.caption}>{metric.label}</Text>
                <Text style={record.value}>{Number.isFinite(metric.value) ? metric.value.toFixed(2) : '—'}</Text>
              </View>)}
            </View>
          </View>)}</View>}
        </>}
      </Card>
    </View>
  </Page>;
}

export function ReportsScreen() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const { user } = useSession();
  const canExport = canAccess(user?.role ?? null, 'canExport');
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const [preview, setPreview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const readings = useQuery({ queryKey: ['report-data-readings', tankId], queryFn: () => api.listReadings({ tankId, from: `${from}T00:00:00+08:00`, to: `${to}T23:59:59+08:00` }), enabled: Boolean(tankId) });
  const alerts = useQuery({ queryKey: ['report-data-alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const csv = useMemo(() => {
    const header = ['Timestamp (ISO)', 'Tank', 'Temperature °C', 'DO mg/L', 'pH'];
    const rows = (readings.data ?? []).map((row) => [row.timestamp, row.tankId, row.temperature, row.doMgL, row.ph]);
    return toCsv([header, ...rows]);
  }, [readings.data]);
  async function shareCsv() {
    setSharing(true);
    try {
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available.');
      const fileUri = `${FileSystem.documentDirectory}hydrosense-report-${from}-${to}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share Report' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share file.');
    } finally {
      setSharing(false);
    }
  }
  return <Page>
    <Title detail="Build and preview reports">Reports</Title>
    <TankPicker />
    <Card title="Report options">
      <View style={{ gap: 8 }}>
        <View><Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>From date (PHT)</Text><TextInput style={{ color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }} placeholder={from} value={from} onChangeText={setFrom} placeholderTextColor={colors.muted} /></View>
        <View><Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>To date (PHT)</Text><TextInput style={{ color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }} placeholder={to} value={to} onChangeText={setTo} placeholderTextColor={colors.muted} /></View>
      </View>
    </Card>
    <Card title="Report preview">
      {readings.isLoading || alerts.isLoading ? <StateMessage message="Preparing report…" loading /> : readings.isError || alerts.isError ? <StateMessage message="Could not load report data." /> : (
        <>
          <DataRow label="Tank" value={tankId} />
          <DataRow label="Date range" value={`${from} to ${to}`} />
          <DataRow label="Readings" value={`${readings.data?.length ?? 0}`} />
          <DataRow label="Alerts" value={`${alerts.data?.length ?? 0}`} />
          {canExport && <Button label={sharing ? 'Preparing export…' : 'Share readings CSV'} disabled={sharing || !readings.data?.length} onPress={() => void shareCsv()} />}
        </>
      )}
    </Card>
  </Page>;
}

export function ConnectionNotice({ online }: { online: boolean }) {
  const { colors } = useTheme();
  if (online) return null;
  return <View style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 100, backgroundColor: colors.offline, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.warning, fontWeight: '800' }}>Offline · showing cached data when available</Text></View>;
}
