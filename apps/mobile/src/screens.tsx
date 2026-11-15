import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Database, Droplets, FileText, FlaskConical, Settings, Wifi } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { fromByteArray } from 'base64-js';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ACTIVITY_OPERATION_TYPES,
  buildReport,
  calculateParameterStatistics,
  can,
  formatManilaDateTime,
  formatParameter,
  getManilaDateString,
  getParameterStatus,
  getReadingStatuses,
  getRaisingDay,
  isValidMeasurement,
  readingAge,
  readingFreshness,
  resolveAlertWithActivityLog,
  safeRangeGauge,
  DEFAULT_THRESHOLDS,
  validateAcknowledgeNote,
  validateActivityLog,
  validateThresholds,
} from '@hydrosense/shared';
import type { ActivityLog, AlertItem, MeasuredParameter, Reading, ReportSection, Role, Threshold } from '@hydrosense/shared';
import type { MainTabParamList, RootStackParamList } from './navigation';
import { DATA_MODE, api, listPendingAccounts, reviewPendingAccount } from './services/client';
import { canAccess } from './access';
import { useSession, useTankSelection } from './state';
import { Button, Card, createFormStyles, DataRow, Page, StateMessage, Title } from './components/ui';
import { uiScale, useTheme } from './theme';
import type { ThemeChoice } from './theme';
import { createReportFile } from './services/reportFiles';
import { TrendChart } from './components/TrendChart';
import { canShowPlannedFeature, mobileFeatureFlags } from './features';

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

function TankPicker() {
  const { colors } = useTheme();
  const { tanks, tankId, setTankId, isLoading, error, refetch } = useTankSelection();
  if (isLoading) return <StateMessage message="Loading tanks…" loading />;
  if (error) return <Card><StateMessage message={`Could not load tanks: ${error.message}`} /><Button label="Retry tank list" onPress={refetch} secondary /></Card>;
  if (tanks.length === 0) return <StateMessage message="No tanks are available for this account." />;
  return <View accessibilityLabel="Select tank" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>{tanks.map((tank) => <Pressable accessibilityRole="button" accessibilityState={{ selected: tank.id === tankId }} key={tank.id} onPress={() => setTankId(tank.id)} style={{ minHeight: 48, justifyContent: 'center', borderRadius: uiScale.radius.pill, borderWidth: 1, borderColor: tank.id === tankId ? colors.teal : colors.border, paddingVertical: uiScale.spacing[2], paddingHorizontal: uiScale.spacing[4], backgroundColor: tank.id === tankId ? colors.selected : colors.surface }}><Text style={{ color: tank.id === tankId ? colors.teal : colors.ink, fontWeight: '700', fontSize: uiScale.type.body }}>{tank.name}</Text></Pressable>)}</View>;
}

function ReadingCard({ parameter, reading, threshold, stale }: { parameter: MeasuredParameter; reading: Reading; threshold?: Threshold; stale: boolean }) {
  const { colors } = useTheme();
  const value = parameter === 'do' ? reading.doMgL : reading[parameter];
  const status = getParameterStatus(parameter, value, threshold);
  const label = parameter === 'temperature' ? 'Temperature' : parameter === 'do' ? 'Dissolved oxygen' : 'pH';
  const unit = parameter === 'temperature' ? '°C' : parameter === 'do' ? 'mg/L' : 'pH';
  const configuredThreshold = threshold ?? DEFAULT_THRESHOLDS.find((item) => item.parameter === parameter);
  const min = configuredThreshold?.min;
  const max = configuredThreshold?.max;
  const safe = min !== undefined && max !== undefined ? `${min}–${max} ${unit}` : min !== undefined ? `≥${min} ${unit}` : max !== undefined ? `≤${max} ${unit}` : 'Not configured';
  const valid = isValidMeasurement(parameter, value);
  const gauge = valid && configuredThreshold ? safeRangeGauge(value, configuredThreshold) : null;
  const statusColor = stale ? colors.muted : !valid ? colors.warning : status.level === 'normal' ? colors.normal : status.level === 'warning' ? colors.warning : colors.critical;
  const StatusIcon = stale || !valid ? AlertTriangle : status.level === 'normal' ? CheckCircle2 : status.level === 'warning' ? AlertTriangle : AlertCircle;
  const statusLabel = !valid ? 'Check probe' : stale ? 'Offline' : status.label;
  return <Card>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: uiScale.spacing[2] }}>
      <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: statusColor, borderWidth: 1, borderRadius: uiScale.radius.pill, paddingHorizontal: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] }}>
        <StatusIcon size={16} color={statusColor} />
        <Text style={{ color: statusColor, fontSize: uiScale.type.caption, fontWeight: '700' }}>{statusLabel}</Text>
      </View>
    </View>
    <Text style={{ color: stale ? colors.muted : colors.ink, fontSize: 38, fontWeight: '400', fontVariant: ['tabular-nums'] }}>{valid ? formatParameter(parameter, value) : `— ${unit}`}</Text>
    <Text style={{ color: colors.muted, lineHeight: 20 }}>{!valid ? 'Invalid reading excluded' : stale ? 'Last reading; status unavailable' : status.distance}{'\n'}Safe {safe}</Text>
    {gauge && <View accessibilityRole="image" accessibilityLabel={`${label}, ${formatParameter(parameter, value)}. Safe ${safe}. ${statusLabel}.`} style={{ gap: uiScale.spacing[2], marginTop: uiScale.spacing[1] }}>
      <View style={{ height: 8, borderRadius: 8, marginHorizontal: 7, backgroundColor: colors.border }}>
        <View style={{ position: 'absolute', left: `${gauge.safeStart}%`, width: `${gauge.safeEnd - gauge.safeStart}%`, height: 8, borderRadius: 8, backgroundColor: stale ? colors.muted : colors.normal }} />
        <View style={{ position: 'absolute', left: `${gauge.position}%`, top: -4, marginLeft: -7, height: 16, width: 16, borderRadius: 8, borderWidth: 2, borderColor: stale ? colors.muted : colors.ink, backgroundColor: colors.surface }} />
      </View>
      <View style={{ height: 18, marginHorizontal: 7 }}>
        {min !== undefined && <Text style={{ position: 'absolute', left: `${gauge.safeStart}%`, color: colors.muted, fontSize: 12 }}>{min}</Text>}
        {max !== undefined && <Text style={{ position: 'absolute', left: `${gauge.safeEnd}%`, color: colors.muted, fontSize: 12 }}>{max}</Text>}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Display scale {gauge.scaleMin}–{gauge.scaleMax} {unit}{value < gauge.scaleMin || value > gauge.scaleMax ? ' · marker at scale edge' : ''}</Text>
    </View>}
    <Text style={{ color: colors.muted, fontSize: 12 }}>Updated {formatManilaDateTime(reading.timestamp)} PHT</Text>
  </Card>;
}

export function HomeScreen({ navigation }: Props<'Home'>) {
  const { colors } = useTheme();
  const { user } = useSession();
  const [now, setNow] = useState(Date.now);
  const [networkConnected, setNetworkConnected] = useState<boolean | null>(null);
  const [deviceExpanded, setDeviceExpanded] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => NetInfo.addEventListener((state) => setNetworkConnected(state.isConnected)), []);
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
  const freshness = reading ? readingFreshness(reading.timestamp, networkConnected === false ? false : device?.online, now) : null;
  const openCount = alerts.data?.filter((item) => item.status !== 'resolved').length ?? 0;
  return <Page>
    <View style={{ gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700', letterSpacing: 1 }}>WATER QUALITY MONITORING</Text><Text style={{ color: colors.ink, fontSize: uiScale.type.title, fontWeight: '500' }}>Welcome, {user?.name}.</Text></View>
    <Title detail={tank ? `${tank.name} · ${tank.site} · rearing day ${getRaisingDay(tank.rearingStartDate)}/21` : 'Live water-quality status'}>Live monitor</Title>
    <TankPicker />
    {isLoading || thresholds.isLoading ? <StateMessage message="Loading latest readings and thresholds…" loading /> : isError || thresholds.isError ? <Card><StateMessage message={`Could not load readings or thresholds: ${(thresholds.error ?? null)?.message ?? 'Check your connection.'}`} /><Button label="Retry" onPress={() => { void refetch(); void thresholds.refetch(); }} secondary /></Card> : reading && statuses ? <>
      {freshness?.stale && <Card><Text style={{ color: colors.muted }}>Offline, last reading {readingAge(freshness.ageMs)}.</Text></Card>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>
        {(['temperature', 'do', 'ph'] as const).map((parameter) => <View key={parameter} style={{ width: width >= 950 ? '32%' : width >= 600 ? '48%' : '100%' }}><ReadingCard parameter={parameter} reading={reading} threshold={thresholds.data?.find((item) => item.parameter === parameter)} stale={freshness?.stale ?? false} /></View>)}
      </View>
      <Card title="Water-quality advisories">
        <Text style={{ color: colors.muted, lineHeight: 20 }}>Salinity and ammonia are not measured by the sensors. These rule-based advisories are not readings.</Text>
        {advisories.isLoading ? <StateMessage message="Loading advisories…" loading /> : advisories.isError ? <StateMessage message="Could not load advisories." /> : (advisories.data ?? []).length === 0 ? <StateMessage message="No advisories are available for this tank." /> : advisories.data?.map((item) => <DataRow key={item.kind} label={`${item.kind === 'salinity' ? 'Salinity' : 'Ammonia'} risk`} value={item.level.toUpperCase()} detail={item.firedRule} />)}
      </Card>
      <Card title="Last update"><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatManilaDateTime(reading.timestamp)} PHT</Text><Text style={{ color: colors.muted }}>Readings are sampled every 3 hours.</Text></Card>
      <Card title="Device connection">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: deviceExpanded }} onPress={() => setDeviceExpanded((current) => !current)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.teal }}>{deviceExpanded ? 'Hide device details' : 'Show device details'}</Text></Pressable>
        {deviceExpanded && (devices.isLoading ? <StateMessage message="Loading device status…" loading /> : devices.isError ? <StateMessage message={`Could not load device status: ${devices.error.message}`} /> : !device ? <StateMessage message="No device is registered for this tank." /> : <>
          <DataRow label="Connection" value={device.online ? 'Online' : 'Offline'} />
          <DataRow label="Battery" value={device.batteryPct > 0 ? `${device.batteryPct}%` : 'Unavailable'} detail={`Power source: ${device.powerSource}`} />
          {device.invalidParameters && device.invalidParameters.length > 0 && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Check probe: {device.invalidParameters.join(', ')}{device.probeCheckedAt ? ` · ${formatManilaDateTime(device.probeCheckedAt)} PHT` : ''}</Text>}
          {alerts.isError ? <StateMessage message="Could not load alerts." /> : <DataRow label="Active alerts" value={alerts.isLoading ? 'Loading…' : `${openCount}`} />}
        </>)}
        <Button label="Calibration helper" secondary onPress={() => navigation.getParent()?.navigate('Calibration')} />
      </Card>
    </> : <StateMessage message="No reading is available for this tank." />}
    <Button label="Record manual water test" onPress={() => navigation.getParent()?.navigate('FieldEntry')} secondary />
  </Page>;
}

function TankSummaryCard({ tank, onOpen, onRemove }: { tank: { id: string; name: string; deviceId: string; rearingStartDate: string }; onOpen: () => void; onRemove?: () => void }) {
  const { colors } = useTheme();
  const reading = useQuery({ queryKey: ['latest-reading', tank.id], queryFn: () => api.getLatestReading(tank.id) });
  const statuses = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const advisories = useQuery({ queryKey: ['advisories', tank.id], queryFn: () => api.listAdvisories(tank.id) });
  const device = statuses.data?.find((item) => item.deviceId === tank.deviceId);
  const day = getRaisingDay(tank.rearingStartDate);
  const freshness = reading.data ? readingFreshness(reading.data.timestamp, device?.online) : null;
  return <Card title={tank.name}>
    <Text style={{ color: colors.muted }}>{tank.deviceId} · Rearing day {day} of 21</Text>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 21, now: day }} style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}><View style={{ width: `${day / 21 * 100}%`, height: 6, backgroundColor: colors.teal, borderRadius: 3 }} /></View>
    {statuses.isLoading ? <StateMessage message="Loading connection…" loading /> : statuses.isError ? <StateMessage message={`Could not load connection: ${statuses.error.message}`} /> : <Text style={{ color: colors.ink }}>{device ? device.online ? 'Online' : 'Offline' : 'No device status'}</Text>}
    {reading.isLoading ? <StateMessage message="Loading readings…" loading /> : reading.isError ? <StateMessage message={`Could not load readings: ${reading.error.message}`} /> : reading.data ? <Text style={{ color: colors.ink }}>{(['temperature', 'do', 'ph'] as const).map((parameter) => {
      const value = parameter === 'do' ? reading.data!.doMgL : reading.data![parameter];
      return isValidMeasurement(parameter, value) ? formatParameter(parameter, value) : `${parameter}: Check probe`;
    }).join(' · ')}</Text> : <StateMessage message="No reading available." />}
    {freshness && <Text style={{ color: colors.muted }}>{freshness.stale ? 'Stale reading' : 'Last reading'} · {readingAge(freshness.ageMs)}</Text>}
    {advisories.isLoading ? <StateMessage message="Loading advisories…" loading /> : advisories.isError ? <Text style={{ color: colors.warning }}>Advisories unavailable: {advisories.error.message}</Text> : advisories.data?.map((item) => <Text key={item.kind} style={{ color: colors.muted }}>{item.kind === 'salinity' ? 'Salinity' : 'Ammonia'} advisory: {item.level.toUpperCase()} · {item.firedRule}</Text>)}
    <Button label="View live" secondary onPress={onOpen} />
    {onRemove && <Button label="Remove tank" secondary onPress={onRemove} />}
  </Card>;
}

export function TanksScreen({ navigation }: Props<'Tanks'>) {
  const { tanks, setTankId, isLoading, error, refetch } = useTankSelection();
  const { user } = useSession();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [site, setSite] = useState('');
  const [rearingStartDate, setRearingStartDate] = useState(() => getManilaDateString());
  const [deviceId, setDeviceId] = useState('');
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tanks'] }),
      queryClient.invalidateQueries({ queryKey: ['device-statuses'] }),
    ]);
  };
  const register = useMutation({
    mutationFn: async () => {
      if (!can(user?.role, 'registerTank')) throw new Error('You do not have permission to register a tank.');
      if (!name.trim() || !site.trim() || !deviceId.trim()) throw new Error('Enter a tank name, hatchery and hardware ID.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rearingStartDate) || !Number.isFinite(Date.parse(`${rearingStartDate}T00:00:00Z`)) || new Date(`${rearingStartDate}T00:00:00Z`).toISOString().slice(0, 10) !== rearingStartDate) throw new Error('Enter a valid rearing start date in YYYY-MM-DD format.');
      return api.createTank({ name: name.trim(), site: site.trim(), rearingStartDate, deviceId: deviceId.trim() }, user?.name ?? '');
    },
    onSuccess: async (tank) => {
      setName(''); setSite(''); setDeviceId(''); setFormOpen(false);
      setTankId(tank.id);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (tankId: string) => {
      if (!can(user?.role, 'removeTank')) throw new Error('You do not have permission to remove a tank.');
      return api.deleteTank(tankId, user?.name ?? '');
    },
    onSuccess: refresh,
  });
  function confirmRemove(tank: { id: string; name: string }) {
    if (tanks.length <= 1) {
      Alert.alert('Cannot remove tank', 'At least one tank must remain registered.');
      return;
    }
    Alert.alert('Remove tank', `Remove ${tank.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(tank.id) },
    ]);
  }
  return <Page>
    <Title detail="Select a tank to view its live readings">Tanks</Title>
    {can(user?.role, 'registerTank') && <Button label="Register tank" onPress={() => { register.reset(); setFormOpen(true); }} />}
    {remove.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>Could not remove tank: {remove.error.message}</Text>}
    {isLoading ? <StateMessage message="Loading tanks…" loading /> : error ? <Card><StateMessage message={`Could not load tanks: ${error.message}`} /><Button label="Retry" secondary onPress={refetch} /></Card> : tanks.length ? tanks.map((tank) => <TankSummaryCard key={tank.id} tank={tank} onOpen={() => { setTankId(tank.id); navigation.navigate('Home'); }} onRemove={can(user?.role, 'removeTank') ? () => confirmRemove(tank) : undefined} />) : <StateMessage message="No tanks are available." />}
    <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
      <Page>
        <Title detail="Link monitoring hardware to a tank">Register tank</Title>
        <Field label="Tank name" value={name} onChangeText={setName} />
        <Field label="Hatchery" value={site} onChangeText={setSite} />
        <Field label="Rearing start date (YYYY-MM-DD)" value={rearingStartDate} onChangeText={setRearingStartDate} />
        <Field label="Hardware ID" value={deviceId} onChangeText={setDeviceId} />
        {register.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{register.error.message}</Text>}
        <Button label={register.isPending ? 'Registering…' : 'Register tank'} disabled={register.isPending} onPress={() => register.mutate()} />
        <Button label="Cancel" secondary onPress={() => setFormOpen(false)} disabled={register.isPending} />
      </Page>
    </Modal>
  </Page>;
}

export function MoreScreen({ navigation }: Props<'More'>) {
  const { user } = useSession();
  const { colors } = useTheme();
  const groups = [
    { title: 'Monitor', items: [
      { label: 'System health', icon: Wifi, open: () => navigation.navigate('Status') },
    ] },
    { title: 'Records and tools', items: [
      { label: 'Historical logs', icon: Database, open: () => navigation.navigate('History') },
      { label: 'Reports', icon: FileText, open: () => navigation.getParent()?.navigate('Export') },
      { label: 'Calibration', icon: FlaskConical, open: () => navigation.getParent()?.navigate('Calibration') },
      { label: 'Activity logs', icon: Activity, open: () => navigation.getParent()?.navigate('ActivityLogs') },
      { label: 'Manual entries', icon: Droplets, open: () => navigation.getParent()?.navigate('FieldEntry') },
      ...(can(user?.role, 'validation') ? [{ label: 'Validation', icon: ClipboardList, open: () => navigation.navigate('Review') }] : []),
    ] },
    { title: 'Settings', items: [
      { label: 'Settings', icon: Settings, open: () => navigation.navigate('Settings') },
      ...(canShowPlannedFeature(user?.role, 'fleet', mobileFeatureFlags.fleet) ? [{ label: 'Fleet view', icon: Wifi, open: () => navigation.getParent()?.navigate('Fleet') }] : []),
      ...(canShowPlannedFeature(user?.role, 'batchTracking', mobileFeatureFlags.batchTracking) ? [{ label: 'Batch tracking', icon: ClipboardList, open: () => navigation.getParent()?.navigate('BatchTracking') }] : []),
    ] },
  ];
  return <Page>
    <Title detail="Records, tools and settings">More</Title>
    {groups.map((group) => <Card key={group.title} title={group.title}>
      {group.items.map((item, index) => <Pressable key={item.label} accessibilityRole="button" onPress={item.open} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected }}><item.icon size={18} color={colors.teal} /></View>
        <Text style={{ flex: 1, color: colors.ink, fontSize: uiScale.type.body, fontWeight: '600' }}>{item.label}</Text>
        <ChevronRight size={18} color={colors.muted} />
      </Pressable>)}
    </Card>)}
  </Page>;
}

export function FleetScreen() {
  return <Page><Title detail="Multi-site monitoring is not yet available.">Fleet view</Title><Card><StateMessage message="Coming soon" /></Card></Page>;
}

export function BatchTrackingScreen() {
  return <Page><Title detail="Batch tracking is not yet available.">Batch tracking</Title><Card><StateMessage message="Coming soon" /></Card></Page>;
}

export function ActivityLogsScreen() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const logs = useQuery({ queryKey: ['activity-logs', tankId], queryFn: () => api.listActivityLogs(tankId), enabled: Boolean(tankId) });
  return <Page>
    <Title detail="Recorded hatchery and tank activity">Activity logs</Title>
    <TankPicker />
    {logs.isLoading ? <StateMessage message="Loading activity logs…" loading /> : logs.isError ? <Card><StateMessage message={`Could not load activity logs: ${logs.error.message}`} /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></Card> : !logs.data?.length ? <StateMessage message="No activity logs are available." /> : logs.data.map((log) => <Card key={log.id} title={log.type}><Text style={{ color: colors.muted }}>{formatManilaDateTime(log.occurredAt)} PHT · {log.operator}</Text><Text style={{ color: colors.ink }}>{log.notes}</Text></Card>)}
  </Page>;
}

function alertTitle(alert: AlertItem) {
  return `${alert.parameter} · ${alert.severity}`;
}

export function AlertsScreen({ navigation }: Props<'Alerts'>) {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const [status, setStatus] = useState<AlertItem['status']>('open');
  const query = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const rows = [...(query.data ?? [])].filter((alert) => alert.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <Page>
    <Title detail="Review alerts and responses">Alerts</Title>
    <TankPicker />
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['open', 'acknowledged', 'resolved'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: status === value }} onPress={() => setStatus(value)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: status === value ? colors.teal : colors.border, borderRadius: uiScale.radius.pill, backgroundColor: status === value ? colors.selected : colors.surface }}><Text style={{ color: status === value ? colors.teal : colors.ink, fontWeight: '700' }}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}
    </View>
    <Card title="Alert list">
      {query.isLoading ? <StateMessage message="Loading alerts…" loading /> : query.isError ? <StateMessage message="Alert data could not be loaded." /> : rows.length === 0 ? <StateMessage message={`No ${status} alerts are recorded for this tank.`} /> : rows.map((alert) => {
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
      const issues = status === 'resolve' || note.trim() ? validateAcknowledgeNote(note) : [];
      if (issues.length) throw new Error(issues[0].message);
      const input = { note: note.trim(), user: user?.name ?? 'Mobile user' };
      if (status === 'acknowledge') return { alert: await api.acknowledgeAlert(route.params.alertId, input), activityError: null };
      return resolveAlertWithActivityLog(api, route.params.alertId, input);
    },
    onSuccess: async (result) => {
      if (result.activityError) Alert.alert('Alert resolved; activity log not saved', result.activityError);
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-detail', route.params.alertId] }),
        queryClient.invalidateQueries({ queryKey: ['alert-responses', route.params.alertId] }),
        queryClient.invalidateQueries({ queryKey: ['activity-logs'] }),
      ]);
    },
    onError: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['alert-detail', route.params.alertId] }),
        queryClient.invalidateQueries({ queryKey: ['alert-responses', route.params.alertId] }),
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
      {alert.status !== 'resolved' && <Field label={alert.status === 'open' ? 'Acknowledgement note (optional)' : 'Resolution note'} value={note} onChangeText={setNote} placeholder="What did you observe or verify?" />}
      {alert.status === 'open' && <Button label="Acknowledge" disabled={mutation.isPending} onPress={() => mutation.mutate('acknowledge')} secondary />}
      {alert.status === 'acknowledged' && can(user?.role, 'resolveAlert') && <Button label="Resolve alert" disabled={mutation.isPending} onPress={() => mutation.mutate('resolve')} />}
      {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
      <Text style={{ color: colors.ink, fontWeight: '800', marginTop: 8 }}>Response history</Text>
      {responses.isLoading ? <StateMessage message="Loading responses…" loading /> : responses.isError ? <><StateMessage message={`Could not load responses: ${responses.error.message}`} /><Button label="Retry responses" secondary onPress={() => void responses.refetch()} /></> : (responses.data ?? []).length === 0 ? <Text style={{ color: colors.muted }}>No responses recorded.</Text> : responses.data?.map((response) => <Text key={response.id} style={{ color: colors.muted }}>{response.status} · {response.createdBy} · {formatManilaDateTime(response.createdAt)} PHT · {response.note}</Text>)}
    </Card>}
  </Page>;
}

export function TrendsScreen() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const [days, setDays] = useState(1);
  const [expanded, setExpanded] = useState<MeasuredParameter | null>(null);
  const from = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);
  const readings = useQuery({ queryKey: ['mobile-trends', tankId, from], queryFn: () => api.listReadings({ tankId, from }), enabled: Boolean(tankId) });
  const thresholds = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const parameters = [{ key: 'temperature', label: 'Temperature', unit: '°C' }, { key: 'do', label: 'Dissolved oxygen', unit: 'mg/L' }, { key: 'ph', label: 'pH', unit: 'pH' }] as const;
  return <Page>
    <Title detail="Sensor readings · 3-hour sampling">Trends</Title>
    <TankPicker />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[1, 7, 21].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: days === value }} onPress={() => setDays(value)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: uiScale.radius.pill, backgroundColor: days === value ? colors.selected : colors.surface, borderColor: colors.border, borderWidth: 1 }}><Text style={{ color: days === value ? colors.teal : colors.ink }}>{value === 1 ? '24 hours' : `${value} days`}</Text></Pressable>)}</View>
    {readings.isLoading || thresholds.isLoading ? <StateMessage message="Loading trend data…" loading /> : readings.isError || thresholds.isError ? <Card><StateMessage message={`Could not load trends: ${(readings.error ?? thresholds.error)?.message}`} /><Button label="Retry" secondary onPress={() => { void readings.refetch(); void thresholds.refetch(); }} /></Card> : (readings.data?.length ?? 0) >= 500 ? <StateMessage message="The reading limit was reached; trends may be incomplete. Choose a shorter range." /> : parameters.map(({ key, label, unit }) => {
      const stats = calculateParameterStatistics(key, readings.data ?? [], thresholds.data ?? []);
      return <Card key={key} title={`${label} · ${unit}`} action={<Pressable accessibilityRole="button" accessibilityLabel={`Expand ${label} chart`} onPress={() => setExpanded(key)}><Text style={{ color: colors.teal }}>Expand</Text></Pressable>}>
        <TrendChart readings={readings.data ?? []} parameter={key} />
        <Text style={{ color: colors.muted }}>Mean {stats.mean === null ? '—' : stats.mean.toFixed(2)} · In range {stats.percentInRange === null ? '—' : `${stats.percentInRange.toFixed(1)}%`} · {stats.readings} valid</Text>
        {stats.invalidReadings > 0 && <Text style={{ color: colors.warning }}>{stats.invalidReadings} invalid readings excluded. Check probe.</Text>}
        <Text style={{ color: colors.muted }}>Lines break at invalid or missing samples. Times shown in Asia/Manila.</Text>
      </Card>;
    })}
    <Modal visible={expanded !== null} animationType="slide" onRequestClose={() => setExpanded(null)}><Page><Title detail="Times shown in Asia/Manila">{`${parameters.find((item) => item.key === expanded)?.label ?? 'Trend'} trend`}</Title>{expanded && <Card><TrendChart readings={readings.data ?? []} parameter={expanded} expanded /></Card>}<Button label="Close" secondary onPress={() => setExpanded(null)} /></Page></Modal>
  </Page>;
}

export function HistoryScreen() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const readings = useQuery({ queryKey: ['mobile-history', tankId], queryFn: () => api.listReadings({ tankId }), enabled: Boolean(tankId) });
  const rows = [...(readings.data ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);
  return <Page>
    <Title detail="Recent readings · Asia/Manila time">Reading history</Title>
    <TankPicker />
    <Card title="Latest readings">
      {readings.isLoading ? <StateMessage message="Loading history…" loading /> : readings.isError ? <StateMessage message="Could not load reading history." /> : rows.length === 0 ? <StateMessage message="No history is available." /> : rows.map((reading) => <View key={reading.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 3 }}>
        <Text style={{ color: colors.ink, fontWeight: '800' }}>{formatManilaDateTime(reading.timestamp)} PHT</Text>
        <Text style={{ color: colors.muted }}>{isValidMeasurement('temperature', reading.temperature) ? `${reading.temperature.toFixed(1)} °C` : 'Temperature: Check probe'} · {isValidMeasurement('do', reading.doMgL) ? `${reading.doMgL.toFixed(1)} mg/L DO` : 'DO: Check probe'} · {isValidMeasurement('ph', reading.ph) ? `pH ${reading.ph.toFixed(2)}` : 'pH: Check probe'}</Text>
      </View>)}
    </Card>
  </Page>;
}

export function StatusScreen() {
  const { colors } = useTheme();
  const { tanks, isLoading, error, refetch } = useTankSelection();
  const statuses = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const devices = [...(statuses.data ?? [])].sort((a, b) => {
    const nameA = tanks.find((tank) => tank.deviceId === a.deviceId)?.name ?? a.deviceId;
    const nameB = tanks.find((tank) => tank.deviceId === b.deviceId)?.name ?? b.deviceId;
    return nameA.localeCompare(nameB);
  });
  return <Page>
    <Title detail="Sensor and connectivity health">System health</Title>
    {statuses.isLoading || isLoading ? <StateMessage message="Loading device status…" loading /> : statuses.isError || error ? <Card><StateMessage message={`Could not load device status: ${(statuses.error ?? error)?.message}`} /><Button label="Retry" secondary onPress={() => { void statuses.refetch(); refetch(); }} /></Card> : devices.length === 0 ? <StateMessage message="No device status is available." /> : <>
      <Card title="Overview"><DataRow label="Devices" value={`${devices.length}`} /><DataRow label="Online" value={`${devices.filter((device) => device.online).length}`} /><DataRow label="Offline" value={`${devices.filter((device) => !device.online).length}`} /><DataRow label="Pending offline records" value={`${devices.reduce((sum, device) => sum + device.pendingSyncCount, 0)}`} /></Card>
      {devices.map((device) => <Card key={device.deviceId} title={tanks.find((tank) => tank.deviceId === device.deviceId)?.name ?? 'Unassigned device'}>
        <DataRow label="Device" value={device.deviceId} />
        <DataRow label="Connection" value={device.online ? 'Online' : 'Offline'} detail={`Last seen ${formatManilaDateTime(device.lastSeen)} PHT`} />
        <DataRow label="Battery" value={`${device.batteryPct}%`} detail={`Power source: ${device.powerSource}`} />
        <DataRow label="Wi-Fi signal" value={`${device.wifiRssi} dBm`} />
        <DataRow label="Pending offline records" value={`${device.pendingSyncCount}`} />
        {device.invalidParameters && device.invalidParameters.length > 0 && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Check probe: {device.invalidParameters.join(', ')}{device.probeCheckedAt ? ` · ${formatManilaDateTime(device.probeCheckedAt)} PHT` : ''}</Text>}
      </Card>)}
    </>}
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
  const ui = createFormStyles(colors);
  const { user, signOut } = useSession();
  const { tankId } = useTankSelection();
  const thresholdsQuery = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const thresholds = thresholdsQuery.data ?? [];
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Threshold[]>([]);
  const canEdit = canAccess(user?.role ?? null, 'thresholds');
  const mutation = useMutation({
    mutationFn: () => {
      const values: Record<MeasuredParameter, { min?: number; max?: number }> = {
        temperature: {},
        do: {},
        ph: {},
      };
      drafts.forEach((item) => { values[item.parameter] = { min: item.min, max: item.max }; });
      const issues = validateThresholds(values);
      if (issues.length) throw new Error(issues[0].message);
      return api.updateThresholds(drafts, user?.name ?? 'Mobile manager');
    },
    onSuccess: async () => {
      setDrafts([]);
      await queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      Alert.alert('Saved', 'Threshold updates are now active.');
    },
  });
  function updateThreshold(parameter: MeasuredParameter, key: 'min' | 'max', value: string) {
    setDrafts((current) => {
      const source = current.length ? current : thresholds;
      return source.map((item) => item.parameter === parameter ? { ...item, [key]: value === '' ? undefined : Number(value) } : item);
    });
  }
  return <Page>
    <Title detail={`${user?.name ?? 'User'} · ${user?.role ?? ''}`}>Settings</Title>
    <TankPicker />
    <Card title="Appearance">
      <Button label="Choose theme" secondary onPress={() => navigation.getParent()?.navigate('Appearance')} />
    </Card>
    <Card title="Field tools">
      <Button label="Calibration helper" secondary onPress={() => navigation.getParent()?.navigate('Calibration')} />
      <Button label="Manual salinity / ammonia entry" secondary onPress={() => navigation.getParent()?.navigate('FieldEntry')} />
      <Button label="Export report" secondary onPress={() => navigation.getParent()?.navigate('Export')} />
    </Card>
    {canEdit && <Card title="Thresholds">
      {thresholdsQuery.isLoading ? <StateMessage message="Loading thresholds…" loading /> : thresholdsQuery.isError ? <><StateMessage message={`Could not load thresholds: ${thresholdsQuery.error.message}`} /><Button label="Retry thresholds" secondary onPress={() => void thresholdsQuery.refetch()} /></> : <>
      {(['temperature', 'do', 'ph'] as const).map((parameter) => {
        const row = (drafts.length ? drafts : thresholds).find((item) => item.parameter === parameter);
        return <View key={parameter} style={{ gap: 6, marginBottom: 8 }}>
          <Text style={ui.label}>{parameter === 'do' ? 'Dissolved oxygen' : parameter}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[ui.input, { flex: 1 }]} keyboardType="numeric" placeholder="Minimum" placeholderTextColor={colors.muted} value={row?.min === undefined ? '' : String(row.min)} onChangeText={(value) => updateThreshold(parameter, 'min', value)} />
            <TextInput style={[ui.input, { flex: 1 }]} keyboardType="numeric" placeholder="Maximum" placeholderTextColor={colors.muted} value={row?.max === undefined ? '' : String(row.max)} onChangeText={(value) => updateThreshold(parameter, 'max', value)} />
          </View>
        </View>;
      })}
      <Button label="Save thresholds" disabled={mutation.isPending || !drafts.length} onPress={() => mutation.mutate()} />
      {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
      </>}
    </Card>}
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

export function CalibrationScreen() {
  const { colors } = useTheme();
  const { tankId } = useTankSelection();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [parameter, setParameter] = useState<'ph' | 'do'>('ph');
  const [standard, setStandard] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      if (!tankId || !standard.trim() || !before.trim() || !after.trim() || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after))) throw new Error('Choose a tank and enter a standard plus before/after readings.');
      const date = new Date();
      const nextDue = new Date(date.getTime() + 30 * 86_400_000);
      return api.createCalibrationLog({ tankId, parameter, standard: standard.trim(), before: Number(before), after: Number(after), date: date.toISOString(), user: user?.name ?? 'Mobile operator', nextDue: nextDue.toISOString() });
    },
    onSuccess: async () => {
      setStandard(''); setBefore(''); setAfter('');
      await queryClient.invalidateQueries({ queryKey: ['calibrations'] });
      Alert.alert('Calibration saved', 'The calibration record was recorded.');
    },
  });
  return <Page>
    <Title detail="Log pH and dissolved-oxygen checks">Calibration helper</Title>
    <TankPicker />
    <Card title="Calibration record">
      <View style={{ flexDirection: 'row', gap: 8 }}><Button label="pH" secondary={parameter !== 'ph'} onPress={() => setParameter('ph')} /><Button label="Dissolved oxygen" secondary={parameter !== 'do'} onPress={() => setParameter('do')} /></View>
      <Field label="Calibration standard" value={standard} onChangeText={setStandard} placeholder={parameter === 'ph' ? 'pH 7.00 buffer' : 'Zero oxygen / air-saturated standard'} />
      <Field label="Before calibration" value={before} onChangeText={setBefore} keyboardType="numeric" placeholder="Reading before adjustment" />
      <Field label="After calibration" value={after} onChangeText={setAfter} keyboardType="numeric" placeholder="Reading after adjustment" />
      <Button label="Save calibration log" disabled={mutation.isPending} onPress={() => mutation.mutate()} />
      {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
    </Card>
    <ManualEntryCard />
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

export function FieldEntryScreen() {
  return <Page><Title detail="Record manual advisory inputs">Field entry</Title><TankPicker /><ManualEntryCard /></Page>;
}

export function ExportScreen() {
  const { colors } = useTheme();
  const { tankId, tanks, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const { user } = useSession();
  const [selectedTanks, setSelectedTanks] = useState<string[] | null>(null);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const [format, setFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [sections, setSections] = useState<ReportSection[]>(['summary', 'statistics', 'alerts', 'raw-readings']);
  const [sharing, setSharing] = useState(false);
  const selectedIds = selectedTanks ?? (tankId ? [tankId] : []);
  async function shareReport() {
    setSharing(true);
    try {
      if (!user || !can(user.role, 'exportReports')) throw new Error('You do not have permission to export reports.');
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Enter dates in YYYY-MM-DD format.');
      const start = new Date(`${from}T00:00:00+08:00`);
      const end = new Date(`${to}T23:59:59.999+08:00`);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || getManilaDateString(start) !== from || getManilaDateString(end) !== to || start > end) throw new Error('Enter a valid start and end date.');
      if (!selectedIds.length || !sections.length) throw new Error('Select at least one tank and report section.');
      const [tankReadings, tankAlerts, thresholds] = await Promise.all([
        Promise.all(selectedIds.map((id) => api.listReadings({ tankId: id, from: start.toISOString(), to: end.toISOString() }))),
        Promise.all(selectedIds.map((id) => api.listAlerts(id))),
        api.listThresholds(),
      ]);
      if (tankReadings.some((rows) => rows.length >= 500)) throw new Error('The reading limit was reached. Select a shorter date range to avoid an incomplete report.');
      if (tankAlerts.some((rows) => rows.length >= 1000)) throw new Error('The alert limit may have been reached. The report cannot be generated reliably.');
      const report = buildReport({ tankIds: selectedIds, from: start.toISOString(), to: end.toISOString(), sections, format, generatedBy: { name: user.name, role: user.role } }, {
        tanks, readings: tankReadings.flat(), alerts: tankAlerts.flat(), thresholds,
        advisories: {}, activityLogs: [], calibrationLogs: [], validationRows: [], deviceStatuses: [],
      });
      const file = await createReportFile(report);
      const fileUri = `${FileSystem.documentDirectory}hydrosense-report-${Date.now()}.${file.extension}`;
      await FileSystem.writeAsStringAsync(fileUri, fromByteArray(file.bytes), { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, { mimeType: file.mimeType, dialogTitle: 'Share HydroSense report' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'The share sheet could not be opened.');
    } finally {
      setSharing(false);
    }
  }
  return <Page>
    <Title detail="Select tanks, dates, sections and format">Report builder</Title>
    <Card title="Tanks">
      {tanksLoading ? <StateMessage message="Loading tanks…" loading /> : tanksError ? <><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry tank list" secondary onPress={refetchTanks} /></> : tanks.length === 0 ? <StateMessage message="No tanks are available for this account." /> : null}
      {tanks.map((tank) => <Pressable key={tank.id} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.includes(tank.id) }} onPress={() => setSelectedTanks((current) => {
        const existing = current ?? (tankId ? [tankId] : []);
        return existing.includes(tank.id) ? existing.filter((id) => id !== tank.id) : [...existing, tank.id];
      })} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.ink }}>{selectedIds.includes(tank.id) ? '☑' : '☐'} {tank.name}</Text></Pressable>)}
    </Card>
    <Card title="Date range">
      <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
      <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} />
    </Card>
    <Card title="Sections">
      {([['summary', 'Summary'], ['statistics', 'Statistics'], ['alerts', 'Alerts'], ['raw-readings', 'Readings']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: sections.includes(key) }} onPress={() => setSections((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.ink }}>{sections.includes(key) ? '☑' : '☐'} {label}</Text></Pressable>)}
    </Card>
    <Card title="Format">
      {(['pdf', 'csv', 'xlsx'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: format === value }} onPress={() => setFormat(value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.ink }}>{format === value ? '●' : '○'} {value.toUpperCase()}</Text></Pressable>)}
      <Button label={sharing ? 'Preparing report…' : 'Share report'} disabled={sharing} onPress={() => void shareReport()} />
    </Card>
    <Text style={{ color: colors.muted, fontSize: 12 }}>Prepared by {user?.name ?? 'user'}.</Text>
  </Page>;
}

export function ConnectionNotice({ online }: { online: boolean }) {
  const { colors } = useTheme();
  if (online) return null;
  return <View style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 100, backgroundColor: colors.offline, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.warning, fontWeight: '800' }}>Offline · showing cached data when available</Text></View>;
}
