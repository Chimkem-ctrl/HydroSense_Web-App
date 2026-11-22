import { useContext, useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { ViewStyle } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { Dialog, Portal } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertCircle, AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Database, Droplets, Eye, FileDown, FileSpreadsheet, FileText, ListFilter, Maximize2, MessageCircle, MoreHorizontal, Plus, Trash2, UserRound, Waves, Wifi } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { fromByteArray } from 'base64-js';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_OPERATION_TYPES,
  activityHatcheryName,
  activityInHatchery,
  buildReport,
  calculateParameterStatistics,
  can,
  formatManilaDateTime,
  formatParameter,
  getManilaDateString,
  getParameterStatus,
  getReadingStatuses,
  getRaisingDay,
  hatcheryId,
  isValidMeasurement,
  readingAge,
  readingFreshness,
  resolveAlertWithActivityLog,
  safeRangeGauge,
  DEFAULT_THRESHOLDS,
  toCsv,
  validateAcknowledgeNote,
  validateActivityLog,
} from '@hydrosense/shared';
import type { ActivityLog, ActivityLogKind, AlertItem, CalibrationLog, MeasuredParameter, Reading, ReportSection, Threshold } from '@hydrosense/shared';
import type { MainTabParamList, RootStackParamList } from './navigation';
import { api, getConfiguredThreshold, listConfiguredThresholds, listPendingAccounts } from './services/client';
import { canAccess } from './access';
import { useSession, useTankSelection } from './state';
import { Button, CalendarFilterField, Card, Chip, createFormStyles, createRecordStyles, DataRow, FilterField, GlassDialog, Page, RedesignedContext, StateMessage, Title } from './components/ui';
import { AlertFilters } from './components/AlertFilters';
import { HatcheryPicker } from './components/HatcheryPicker';
import { RangeBar } from './components/RangeBar';
import { uiScale, useTheme } from './theme';
import type { Palette, ThemeChoice } from './theme';
import { createReportFile, reportDatasetRows } from './services/reportFiles';
import type { ReportDataset } from './services/reportFiles';
import { getAssignedDevices, hasReportedField, pendingRecordTotal } from './services/deviceTelemetry';
import { TrendChart } from './components/TrendChart';
import { TrendFilters } from './components/TrendFilters';
import { ActivityLogActions } from './components/ActivityLogActions';
import { FilterDropdown } from './components/FilterDropdown';
import { ReportChoice } from './components/ReportChoice';

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
  const redesigned = useContext(RedesignedContext);
  const ui = createFormStyles(colors);
  return <View style={ui.formField}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} style={[ui.input, redesigned && { backgroundColor: colors.glassControl }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} /></View>;
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
  stackedActions: { flexDirection: 'column', alignItems: 'stretch' },
  actionButton: { flex: 1, minHeight: 48 },
  count: { color: colors.muted, fontSize: uiScale.type.caption },
  modalOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: uiScale.spacing[4] },
  modalScroll: { width: '100%', maxHeight: '90%' },
  modalInput: { position: 'relative', zIndex: 1, minHeight: 44, color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, padding: uiScale.spacing[2] },
  modalNotes: { minHeight: 96, textAlignVertical: 'top' },
  modalTitle: { color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700' },
  modalError: { color: colors.critical },
});

function ReadingCard({ parameter, reading, threshold, stale }: { parameter: MeasuredParameter; reading: Reading; threshold: Threshold; stale: boolean }) {
  const { colors } = useTheme();
  const value = parameter === 'do' ? reading.doMgL : reading[parameter];
  const status = getParameterStatus(parameter, value, threshold);
  const label = parameter === 'temperature' ? 'Temperature' : parameter === 'do' ? 'Dissolved oxygen' : 'pH';
  const unit = parameter === 'temperature' ? '°C' : parameter === 'do' ? 'mg/L' : 'pH';
  const configuredThreshold = threshold;
  const min = configuredThreshold?.min;
  const max = configuredThreshold?.max;
  const safe = min !== undefined && max !== undefined ? `${min}–${max} ${unit}` : min !== undefined ? `≥${min} ${unit}` : max !== undefined ? `≤${max} ${unit}` : 'Not configured';
  const valid = isValidMeasurement(parameter, value);
  const gauge = valid && configuredThreshold ? safeRangeGauge(value, configuredThreshold) : null;
  const statusColor = stale ? colors.muted : !valid ? colors.warning : status.level === 'normal' ? colors.normal : status.level === 'warning' ? colors.warning : colors.critical;
  const StatusIcon = stale || !valid ? AlertTriangle : status.level === 'normal' ? CheckCircle2 : status.level === 'warning' ? AlertTriangle : AlertCircle;
  const statusLabel = !valid ? 'Check probe' : stale ? 'Offline' : status.label;
  return <Card toneColor={stale ? undefined : statusColor}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: uiScale.spacing[2] }}>
      <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: statusColor, borderWidth: 1, borderRadius: uiScale.radius.pill, paddingHorizontal: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] }}>
        <StatusIcon size={16} color={statusColor} />
        <Text style={{ color: statusColor, fontSize: uiScale.type.caption, fontWeight: '700' }}>{statusLabel}</Text>
      </View>
    </View>
    <Text style={{ color: stale ? colors.muted : colors.ink, fontSize: 38, fontWeight: '400', fontVariant: ['tabular-nums'] }}>{valid ? formatParameter(parameter, value) : `— ${unit}`}</Text>
    {gauge && <RangeBar gauge={gauge} min={min} max={max} accessibilityLabel={`${label}, ${formatParameter(parameter, value)}. Safe ${safe}. ${statusLabel}.`} />}
    <Text style={{ color: colors.muted, lineHeight: 20 }}>{!valid ? 'Invalid reading excluded' : stale ? 'Last reading; status unavailable' : status.distance}{'\n'}Safe {safe}</Text>
  </Card>;
}

export function HomeScreen() {
  const { colors, mode } = useTheme();
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
  const { tankId, tanks, isLoading: tanksLoading, error: tanksError } = useTankSelection();
  const { data: reading, isLoading, isError, error: readingError, refetch } = useQuery({ queryKey: ['latest-reading', tankId], queryFn: () => api.getLatestReading(tankId), enabled: Boolean(tankId) });
  const thresholds = useQuery({ queryKey: ['configured-thresholds'], queryFn: listConfiguredThresholds });
  const devices = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const alerts = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const tank = tanks.find((item) => item.id === tankId);
  const statuses = reading && thresholds.data ? getReadingStatuses(reading, thresholds.data) : null;
  const device = devices.data?.find((item) => item.deviceId === tank?.deviceId);
  const freshness = reading ? readingFreshness(reading.timestamp, networkConnected === false ? false : device?.online, now) : null;
  const openCount = alerts.data?.filter((item) => item.status !== 'resolved').length ?? 0;
  return <Page>
    <View style={{ gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700', letterSpacing: 1 }}>WATER QUALITY MONITORING</Text><Text style={{ color: colors.ink, fontSize: uiScale.type.title, fontWeight: '500' }}>Welcome, {user?.name}.</Text></View>
    <Title icon={<Activity size={23} color={colors.teal} />} detail={tank ? `${tank.name} · ${tank.site} · rearing day ${getRaisingDay(tank.rearingStartDate)}/21` : 'Live water-quality status'}>Live monitor</Title>
    <TankPicker />
    {tanksLoading || (Boolean(tankId) && isLoading) || (Boolean(tankId) && thresholds.isLoading) ? <StateMessage message="Loading latest readings and thresholds…" loading /> : tanksError ? null : !tankId ? null : isError || thresholds.isError ? <Card><StateMessage message={`Could not load readings or thresholds: ${(readingError ?? thresholds.error)?.message ?? 'Check your connection.'}`} /><Button label="Retry" onPress={() => { void refetch(); void thresholds.refetch(); }} secondary /></Card> : reading && statuses && thresholds.data ? <>
      {freshness?.stale && <View accessibilityLiveRegion="polite" style={{ backgroundColor: mode === 'dark' ? '#3d354d' : '#fff7e6', borderColor: mode === 'dark' ? '#b5a68f' : '#d4bd94', borderWidth: 1, borderRadius: uiScale.radius.control, paddingVertical: uiScale.spacing[3], paddingHorizontal: uiScale.spacing[4] }}>
        <Text style={{ color: colors.ink, lineHeight: 20 }}><Text style={{ color: colors.warning, fontWeight: '700' }}>Offline, last reading {readingAge(freshness.ageMs)}.</Text>{' '}Showing the latest available values.</Text>
      </View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>
        {(['temperature', 'do', 'ph'] as const).map((parameter) => <View key={parameter} style={{ width: width >= 950 ? '32%' : width >= 600 ? '48%' : '100%' }}><ReadingCard parameter={parameter} reading={reading} threshold={getConfiguredThreshold(thresholds.data, parameter)} stale={freshness?.stale ?? false} /></View>)}
      </View>
      <Card title="Last update"><View style={{ gap: uiScale.spacing[1] }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatManilaDateTime(reading.timestamp)} PHT</Text><Text style={{ color: colors.muted }}>Times shown in Asia/Manila.</Text></View></Card>
      <Card title="Device connection">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: deviceExpanded }} onPress={() => setDeviceExpanded((current) => !current)} hitSlop={{ top: 8, bottom: 8 }} style={{ paddingVertical: uiScale.spacing[1] }}><Text style={{ color: colors.teal }}>{deviceExpanded ? 'Hide device details' : 'Show device details'}</Text></Pressable>
        {deviceExpanded && (devices.isLoading ? <StateMessage message="Loading device status…" loading /> : devices.isError ? <StateMessage message={`Could not load device status: ${devices.error.message}`} /> : !device ? <StateMessage message="No device is registered for this tank." /> : <>
          <DataRow label="Connection" value={device.online ? 'Online' : 'Offline'} valueColor={device.online ? colors.normal : colors.critical} />
          {device.invalidParameters && device.invalidParameters.length > 0 && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Check probe: {device.invalidParameters.join(', ')}{device.probeCheckedAt ? ` · ${formatManilaDateTime(device.probeCheckedAt)} PHT` : ''}</Text>}
          {alerts.isError ? <StateMessage message="Could not load alerts." /> : <DataRow label="Active alerts" value={alerts.isLoading ? 'Loading…' : `${openCount}`} />}
        </>)}
      </Card>
    </> : <StateMessage message="No reading is available for this tank." />}
  </Page>;
}

function TankSummaryCard({ tank, onOpen, onRemove, removeDisabled = false }: { tank: { id: string; name: string; deviceId: string; rearingStartDate: string }; onOpen: () => void; onRemove?: () => void; removeDisabled?: boolean }) {
  const { colors } = useTheme();
  const reading = useQuery({ queryKey: ['latest-reading', tank.id], queryFn: () => api.getLatestReading(tank.id) });
  const statuses = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const device = statuses.data?.find((item) => item.deviceId === tank.deviceId);
  const day = getRaisingDay(tank.rearingStartDate);
  const freshness = reading.data ? readingFreshness(reading.data.timestamp, device?.online) : null;
  return <Card title={tank.name} action={!statuses.isLoading && !statuses.isError ? <Text style={{ color: device ? device.online ? colors.normal : colors.critical : colors.muted, fontWeight: '700' }}>{device ? device.online ? 'Online' : 'Offline' : 'No device status'}</Text> : undefined}>
    <Text style={{ color: colors.muted }}>{tank.deviceId} · Rearing day {day} of 21</Text>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 21, now: day }} style={{ height: 6, backgroundColor: colors.border, borderRadius: 3 }}><View style={{ width: `${day / 21 * 100}%`, height: 6, backgroundColor: colors.teal, borderRadius: 3 }} /></View>
    {statuses.isLoading ? <StateMessage message="Loading connection…" loading /> : statuses.isError ? <StateMessage message={`Could not load connection: ${statuses.error.message}`} /> : null}
    {reading.isLoading ? <StateMessage message="Loading readings…" loading /> : reading.isError ? <StateMessage message={`Could not load readings: ${reading.error.message}`} /> : reading.data ? <Text style={{ color: colors.ink }}>{(['temperature', 'do', 'ph'] as const).map((parameter) => {
      const value = parameter === 'do' ? reading.data!.doMgL : reading.data![parameter];
      return isValidMeasurement(parameter, value) ? formatParameter(parameter, value) : `${parameter}: Check probe`;
    }).join(' · ')}</Text> : <StateMessage message="No reading available." />}
    {freshness && <Text style={{ color: colors.muted }}>{freshness.stale ? 'Stale reading' : 'Last reading'} · {readingAge(freshness.ageMs)}</Text>}
    <View style={{ flexDirection: 'row', gap: uiScale.spacing[2] }}>
      <Button label="View live" icon={<Eye size={18} color={colors.teal} />} secondary onPress={onOpen} style={onRemove ? { flex: 1, minWidth: 0 } : undefined} />
      {onRemove && <Button label="Remove tank" icon={<Trash2 size={18} color={colors.critical} />} secondary disabled={removeDisabled} onPress={onRemove} style={{ flex: 1, minWidth: 0 }} />}
    </View>
  </Card>;
}

export function TanksScreen({ navigation }: Props<'Tanks'>) {
  const { tanks, allTanks, setTankId, isLoading, error, refetch } = useTankSelection();
  const { user } = useSession();
  const { colors } = useTheme();
  const canRegisterTank = canAccess(user?.role ?? null, 'registerTank');
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [site, setSite] = useState('');
  const [rearingStartDate, setRearingStartDate] = useState(() => getManilaDateString());
  const [deviceId, setDeviceId] = useState('');
  const [tankToRemove, setTankToRemove] = useState<{ id: string; name: string } | null>(null);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tanks'] }),
      queryClient.invalidateQueries({ queryKey: ['device-statuses'] }),
    ]);
  };
  const register = useMutation({
    mutationFn: async () => {
      if (!canRegisterTank) throw new Error('You do not have permission to register a tank.');
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
    setTankToRemove(tank);
  }
  return <Page>
    <Title icon={<Waves size={23} color={colors.teal} />} detail="Select a tank to view its live readings">Tanks</Title>
    {can(user?.role, 'registerTank') && <Button label="Register tank" icon={<Plus size={18} color="white" />} onPress={() => { register.reset(); setFormOpen(true); }} />}
    {remove.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>Could not remove tank: {remove.error.message}</Text>}
    {isLoading ? <StateMessage message="Loading tanks…" loading /> : error ? <Card><StateMessage message={`Could not load tanks: ${error.message}`} /><Button label="Retry" secondary onPress={refetch} /></Card> : tanks.length ? tanks.map((tank) => <TankSummaryCard key={tank.id} tank={tank} onOpen={() => { setTankId(tank.id); navigation.navigate('Home'); }} onRemove={can(user?.role, 'removeTank') ? () => confirmRemove(tank) : undefined} removeDisabled={allTanks.length <= 1} />) : <StateMessage message="No tanks are available." />}
    <Modal visible={formOpen && canRegisterTank} animationType="slide" onRequestClose={() => setFormOpen(false)}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Page>
          <Title icon={<Waves size={23} color={colors.teal} />} detail="Link monitoring hardware to a tank">Register tank</Title>
          <Field label="Tank name" value={name} onChangeText={setName} />
          <Field label="Hatchery" value={site} onChangeText={setSite} />
          <Field label="Rearing start date (YYYY-MM-DD)" value={rearingStartDate} onChangeText={setRearingStartDate} />
          <Field label="Hardware ID" value={deviceId} onChangeText={setDeviceId} />
          {register.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{register.error.message}</Text>}
          <Button label={register.isPending ? 'Registering…' : 'Register tank'} disabled={register.isPending} onPress={() => register.mutate()} />
          <Button label="Cancel" secondary onPress={() => setFormOpen(false)} disabled={register.isPending} />
        </Page>
      </SafeAreaView>
    </Modal>
    <GlassDialog solid visible={Boolean(tankToRemove)} onDismiss={() => { if (!remove.isPending) setTankToRemove(null); }}>
      <Dialog.Title style={{ marginTop: 24, color: colors.ink }}>Remove tank?</Dialog.Title>
      <Dialog.Content><Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>Are you sure you want to remove {tankToRemove?.name}? This cannot be undone.</Text></Dialog.Content>
      <Dialog.Actions style={{ justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Pressable accessibilityRole="button" disabled={remove.isPending} onPress={() => setTankToRemove(null)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={remove.isPending} onPress={() => {
          if (!tankToRemove) return;
          remove.mutate(tankToRemove.id);
          setTankToRemove(null);
        }} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: uiScale.radius.pill, backgroundColor: colors.critical }}><Text style={{ color: '#fff', fontWeight: '700' }}>Remove tank</Text></Pressable>
      </Dialog.Actions>
    </GlassDialog>
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
      { label: 'Reports', icon: FileText, open: () => navigation.navigate('Reports') },
      { label: 'Activity logs', icon: Activity, open: () => navigation.navigate('Activity') },
      ...(can(user?.role, 'validation') ? [{ label: 'Validation', icon: ClipboardList, open: () => navigation.navigate('Review') }] : []),
    ] },
    { title: 'Account', items: [
      { label: 'Chat', icon: MessageCircle, open: () => navigation.navigate('Chat') },
      { label: 'My profile', icon: UserRound, open: () => navigation.navigate('Profile') },
    ] },
  ];
  return <Page>
    <Title icon={<MoreHorizontal size={23} color={colors.teal} />} detail="Records, tools and settings">More</Title>
    {groups.map((group) => <Card key={group.title} title={group.title}>
      {group.items.map((item, index) => <Pressable key={item.label} accessibilityRole="button" onPress={item.open} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected }}><item.icon size={18} color={colors.teal} /></View>
        <Text style={{ flex: 1, color: colors.ink, fontSize: uiScale.type.body, fontWeight: '600' }}>{item.label}</Text>
        <ChevronRight size={18} color={colors.muted} />
      </Pressable>)}
    </Card>)}
  </Page>;
}

function alertTitle(alert: AlertItem) {
  return `${alert.parameter} · ${alert.severity}`;
}

function alertParameterKey(parameter: string) {
  const normalized = parameter.trim().toLowerCase();
  if (normalized === 'do' || normalized.includes('oxygen')) return 'do';
  if (normalized.includes('temperature')) return 'temperature';
  return normalized;
}

function alertParameterLabel(parameter: string) {
  if (parameter === 'temperature') return 'Temperature';
  if (parameter === 'do') return 'Dissolved oxygen';
  if (parameter === 'ph') return 'pH';
  return parameter;
}

export function AlertsScreen({ navigation }: Props<'Alerts'>) {
  const { colors } = useTheme();
  const { user } = useSession();
  const { tanks, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const [statusFilter, setStatusFilter] = useState<AlertItem['status'] | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertItem['severity'] | 'all'>('all');
  const [parameterFilter, setParameterFilter] = useState<'temperature' | 'do' | 'ph' | null>(null);
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['alerts', 'all'], queryFn: () => api.listAlerts(), refetchInterval: 5000 });
  const pending = useQuery({ queryKey: ['pending-accounts', user?.id], queryFn: listPendingAccounts, enabled: user?.role === 'admin', refetchInterval: 5000 });
  const rows = [...(query.data ?? [])]
    .filter((alert) => tanks.some((tank) => tank.id === alert.tankId))
    .filter((alert) => statusFilter === 'all' || alert.status === statusFilter)
    .filter((alert) => severityFilter === 'all' || alert.severity === severityFilter)
    .filter((alert) => parameterFilter === null || alertParameterKey(alert.parameter) === parameterFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageCount = Math.max(1, Math.ceil(rows.length / 5));
  const currentPage = Math.min(page, pageCount);
  const firstPage = Math.max(1, Math.min(currentPage - 1, pageCount - 2));
  const pageNumbers = Array.from({ length: Math.min(3, pageCount) }, (_, index) => firstPage + index);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  return <Page>
    <Title icon={<AlertTriangle size={23} color={colors.teal} />} detail="Review alerts and responses">Alerts</Title>
    {user?.role === 'admin' && <Card title="Account requests">
      {pending.isLoading ? <StateMessage message="Loading account requests..." loading /> : pending.isError ? <><StateMessage message={`Could not load requests: ${pending.error.message}`} /><Button label="Retry requests" secondary onPress={() => void pending.refetch()} /></> : <Button label={`${pending.data?.length ?? 0} pending requests · Review`} secondary onPress={() => navigation.navigate('Users')} />}
    </Card>}
    <Card title="Alert list">
      <AlertFilters status={statusFilter} severity={severityFilter} parameter={parameterFilter}
        onStatusChange={(value) => { if (statusFilter !== value) { setStatusFilter(value); setPage(1); } }}
        onSeverityChange={(value) => { if (severityFilter !== value) { setSeverityFilter(value); setPage(1); } }}
        onParameterChange={(value) => { if (parameterFilter !== value) { setParameterFilter(value); setPage(1); } }} />
      {query.isLoading || tanksLoading ? <StateMessage message="Loading alerts…" loading /> : tanksError ? <><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry tank list" secondary onPress={refetchTanks} /></> : query.isError ? <><StateMessage message={`Alert data could not be loaded: ${query.error.message}`} /><Button label="Retry alerts" secondary onPress={() => void query.refetch()} /></> : rows.length === 0 ? <StateMessage message={statusFilter === 'all' && severityFilter === 'all' && parameterFilter === null ? 'No alerts are recorded for the selected hatchery.' : 'No alerts match these filters.'} /> : <>
      {rows.slice((currentPage - 1) * 5, currentPage * 5).map((alert) => {
        const StatusIcon = alert.severity === 'critical' ? AlertCircle : AlertTriangle;
        const statusColor = alert.severity === 'critical' ? colors.critical : colors.warning;
        const parameter = alertParameterKey(alert.parameter);
        const parameterLabel = ['temperature', 'do', 'ph'].includes(parameter) ? alertParameterLabel(parameter) : alert.parameter;
        const statusLabel = alert.status === 'open' ? 'New' : alert.status === 'acknowledged' ? 'Acknowledged' : 'Resolved';
        const tone = alert.status === 'resolved' ? colors.normal : alert.status === 'acknowledged' ? colors.warning : null;
        return <View key={alert.id} style={{ minHeight: 64, padding: uiScale.spacing[3], borderWidth: 1, borderColor: tone ?? colors.border, borderRadius: uiScale.radius.control, backgroundColor: tone ? `${tone}1A` : colors.glassControl, gap: uiScale.spacing[2] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: uiScale.spacing[2] }}><StatusIcon size={18} color={statusColor} /><Text style={{ color: colors.ink, fontSize: uiScale.type.body, fontWeight: '700', flexShrink: 1 }}>{parameterLabel}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[1] }}>
            <Text style={{ color: tone ?? colors.muted, fontWeight: '700' }}>{statusLabel}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open details for ${parameterLabel} alert`} onPress={() => navigation.getParent()?.navigate('AlertDetail', { alertId: alert.id })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={20} color={colors.ink} />
            </Pressable>
          </View>
        </View>
        <Text style={{ color: statusColor, fontWeight: '700' }}>{alert.severity === 'critical' ? 'Critical' : 'Warning'}</Text>
        <Text style={{ color: colors.ink, lineHeight: 20 }}><Text style={{ color: colors.muted }}>Tank: </Text>{alert.tankId}</Text>
        <Text style={{ color: colors.ink, lineHeight: 20 }}><Text style={{ color: colors.muted }}>Value: </Text>{alert.value}{'  '}<Text style={{ color: colors.muted }}>Threshold: </Text>{alert.threshold}</Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>{formatManilaDateTime(alert.createdAt)} PHT</Text>
      </View>;
      })}
      {pageCount > 1 && <View style={{ alignItems: 'center', gap: uiScale.spacing[2], paddingTop: uiScale.spacing[3] }}>
        <Text style={{ color: colors.muted }}>Page {currentPage} of {pageCount}</Text>
        <View style={{ flexDirection: 'row', gap: uiScale.spacing[1] }}>
          {[{ label: 'Previous page', text: '‹', target: currentPage - 1, disabled: currentPage === 1 }, ...pageNumbers.map((number) => ({ label: `Page ${number}`, text: `${number}`, target: number, disabled: false })), { label: 'Next page', text: '›', target: currentPage + 1, disabled: currentPage === pageCount }].map((item) => {
            const selected = item.target === currentPage && !item.disabled;
            return <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ disabled: item.disabled, selected }} disabled={item.disabled} onPress={() => setPage(item.target)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? colors.teal : colors.border, borderRadius: uiScale.radius.control, backgroundColor: selected ? colors.selected : 'transparent', opacity: item.disabled ? 0.5 : 1 }}>
              <Text style={{ color: selected ? colors.teal : colors.ink, fontWeight: '700' }}>{item.text}</Text>
            </Pressable>;
          })}
        </View>
      </View>}
      </>}
    </Card>
  </Page>;
}

export function AlertDetailScreen({ route }: RootProps<'AlertDetail'>) {
  const { colors } = useTheme();
  const record = createRecordStyles(colors);
  const { user } = useSession();
  const queryClient = useQueryClient();
  const alertQuery = useQuery({ queryKey: ['alert-detail', route.params.alertId], queryFn: async () => (await api.listAlerts()).find((item) => item.id === route.params.alertId) ?? null });
  const responses = useQuery({ queryKey: ['alert-responses', route.params.alertId], queryFn: () => api.listAlertResponses(route.params.alertId) });
  const [note, setNote] = useState('');
  const [resolveConfirmation, setResolveConfirmation] = useState(false);
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
      setResolveConfirmation(false);
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
    <Title icon={<AlertTriangle size={23} color={colors.teal} />} detail="Review the alert and record verified actions">Alert detail</Title>
    {alertQuery.isLoading ? <StateMessage message="Loading alert…" loading /> : alertQuery.isError ? <StateMessage message="Could not load alert details." /> : !alert ? <StateMessage message="Alert was not found." /> : <Card title={alertTitle(alert)}>
      <DataRow label="Tank" value={alert.tankId} />
      <DataRow label="Value" value={`${alert.value}`} detail={`Threshold: ${alert.threshold}`} />
      <DataRow label="Status" value={alert.status} detail={`Created ${formatManilaDateTime(alert.createdAt)} PHT`} />
      {alert.status !== 'resolved' && <Field label={alert.status === 'open' ? 'Acknowledgement note (optional)' : 'Resolution note'} value={note} onChangeText={setNote} placeholder="What did you observe or verify?" />}
      {alert.status === 'open' && <Button label="Acknowledge" icon={<CheckCircle2 size={18} color={colors.teal} />} disabled={mutation.isPending} onPress={() => mutation.mutate('acknowledge')} secondary />}
      {alert.status === 'acknowledged' && can(user?.role, 'resolveAlert') &&             <Button label="Resolve alert" icon={<CheckCircle2 size={18} color={colors.critical} />} disabled={mutation.isPending} onPress={() => setResolveConfirmation(true)} soft />}
      {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
      <Text style={{ color: colors.ink, fontWeight: '800', marginTop: 8 }}>Response history</Text>
      {responses.isLoading ? <StateMessage message="Loading responses…" loading /> : responses.isError ? <><StateMessage message={`Could not load responses: ${responses.error.message}`} /><Button label="Retry responses" secondary onPress={() => void responses.refetch()} /></> : (responses.data ?? []).length === 0 ? <Text style={{ color: colors.muted }}>No responses recorded.</Text> : responses.data?.map((response) => <View key={response.id} style={record.row}>
        <Text style={record.title}>{response.status.charAt(0).toUpperCase() + response.status.slice(1)} by {response.createdBy}</Text>
        <Text style={record.caption}>{formatManilaDateTime(response.createdAt)} PHT</Text>
        {response.note ? <Text style={record.body}>{response.note}</Text> : null}
      </View>)}
    </Card>}
    <GlassDialog solid visible={resolveConfirmation} onDismiss={() => { if (!mutation.isPending) setResolveConfirmation(false); }}>
      <Dialog.Title style={{ marginTop: 24, color: colors.ink }}>Resolve alert?</Dialog.Title>
      <Dialog.Content>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>Are you sure you want to resolve this alert? Verify the condition and provide a resolution note before continuing.</Text>
        {mutation.isError && <Text accessibilityRole="alert" style={{ color: colors.critical, marginTop: 8 }}>{mutation.error.message}</Text>}
      </Dialog.Content>
      <Dialog.Actions style={{ justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => setResolveConfirmation(false)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => mutation.mutate('resolve')} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: uiScale.radius.pill, borderWidth: 1, borderColor: colors.critical, backgroundColor: `${colors.critical}18` }}><Text style={{ color: colors.critical, fontWeight: '700' }}>{mutation.isPending ? 'Resolving…' : 'Confirm resolve'}</Text></Pressable>
      </Dialog.Actions>
    </GlassDialog>
  </Page>;
}

export function TrendsScreen() {
  const { colors } = useTheme();
  const { tanks, tankId, setTankId, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const [days, setDays] = useState(1);
  const [expanded, setExpanded] = useState<MeasuredParameter | null>(null);
  const from = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);
  const readings = useQuery({ queryKey: ['mobile-trends', tankId, from], queryFn: () => api.listReadings({ tankId, from }), enabled: Boolean(tankId) });
  const thresholds = useQuery({ queryKey: ['configured-thresholds'], queryFn: listConfiguredThresholds });
  const parameters = [{ key: 'temperature', label: 'Temperature', unit: '°C' }, { key: 'do', label: 'Dissolved oxygen', unit: 'mg/L' }, { key: 'ph', label: 'pH', unit: 'pH' }] as const;
  const tankOptions = tanks.map((tank) => ({ value: tank.id, label: tank.name }));
  return <Page>
    <Title icon={<Activity size={23} color={colors.teal} />} detail="Sensor readings">Trends</Title>
    <TrendFilters tanks={tankOptions} tankId={tankId ?? ''} onTankChange={setTankId} days={days} onDaysChange={setDays} />
    {tanksLoading || (Boolean(tankId) && readings.isLoading) || thresholds.isLoading ? <StateMessage message="Loading trend data…" loading /> : tanksError ? <Card><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry" secondary onPress={refetchTanks} /></Card> : !tankId ? <StateMessage message="No tanks are available for the selected hatchery." /> : readings.isError || thresholds.isError ? <Card><StateMessage message={`Could not load trends: ${(readings.error ?? thresholds.error)?.message}`} /><Button label="Retry" secondary onPress={() => { void readings.refetch(); void thresholds.refetch(); }} /></Card> : (readings.data?.length ?? 0) >= 500 ? <StateMessage message="The reading limit was reached; trends may be incomplete. Choose a shorter range." /> : parameters.map(({ key, label, unit }) => {
      const stats = calculateParameterStatistics(key, readings.data ?? [], thresholds.data ?? []);
      return <Card key={key} title={`${label} · ${unit}`} action={<Pressable accessibilityRole="button" accessibilityLabel={`Expand ${label} chart`} onPress={() => setExpanded(key)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface }}><Maximize2 size={18} color={colors.teal} /></Pressable>}>
        <TrendChart readings={readings.data ?? []} parameter={key} />
        <Text style={{ color: colors.muted }}>Mean {stats.mean === null ? '—' : stats.mean.toFixed(2)} · In range {stats.percentInRange === null ? '—' : `${stats.percentInRange.toFixed(1)}%`} · {stats.readings} valid</Text>
        {stats.invalidReadings > 0 && <Text style={{ color: colors.warning }}>{stats.invalidReadings} invalid readings excluded. Check probe.</Text>}
        <Text style={{ color: colors.muted }}>Lines break at invalid or missing samples. Times shown in Asia/Manila.</Text>
      </Card>;
    })}
    <Modal visible={expanded !== null} animationType="slide" onRequestClose={() => setExpanded(null)}><SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}><Page><Title icon={<Activity size={23} color={colors.teal} />} detail="Times shown in Asia/Manila">{`${parameters.find((item) => item.key === expanded)?.label ?? 'Trend'} trend`}</Title>{expanded && <Card><TrendChart readings={readings.data ?? []} parameter={expanded} expanded /></Card>}<Button label="Close" secondary onPress={() => setExpanded(null)} /></Page></SafeAreaView></Modal>
  </Page>;
}

export function StatusScreen() {
  const { colors } = useTheme();
  const { tanks, hatchery, isLoading, error, refetch } = useTankSelection();
  const statuses = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses() });
  const devices = getAssignedDevices(statuses.data ?? [], tanks)
    .filter(({ tank }) => hatchery === 'all' || hatcheryId(tank.site) === hatchery);
  const pendingTotal = pendingRecordTotal(devices.map(({ device }) => device));
  return <Page>
    <Title icon={<Wifi size={23} color={colors.teal} />} detail="Sensor and connectivity health">System health</Title>
    {statuses.isLoading || isLoading ? <StateMessage message="Loading device status…" loading /> : statuses.isError || error ? <Card><StateMessage message={`Could not load device status: ${(statuses.error ?? error)?.message}`} /><Button label="Retry" secondary onPress={() => { void statuses.refetch(); refetch(); }} /></Card> : devices.length === 0 ? <StateMessage message="No device status is available." /> : <>
      <Card title="Overview"><DataRow label="Devices" value={`${devices.length}`} /><DataRow label="Online" value={`${devices.filter(({ device }) => device.online).length}`} /><DataRow label="Offline" value={`${devices.filter(({ device }) => !device.online).length}`} /><DataRow label="Pending offline records" value={pendingTotal === null ? 'Unavailable' : `${pendingTotal}`} /></Card>
      {devices.map(({ device, tank }) => <Card key={device.deviceId} title={tank.name}>
        <DataRow label="Device" value={device.deviceId} />
        <DataRow label="Connection" value={device.online ? 'Online' : 'Offline'} detail={`Last seen ${formatManilaDateTime(device.lastSeen)} PHT`} />
        <DataRow label="Battery" value={device.batteryPct != null ? `${device.batteryPct}%` : 'Unavailable'} detail={`Power source: ${device.powerSource}`} />
        <DataRow label="Wi-Fi signal" value={`${device.wifiRssi} dBm`} />
        <DataRow label="Pending offline records" value={`${device.pendingSyncCount}`} />
        <DataRow label="Wi-Fi signal" value={hasReportedField(device, 'wifiRssi') ? `${device.wifiRssi} dBm` : 'Unavailable'} />
        <DataRow label="Pending offline records" value={hasReportedField(device, 'pendingSyncCount') ? `${device.pendingSyncCount}` : 'Unavailable'} />
        {device.invalidParameters && device.invalidParameters.length > 0 && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Check probe: {device.invalidParameters.join(', ')}{device.probeCheckedAt ? ` · ${formatManilaDateTime(device.probeCheckedAt)} PHT` : ''}</Text>}
      </Card>)}
    </>}
  </Page>;
}

export function ManagerReviewScreen() {
  const { colors } = useTheme();
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
          <DataRow label="Result" value={Math.abs(difference) <= tolerance ? 'Pass' : 'Fail'} valueColor={Math.abs(difference) <= tolerance ? colors.normal : colors.critical} />
        </Card>;
      })}
  </Page>;
}

export function ActivityLogsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const layout = createLogScreenStyles(colors);
  const record = createRecordStyles(colors);
  const { tankId, hatchery, allTanks } = useTankSelection();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const tanks = useTankSelection();
  const logs = useQuery({ queryKey: ['activity-logs'], queryFn: () => api.listActivityLogs() });
  const [modalKind, setModalKind] = useState<'OPERATION' | 'ENVIRONMENT' | null>(null);
  const [scope, setScope] = useState(tankId);
  const [activityType, setActivityType] = useState<string>(ACTIVITY_OPERATION_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [waterChangePercent, setWaterChangePercent] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [impact, setImpact] = useState('Moderate');
  const [kindFilter, setKindFilter] = useState<ActivityLogKind | 'all'>('all');
  const [expandedFilter, setExpandedFilter] = useState<'kind' | 'dates' | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [formError, setFormError] = useState('');
  const [exportingLogs, setExportingLogs] = useState(false);
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
      } else {
      }
    },
  });
  const filteredLogs = (logs.data ?? [])
    .filter((log) => activityInHatchery(log, allTanks, hatchery))
    .filter((log) => kindFilter === 'all' || log.kind === kindFilter)
    .filter((log) => {
      const timestamp = Date.parse(log.occurredAt ?? '');
      if (!Number.isFinite(timestamp)) return !dateFrom && !dateTo;
      const date = getManilaDateString(new Date(timestamp));
      return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    })
    .sort((a, b) => String(b.occurredAt ?? '').localeCompare(String(a.occurredAt ?? '')));
  const tankNames = new Map((tanks.tanks ?? []).map((tank) => [tank.id, tank.name]));
  async function shareLogs() {
    setExportingLogs(true);
    try {
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      const csv = toCsv([
        ['Hatchery', 'Time (PHT)', 'Kind', 'Type', 'Tank / scope', 'Details', 'Operator', 'Water change (%)', 'Water source', 'Impact', 'DO (mg/L)', 'Temperature (°C)', 'pH', 'Salinity (ppt)', 'Ammonia (mg/L)', 'Method'],
        ...filteredLogs.map((log) => [activityHatcheryName(log, allTanks), log.occurredAt && Number.isFinite(Date.parse(log.occurredAt)) ? formatManilaDateTime(log.occurredAt) : 'Unavailable', log.kind ?? '', log.type ?? '', log.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(log.tankId) ?? log.tankId ?? '', log.notes ?? '', log.operator ?? '', log.waterChangePercent, log.waterSource, log.impact, log.manualReadings?.dissolvedOxygen, log.manualReadings?.temperature, log.manualReadings?.ph, log.manualReadings?.salinity, log.manualReadings?.ammonia, log.manualReadings?.method]),
      ]);
      const encoded = encodeURIComponent(csv).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const fileUri = `${FileSystem.documentDirectory}hydrosense-activity-logs-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, fromByteArray(Uint8Array.from(encoded, (character) => character.charCodeAt(0))), { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share activity logs' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share activity logs.');
    } finally {
      setExportingLogs(false);
    }
  }
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
    const selectedTank = allTanks.find((tank) => tank.id === tankId);
    const selectedHatchery = hatchery === 'all' ? (selectedTank ? hatcheryId(selectedTank.site) : '') : hatchery;
    if (scope === 'hatchery' && !selectedHatchery) {
      setFormError('Select a tank or hatchery before recording a hatchery-wide event.');
      return;
    }
    const rawPercent = waterChangePercent.trim();
    const parsedPercent = rawPercent ? Number(rawPercent) : undefined;
    const entry: Omit<ActivityLog, 'id' | 'occurredAt'> = {
      tankId: scope,
      ...(scope === 'hatchery' ? { hatcheryId: selectedHatchery } : {}),
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
    <ActivityLogActions role={user?.role ?? null} width={width} onOpen={openLog} />
    <View style={layout.cards}>
      <Card title="Filters">
        <View style={{ flexDirection: 'row', gap: uiScale.spacing[3] }}>
          <FilterDropdown label="Kind" summary={kindFilter === 'all' ? 'All kinds' : kindFilter === 'OPERATION' ? 'Operation' : kindFilter === 'ENVIRONMENT' ? 'Environment' : 'Alert resolution'} icon={<ListFilter size={16} color={colors.teal} />} options={[{ value: 'all', label: 'All kinds' }, { value: 'OPERATION', label: 'Operation' }, { value: 'ENVIRONMENT', label: 'Environment' }, { value: 'ALERT RESOLUTION', label: 'Alert resolution' }]} value={kindFilter} expanded={expandedFilter === 'kind'} onToggle={() => setExpandedFilter((current) => current === 'kind' ? null : 'kind')} onChange={(value) => { setKindFilter(value as ActivityLogKind | 'all'); setExpandedFilter(null); }} />
          <FilterDropdown label="Date range" summary={dateFrom || dateTo ? `${dateFrom || 'Any'} to ${dateTo || 'Any'}` : 'Any date'} icon={<CalendarDays size={16} color={colors.teal} />} expanded={expandedFilter === 'dates'} onToggle={() => setExpandedFilter((current) => current === 'dates' ? null : 'dates')}>
            <View style={layout.dates}>
              <CalendarFilterField label="From date (PHT)" value={dateFrom} onChangeText={setDateFrom} />
              <CalendarFilterField label="To date (PHT)" value={dateTo} onChangeText={setDateTo} />
            </View>
          </FilterDropdown>
        </View>
      </Card>
      <Card title="Activity records" action={user?.role === 'admin' ? <Pressable accessibilityRole="button" accessibilityLabel={exportingLogs ? 'Preparing CSV' : 'Share CSV'} accessibilityState={{ disabled: exportingLogs || logs.isLoading || logs.isError || tanks.isLoading || Boolean(tanks.error) || filteredLogs.length === 0 }} disabled={exportingLogs || logs.isLoading || logs.isError || tanks.isLoading || Boolean(tanks.error) || filteredLogs.length === 0} onPress={() => void shareLogs()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, opacity: exportingLogs || logs.isLoading || logs.isError || tanks.isLoading || Boolean(tanks.error) || filteredLogs.length === 0 ? 0.5 : 1 }}><FileDown size={18} color={colors.teal} /></Pressable> : undefined}>
        {logs.isLoading || tanks.isLoading ? <StateMessage message="Loading activity logs…" loading /> : logs.isError ? <><StateMessage message={`Could not load activity logs: ${logs.error.message}`} /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></> : tanks.error ? <StateMessage message={`Could not load tanks: ${tanks.error.message}`} /> : filteredLogs.length === 0 ? <StateMessage message="No activity logs match the selected filters." spacious /> : <View style={{ gap: uiScale.spacing[3] }}>{filteredLogs.slice(0, 20).map((log) => <View key={log.id} style={[record.row, { padding: uiScale.spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.glassControl }]}>
          <View style={[record.top, { flexWrap: 'wrap' }]}>
            <Text style={record.caption}>{log.occurredAt && Number.isFinite(Date.parse(log.occurredAt)) ? `${formatManilaDateTime(log.occurredAt)} PHT` : 'Unavailable'}</Text>
              <Chip label={String(log.kind ?? 'Activity').charAt(0).toUpperCase() + String(log.kind ?? 'Activity').slice(1).toLowerCase()} />
          </View>
            <Text style={record.title}>{log.type ?? '—'}</Text>
            <Text style={record.caption}>{log.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(log.tankId) ?? log.tankId ?? '—'} · {log.operator ?? '—'}</Text>
            <Text style={record.body} numberOfLines={3}>{log.notes ?? '—'}</Text>
        </View>)}</View>}
      </Card>
    </View>
    {modalKind && (
      <Portal>
        <View style={layout.modalOverlay}>
          <ScrollView style={layout.modalScroll} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={layout.modalTitle}>{modalKind === 'OPERATION' ? 'Log operation' : 'Log weather / event'}</Text>
            <TextInput accessibilityLabel="Tank or scope" placeholder="Tank or scope" style={layout.modalInput} placeholderTextColor={colors.muted} value={scope} onChangeText={setScope} />
            <TextInput accessibilityLabel="Type" placeholder="Type" style={layout.modalInput} placeholderTextColor={colors.muted} value={activityType} onChangeText={setActivityType} />
            <TextInput accessibilityLabel="Notes" placeholder="Notes" style={[layout.modalInput, layout.modalNotes]} placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes} multiline />
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
  const [parameter, setParameter] = useState<CalibrationLog['parameter']>('ph');
  const [standard, setStandard] = useState('pH 7.00 buffer');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [date, setDate] = useState(getManilaDateString());
  const [nextDue, setNextDue] = useState(getManilaDateString(new Date(Date.now() + 30 * 86_400_000)));
  const [error, setError] = useState('');
  const calibrationQuery = useQuery({ queryKey: ['calibrations', tankId], queryFn: () => api.listCalibrationLogs(tankId), enabled: Boolean(tankId) && canCalibrate });
  const thresholdsQuery = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
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
  function submitCalibration() {
    if (!tankId || !standard.trim() || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) ||
        !before || !after || !date || !nextDue || new Date(`${nextDue}T00:00:00`) <= new Date(`${date}T00:00:00`)) {
      setError('Enter a calibration standard, valid before/after readings, and a due date after the calibration date.');
      return;
    }
    setError('');
    calibrationMutation.mutate();
  }
  return <Page redesigned>
    <Title detail="Log pH and dissolved-oxygen calibration results and due dates.">Calibration & Maintenance</Title>
    <TankPicker />
    {canCalibrate && (
      <Card title="Log calibration">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}><Button label="pH" secondary={parameter !== 'ph'} onPress={() => setParameter('ph')} /><Button label="Dissolved oxygen" secondary={parameter !== 'do'} onPress={() => setParameter('do')} /></View>
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
      <Text style={{ color: colors.muted }}>Reference values only. Use Log calibration to record sensor calibration.</Text>
      {thresholdsQuery.isLoading ? <StateMessage message="Loading thresholds…" loading /> : thresholdsQuery.isError ? <><StateMessage message="Could not load thresholds." /><Button label="Retry" secondary onPress={() => void thresholdsQuery.refetch()} /></> : (['temperature', 'do', 'ph'] as const).map((param) => {
        const item = thresholdsQuery.data?.find((threshold) => threshold.parameter === param);
        const unit = param === 'temperature' ? '°C' : param === 'do' ? 'mg/L' : 'pH';
        return <View key={param} style={{ gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>{param === 'do' ? 'Dissolved oxygen (mg/L)' : param === 'temperature' ? 'Temperature (°C)' : 'pH'}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Minimum</Text><Text style={{ color: item?.min === undefined ? colors.muted : colors.ink }}>{item?.min === undefined ? 'Not set' : `${item.min} ${unit}`}</Text></View>
            <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Maximum</Text><Text style={{ color: item?.max === undefined ? colors.muted : colors.ink }}>{item?.max === undefined ? 'Not set' : `${item.max} ${unit}`}</Text></View>
          </View>
        </View>;
      })}
    </Card>
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
  return <Page>
    <Title detail="Record manual field water-quality measurements">Field water-quality entry</Title>
    <TankPicker />
    <ManualEntryCard />
  </Page>;
}

export function HistoryScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const layout = createLogScreenStyles(colors);
  const record = createRecordStyles(colors);
  const { tanks, tankId, setTankId } = useTankSelection();
  const [page, setPage] = useState(1);
  const [parameter, setParameter] = useState<'all' | 'temperature' | 'do' | 'ph'>('all');
  const [sortKey, setSortKey] = useState<'timestamp' | MeasuredParameter>('timestamp');
  const [ascending, setAscending] = useState(false);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedFilter, setExpandedFilter] = useState<'tank' | 'dates' | 'parameter' | null>(null);
  const parameterOptions = [{ value: 'all', label: 'All measured' }, { value: 'temperature', label: 'Temperature' }, { value: 'do', label: 'Dissolved oxygen' }, { value: 'ph', label: 'pH' }] as const;
  const tankOptions = tanks.map((tank) => ({ value: tank.id, label: tank.name }));
  const tankLabel = tanks.find((tank) => tank.id === tankId)?.name ?? 'No tank selected';
  const parameterLabel = parameterOptions.find((option) => option.value === parameter)?.label ?? 'All measured';
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
  const rows = (query.data ?? []).filter((row) => parameter === 'all' || Number.isFinite(parameterValue(row, parameter))).sort((a, b) => {
    const difference = sortKey === 'timestamp' ? a.timestamp.localeCompare(b.timestamp) : parameterValue(a, sortKey) - parameterValue(b, sortKey);
    return ascending ? difference : -difference;
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / 5));
  const currentPage = Math.min(page, pageCount);
  const firstPage = Math.max(1, Math.min(currentPage - 1, pageCount - 2));
  const pageNumbers = Array.from({ length: Math.min(3, pageCount) }, (_, index) => firstPage + index);
  const pageRows = rows.slice((currentPage - 1) * 5, currentPage * 5);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  return <Page bottomPadding={tabBarHeight + uiScale.spacing[4]}>
    <Title>History</Title>
    <View style={layout.cards}>
      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, paddingHorizontal: uiScale.spacing[3] }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Filter by: ${tankLabel} · ${from} to ${to} · ${parameterLabel}`} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((open) => !open)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2] }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Filter by:</Text>{filtersOpen ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
        </Pressable>
        {filtersOpen && <View style={{ paddingBottom: uiScale.spacing[2], gap: uiScale.spacing[3] }}>
          <FilterDropdown label="Tank" summary={tankLabel} icon={<Droplets size={16} color={colors.teal} />} options={tankOptions} value={tankId} expanded={expandedFilter === 'tank'} onToggle={() => setExpandedFilter((current) => current === 'tank' ? null : 'tank')} onChange={(value) => { setTankId(value); setPage(1); }} />
          <FilterDropdown label="Date range" summary={`${from} to ${to}`} icon={<CalendarDays size={16} color={colors.teal} />} expanded={expandedFilter === 'dates'} onToggle={() => setExpandedFilter((current) => current === 'dates' ? null : 'dates')}>
            <View style={layout.dates}>
              <CalendarFilterField label="From date (PHT)" value={from} onChangeText={(value) => { setFrom(value); setPage(1); }} />
              <CalendarFilterField label="To date (PHT)" value={to} onChangeText={(value) => { setTo(value); setPage(1); }} />
            </View>
          </FilterDropdown>
          <FilterDropdown label="Parameter" summary={parameterLabel} icon={<ListFilter size={16} color={colors.teal} />} options={parameterOptions} value={parameter} expanded={expandedFilter === 'parameter'} onToggle={() => setExpandedFilter((current) => current === 'parameter' ? null : 'parameter')} onChange={(value) => { const selected = parameterOptions.find((option) => option.value === value); if (selected) { setParameter(selected.value); setPage(1); } }} />
        </View>}
      </View>
      <Card title="Readings">
        {query.isLoading ? <StateMessage message="Loading readings…" loading /> : query.isError ? <><StateMessage message="Could not load readings." /><Button label="Retry" secondary onPress={() => void query.refetch()} /></> : <>
          <Text style={layout.count}>{rows.length} readings{rows.length > pageRows.length ? ` · Showing ${pageRows.length}` : ''}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
            {([{ key: 'timestamp', label: 'Time' }, { key: 'temperature', label: 'Temperature' }, { key: 'do', label: 'DO' }, { key: 'ph', label: 'pH' }] as const).map(({ key, label }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Sort by ${label}`} onPress={() => {
              if (sortKey === key) setAscending((value) => !value);
              else { setSortKey(key); setAscending(false); }
            }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: uiScale.spacing[2] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{label}{sortKey === key ? ascending ? ' ↑' : ' ↓' : ''}</Text></Pressable>)}
          </View>
          {rows.length === 0 ? <StateMessage message="No readings match the selected filters." spacious /> : <>
          <View>{pageRows.map((row) => <View key={row.id} style={record.row}>
            <Text style={record.title}>{formatManilaDateTime(row.timestamp)} PHT</Text>
            <Text style={record.caption}>{tanks.find((tank) => tank.id === row.tankId)?.name ?? 'Unknown tank'}</Text>
            <View style={record.metrics}>
              {([{ label: 'Temp (°C)', value: row.temperature }, { label: 'DO (mg/L)', value: row.doMgL }, { label: 'pH', value: row.ph }]).map((metric) => <View key={metric.label} style={record.metric}>
                <Text style={record.caption}>{metric.label}</Text>
                <Text style={[record.value, { textAlign: 'right' }]}>{Number.isFinite(metric.value) ? metric.value.toFixed(2) : '—'}</Text>
              </View>)}
            </View>
          </View>)}</View>
          {pageCount > 1 && <View style={{ alignItems: 'center', gap: uiScale.spacing[2], paddingTop: uiScale.spacing[3] }}>
            <Text style={{ color: colors.muted }}>Page {currentPage} of {pageCount}</Text>
            <View style={{ flexDirection: 'row', gap: uiScale.spacing[1] }}>
              {[{ label: 'Previous page', text: '‹', target: currentPage - 1, disabled: currentPage === 1 }, ...pageNumbers.map((number) => ({ label: `Page ${number}`, text: `${number}`, target: number, disabled: false })), { label: 'Next page', text: '›', target: currentPage + 1, disabled: currentPage === pageCount }].map((item) => {
                const selected = item.target === currentPage && !item.disabled;
                return <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ disabled: item.disabled, selected }} disabled={item.disabled} onPress={() => setPage(item.target)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? colors.teal : colors.border, borderRadius: uiScale.radius.control, backgroundColor: selected ? colors.selected : 'transparent', opacity: item.disabled ? 0.5 : 1 }}>
                  <Text style={{ color: selected ? colors.teal : colors.ink, fontWeight: '700' }}>{item.text}</Text>
                </Pressable>;
              })}
            </View>
          </View>}
          </>}
        </>}
      </Card>
    </View>
  </Page>;
}

export function ReportsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const caption = { color: colors.muted, fontSize: uiScale.type.caption, textTransform: 'uppercase' as const };
  const numeric = { color: colors.ink, fontVariant: ['tabular-nums'] as const, textAlign: 'right' as const };
  const summaryTile: ViewStyle = { flexBasis: width < 360 ? '100%' : '47%', flexGrow: 1, minWidth: 0, borderWidth: 1, borderRadius: uiScale.radius.control, borderColor: colors.border, backgroundColor: colors.glassControl, padding: uiScale.spacing[3], gap: uiScale.spacing[2] };
  const { tankId, tanks, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const { user } = useSession();
  const [selectedTanks, setSelectedTanks] = useState<string[] | null>(null);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const [format, setFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [sections, setSections] = useState<ReportSection[]>(['summary', 'statistics', 'alerts', 'raw-readings']);
  const [sharing, setSharing] = useState(false);
  const [dataset, setDataset] = useState<ReportDataset>('readings');
  const selectedIds = selectedTanks === null
    ? tanks.some((tank) => tank.id === tankId) ? [tankId] : []
    : selectedTanks.filter((id) => tanks.some((tank) => tank.id === id));
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(`${to}T23:59:59.999+08:00`);
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) &&
    getManilaDateString(start) === from && getManilaDateString(end) === to && start <= end;
  const preview = useQuery({
    queryKey: ['report-preview', user?.id, user?.role, selectedIds, from, to],
    enabled: validRange && selectedIds.length > 0 && Boolean(user),
    queryFn: async () => {
      const [readings, alerts, thresholds, activityLogs, calibrationLogs, validationRows] = await Promise.all([
        Promise.all(selectedIds.map((id) => api.listReadings({ tankId: id, from: start.toISOString(), to: end.toISOString() }))),
        Promise.all(selectedIds.map((id) => api.listAlerts(id))),
        listConfiguredThresholds(),
        api.listActivityLogs(),
        canAccess(user?.role ?? null, 'canCalibrate') ? api.listCalibrationLogs() : Promise.resolve([]),
        canAccess(user?.role ?? null, 'validation') ? Promise.all(selectedIds.map((id) => api.listValidationRows(id))).then((rows) => rows.flat()) : Promise.resolve([]),
      ]);
      if (readings.some((rows) => rows.length >= 500) || alerts.some((rows) => rows.length >= 1000) ||
          activityLogs.length >= 1000 || calibrationLogs.length >= 1000 || validationRows.length >= 1000) {
        throw new Error('The server data limit was reached; the report could be incomplete.');
      }
      return { readings: readings.flat(), alerts: alerts.flat(), thresholds, activityLogs, calibrationLogs, validationRows };
    },
  });
  const model = preview.data && validRange && selectedIds.length && user && selectedIds.every((id) => tanks.some((tank) => tank.id === id))
    ? buildReport({ tankIds: selectedIds, from: start.toISOString(), to: end.toISOString(), sections, format, generatedBy: { name: user.name, role: user.role } }, {
      tanks, ...preview.data, advisories: {}, deviceStatuses: [],
    }) : null;
  const datasetRows = model ? reportDatasetRows(model, dataset) : null;
  const matched = datasetRows ? datasetRows.length - 1 : null;
  async function shareReport(overrideFormat = format) {
    setSharing(true);
    try {
      if (!user || !can(user.role, 'exportReports')) throw new Error('You do not have permission to export reports.');
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      if (!validRange) throw new Error('Enter a valid start and end date in YYYY-MM-DD format.');
      if (!selectedIds.length || !sections.length) throw new Error('Select at least one tank and report section.');
      const result = await preview.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Could not prepare report data.');
      const report = buildReport({ tankIds: selectedIds, from: start.toISOString(), to: end.toISOString(), sections, format: overrideFormat, generatedBy: { name: user.name, role: user.role } }, {
        tanks, ...result.data, advisories: {}, deviceStatuses: [],
      });
      const file = await createReportFile(report);
      const fileUri = `${FileSystem.documentDirectory}hydrosense-report-${Date.now()}.${file.extension}`;
      await FileSystem.writeAsStringAsync(fileUri, fromByteArray(file.bytes), { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, { mimeType: file.mimeType, dialogTitle: 'Share HydroSense report' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share file.');
    } finally {
      setSharing(false);
    }
  }
  async function shareCsv() {
    setSharing(true);
    try {
      if (!user || !can(user.role, 'exportReports')) throw new Error('You do not have permission to export reports.');
      if (!validRange) throw new Error('Enter a valid start and end date in YYYY-MM-DD format.');
      if (!selectedIds.length) throw new Error('Select at least one tank.');
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      const result = await preview.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Could not prepare report data.');
      const report = buildReport({ tankIds: selectedIds, from: start.toISOString(), to: end.toISOString(), sections, format: 'csv', generatedBy: { name: user.name, role: user.role } }, {
        tanks, ...result.data, advisories: {}, deviceStatuses: [],
      });
      const rows = reportDatasetRows(report, dataset);
      if (rows.length === 1) throw new Error('There are no records in the selected dataset and date range.');
      const fileUri = `${FileSystem.documentDirectory}hydrosense-${dataset}-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, toCsv(rows), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share HydroSense dataset' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share file.');
    } finally {
      setSharing(false);
    }
  }
  return <Page>
    <Title icon={<FileText size={23} color={colors.teal} />} detail="Select tanks, dates, sections and format">Reports</Title>
    <Card title="Export settings">
      <HatcheryPicker />
      <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, textTransform: 'uppercase' }}>CSV dataset</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
        <Chip label="Raw readings" selected={dataset === 'readings'} onPress={() => setDataset('readings')} />
        <Chip label="Alerts" selected={dataset === 'alerts'} onPress={() => setDataset('alerts')} />
        <Chip label="Activity logs" selected={dataset === 'activity'} onPress={() => setDataset('activity')} />
        {canAccess(user?.role ?? null, 'canCalibrate') && <Chip label="Calibration log" selected={dataset === 'calibration'} onPress={() => setDataset('calibration')} />}
        {canAccess(user?.role ?? null, 'validation') && <Chip label="Validation" selected={dataset === 'validation'} onPress={() => setDataset('validation')} />}
      </View>
      {dataset === 'validation' && <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Validation comparisons have no date field and cannot be filtered by period.</Text>}
    </Card>
    <Card>
      <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, textTransform: 'uppercase' }}>Records matched</Text>
      <Text style={{ color: colors.ink, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{matched ?? '—'}</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>{dataset === 'readings' ? 'readings' : dataset === 'activity' ? 'activity logs' : dataset} · {from} → {to} · Asia/Manila</Text>
      {user && can(user.role, 'exportReports') && <Button label="Download CSV" icon={<FileDown size={18} color={colors.teal} />} soft disabled={sharing || matched === null || matched === 0 || preview.isFetching} onPress={() => void shareCsv()} />}
    </Card>
    <Card title="Tanks">
      {tanksLoading ? <StateMessage message="Loading tanks…" loading /> : tanksError ? <><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry tank list" secondary onPress={refetchTanks} /></> : tanks.length === 0 ? <StateMessage message="No tanks are available for this account." /> : null}
      {tanks.map((tank) => <ReportChoice key={tank.id} kind="checkbox" label={tank.name} selected={selectedIds.includes(tank.id)} onPress={() => setSelectedTanks((current) => {
        const existing = (current ?? (tankId ? [tankId] : [])).filter((id) => tanks.some((tank) => tank.id === id));
        return existing.includes(tank.id) ? existing.filter((id) => id !== tank.id) : [...existing, tank.id];
      })} />)}
    </Card>
    <Card title="Date range">
      <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
      <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} />
    </Card>
    <Card title="Sections">
      {([['summary', 'Summary'], ['statistics', 'Statistics'], ['alerts', 'Alerts'], ['raw-readings', 'Readings']] as const).map(([key, label]) => <ReportChoice key={key} kind="checkbox" label={label} selected={sections.includes(key)} onPress={() => setSections((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} />)}
    </Card>
    {sections.includes('statistics') && <Card title="Readings in range">
      <Text style={{ color: colors.muted }}>Percentage of valid readings within configured thresholds</Text>
      {!tanks.length ? <StateMessage message="No tanks are available for this hatchery." /> : !validRange || !selectedIds.length ? <StateMessage message="Select a tank and valid dates to view the analysis." /> : preview.isLoading ? <StateMessage message="Preparing analysis…" loading /> : preview.isError ? <><StateMessage message={`Could not prepare analysis: ${preview.error.message}`} /><Button label="Retry" secondary onPress={() => void preview.refetch()} /></> : model?.statistics.map((stat) => <View key={stat.parameter} style={{ gap: 5, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.ink }}>{stat.parameter === 'temperature' ? 'Temperature' : stat.parameter === 'do' ? 'DO' : 'pH'}</Text><Text style={{ color: colors.ink }}>{stat.percentInRange === null ? 'No data' : `${stat.percentInRange.toFixed(1)}%`}</Text></View>
        <View style={{ height: 16, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}><View style={{ height: '100%', width: `${stat.percentInRange ?? 0}%`, backgroundColor: '#087c78' }} /></View>
      </View>)}
    </Card>}
    <Card title="Format">
      <View accessibilityRole="radiogroup" accessibilityLabel="Report format" style={{ gap: uiScale.spacing[2] }}>
        {(['pdf', 'csv', 'xlsx'] as const).map((value) => <ReportChoice key={value} kind="radio" label={value.toUpperCase()} selected={format === value} onPress={() => setFormat(value)} />)}
      </View>
      <Button label={sharing ? 'Preparing report…' : 'Share report'} disabled={sharing} onPress={() => void shareReport()} soft />
    </Card>
    <Card title="Report preview">
      {user && can(user.role, 'exportReports') && <Button label="Print / Save PDF" disabled={sharing || !model || preview.isFetching} onPress={() => void shareReport('pdf')} />}
      {!validRange ? <StateMessage message="Enter a valid start and end date." /> : !tanks.length ? <StateMessage message="No tanks are available for this hatchery." /> : !selectedIds.length ? <StateMessage message="Select a tank to generate the report." /> : preview.isLoading ? <StateMessage message="Preparing report…" loading /> : preview.isError ? <><StateMessage message={preview.error instanceof Error ? preview.error.message : 'Could not prepare report.'} /><Button label="Retry" secondary onPress={() => void preview.refetch()} /></> : model && <>
        <View style={{ gap: uiScale.spacing[2] }}>
          <Text style={caption}>Report ID</Text><Text selectable style={{ color: colors.ink }}>{model.id}</Text>
          <DataRow label="Prepared by" value={`${model.generatedBy.name} (${model.generatedBy.role})`} />
          <DataRow label="Tanks / period" value={`${model.tanks.map((tank) => tank.name).join(', ')} · ${from} to ${to} PHT`} />
          <DataRow label="Generated" value={`${formatManilaDateTime(model.generatedAt)} PHT`} />
        </View>
        {sections.includes('summary') && <View style={{ borderLeftWidth: 3, borderLeftColor: colors.teal, backgroundColor: colors.glassControl, padding: uiScale.spacing[3] }}><Text style={{ color: colors.ink }}>{model.summary}</Text></View>}
        {sections.includes('statistics') && <ScrollView horizontal accessibilityLabel="Report statistics table">
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[2] }}>
              {['Parameter', 'Min', 'Max', 'Mean', 'Std dev', 'In range', 'Excursions', 'Longest (h)'].map((value, index) => <Text key={value} style={[caption, { width: index === 0 ? 110 : 92, textAlign: index ? 'right' : 'left' }]}>{value}</Text>)}
            </View>
            {model.statistics.map((row) => <View key={row.parameter} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[3] }}>
              <Text style={{ color: colors.ink, width: 110 }}>{row.parameter === 'do' ? 'DO' : row.parameter === 'ph' ? 'pH' : 'Temperature'}</Text>
              {[row.min?.toFixed(2) ?? '—', row.max?.toFixed(2) ?? '—', row.mean?.toFixed(2) ?? '—', row.standardDeviation?.toFixed(2) ?? '—', row.percentInRange == null ? '—' : `${row.percentInRange.toFixed(1)}%`, String(row.excursions), row.longestExcursionHours.toFixed(1)].map((value, index) => <Text key={index} style={[numeric, { width: 92 }]}>{value}</Text>)}
            </View>)}
          </View>
        </ScrollView>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>
          {sections.includes('alerts') && <View style={summaryTile}><Text style={caption}>Alerts</Text><Text style={{ color: colors.ink }}>{model.alertCounts.critical} critical · {model.alertCounts.warning} warning · {model.alertCounts.open} open · {model.alertCounts.acknowledged} acknowledged · {model.alertCounts.resolved} resolved</Text></View>}
          <View style={summaryTile}><Text style={caption}>Thresholds used</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[1] }}>{model.thresholds.map((threshold) => <Chip key={threshold.parameter} label={`${threshold.parameter} ${threshold.min ?? '—'}–${threshold.max ?? '—'}`} />)}</View></View>
          <View style={summaryTile}><Text style={caption}>Expected readings</Text><Text style={{ color: colors.ink }}>Expected {model.dataQuality.expectedReadings} · Received {model.dataQuality.receivedReadings} ({model.dataQuality.receivedPercent.toFixed(1)}%)</Text></View>
          <View style={summaryTile}><Text style={caption}>Activity logs</Text><Text style={numeric}>{model.activityLogs.length}</Text></View>
          {canAccess(user?.role ?? null, 'canCalibrate') && <View style={summaryTile}><Text style={caption}>Calibration</Text><Text style={numeric}>{model.calibrationLogs.length}</Text></View>}
          {canAccess(user?.role ?? null, 'validation') && <View style={summaryTile}><Text style={caption}>Validation</Text><Text style={numeric}>{model.validationRows.length}</Text></View>}
        </View>
        {sections.includes('raw-readings') && <View>
          <Text style={caption}>Showing first {Math.min(10, model.rawReadings.length)} of {model.rawReadings.length} readings</Text>
          {model.rawReadings.slice(0, 10).map((row) => <View key={row.id} style={{ paddingVertical: uiScale.spacing[3], borderBottomWidth: 1, borderColor: colors.border, gap: uiScale.spacing[1] }}>
            <Text style={{ color: colors.ink }}>{formatManilaDateTime(row.timestamp)} · {model.tanks.find((tank) => tank.id === row.tankId)?.name ?? 'Unknown tank'}</Text>
            <Text style={numeric}>Temp {row.temperature.toFixed(2)} · DO {row.doMgL.toFixed(2)} · pH {row.ph.toFixed(2)}</Text>
          </View>)}
        </View>}
        {user && !can(user.role, 'exportReports') && <Text style={{ color: colors.muted }}>Operators may view reports; export is available to managers and administrators.</Text>}
      </>}
    </Card>
  </Page>;
}

export function ConnectionNotice({ online }: { online: boolean }) {
  const { colors } = useTheme();
  if (online) return null;
  return <View style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 100, backgroundColor: colors.offline, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.warning, fontWeight: '800' }}>Offline · showing cached data when available</Text></View>;
}
