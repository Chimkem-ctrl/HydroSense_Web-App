import { useContext, useMemo, useRef, useState, useEffect } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { ViewStyle } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dialog } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertCircle, AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList, CloudSun, Database, Droplets, Eye, FileDown, FileText, ListFilter, MapPin, Maximize2, MessageCircle, MoreHorizontal, Plus, Printer, Trash2, UserRound, Users, Waves, Wifi } from 'lucide-react-native';
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
  calculateTrendStatistics,
  can,
  comparisonStatistics,
  countMissingSamples,
  formatManilaDateTime,
  formatMeasuredParameterLabel,
  formatParameter,
  generateReportId,
  getManilaDateString,
  getParameterStatus,
  getReadingStatuses,
  getRaisingDay,
  hatcheryId,
  isValidMeasurement,
  loadAllReadings,
  parameterValue,
  prepareTrendRows,
  readingAge,
  readingFreshness,
  recentWifiSignal,
  rearingDay,
  resolveAlertWithActivityLog,
  safeRangeGauge,
  DEFAULT_THRESHOLDS,
  toCsv,
  validateAcknowledgeNote,
  validateActivityLog,
} from '@hydrosense/shared';
import type { ActivityLog, ActivityLogKind, AlertItem, CalibrationLog, MeasuredParameter, Reading, ReportModel, ReportSection, Threshold, TrendParameter } from '@hydrosense/shared';
import type { MainTabParamList, RootStackParamList } from './navigation';
import { api, getAccountProfile, getConfiguredThreshold, listConfiguredThresholds } from './services/client';
import { canAccess } from './access';
import { hatcheryLabel } from './management';
import { HATCHERIES } from './services/auth';
import { useSession, useTankSelection } from './state';
import { Button, CalendarFilterField, Card, Chip, createFormStyles, DataRow, GlassDialog, Page, primaryButtonGradient, RecordMetrics, RecordRow, RedesignedContext, scrollFocusedInputIntoView, StateMessage, Title } from './components/ui';
import { FilterDropdown } from './components/FilterDropdown';
import { AlertFilters } from './components/AlertFilters';
import { HatcheryPicker } from './components/HatcheryPicker';
import { RangeBar } from './components/RangeBar';
import { authColors, uiScale, useTheme } from './theme';
import type { Palette, ThemeChoice } from './theme';
import { createReportFile, reportDatasetRows } from './services/reportFiles';
import type { ReportDataset } from './services/reportFiles';
import { getAssignedDevices, hasReportedField, pendingRecordTotal } from './services/deviceTelemetry';
import { TrendChart } from './components/TrendChart';
import { TrendFilters } from './components/TrendFilters';
import { ActivityLogActions } from './components/ActivityLogActions';
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
  const chips = tanks.map((tank) => <Pressable accessibilityRole="button" accessibilityState={{ selected: tank.id === tankId }} key={tank.id} onPress={() => setTankId(tank.id)} style={{ minHeight: horizontal ? 34 : 48, height: horizontal ? 34 : undefined, alignItems: horizontal ? 'center' : undefined, justifyContent: 'center', borderRadius: horizontal ? uiScale.radius.control : uiScale.radius.pill, borderWidth: 1, borderColor: tank.id === tankId ? colors.teal : colors.border, paddingVertical: uiScale.spacing[1], paddingHorizontal: uiScale.spacing[3], backgroundColor: tank.id === tankId ? colors.selected : horizontal ? colors.glassControl : colors.surface }}><Text numberOfLines={1} style={{ color: tank.id === tankId ? colors.teal : colors.ink, fontWeight: '700', fontSize: horizontal ? uiScale.type.caption : uiScale.type.body }}>{horizontal && tank.name === tank.name.toLocaleUpperCase() ? tank.name.toLocaleLowerCase().replace(/\b\w/g, (letter) => letter.toLocaleUpperCase()) : tank.name}</Text></Pressable>);
  return horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Select tank" contentContainerStyle={{ gap: uiScale.spacing[2], alignItems: 'stretch' }}>{chips}</ScrollView>
    : <View accessibilityLabel="Select tank" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>{chips}</View>;
}

const createLogScreenStyles = (colors: Palette) => StyleSheet.create({
  cards: { gap: uiScale.spacing[3] },
  filters: { gap: uiScale.spacing[2] },
  dates: { flexDirection: 'row', gap: uiScale.spacing[2], alignItems: 'flex-start' },
  label: { color: colors.muted, fontSize: uiScale.type.caption },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: uiScale.spacing[2] },
  stackedActions: { flexDirection: 'column', alignItems: 'stretch' },
  glassAction: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: uiScale.spacing[2], paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[1], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.glassControl },
  glassActionLabel: { color: colors.ink, fontSize: uiScale.type.caption, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  count: { color: colors.muted, fontSize: uiScale.type.caption },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { flexShrink: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: uiScale.spacing[5], borderTopRightRadius: uiScale.spacing[5], overflow: 'hidden' },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalContent: { padding: uiScale.spacing[4], gap: uiScale.spacing[3] },
  modalField: { gap: uiScale.spacing[1], flex: 1, minWidth: 0 },
  modalInput: { height: 44, color: colors.ink, backgroundColor: colors.glassControl, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[2] },
  modalNotes: { height: 96, textAlignVertical: 'top' },
  modalTitle: { color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700' },
  modalError: { color: colors.critical },
  modalButton: { flex: 1, minWidth: 0, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: uiScale.spacing[2], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, overflow: 'hidden' },
});

function ReadingCard({ parameter, reading, threshold, stale }: { parameter: MeasuredParameter; reading: Reading; threshold: Threshold; stale: boolean }) {
  const { colors } = useTheme();
  const value = parameter === 'do' ? reading.doMgL : reading[parameter];
  const status = getParameterStatus(parameter, value, threshold);
  const label = parameter === 'temperature' ? 'Temperature' : parameter === 'do' ? 'DO' : 'pH';
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

function SeverityBadge({ severity }: { severity: AlertItem['severity'] }) {
  const { colors } = useTheme();
  const color = severity === 'critical' ? colors.critical : colors.warning;
  return <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: color, borderRadius: uiScale.radius.pill, paddingHorizontal: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] }}><Text style={{ color, fontSize: uiScale.type.caption, fontWeight: '700' }}>{severity === 'critical' ? 'Critical' : 'Warning'}</Text></View>;
}

export function HomeScreen({ navigation }: Props<'Home'>) {
  const { colors } = useTheme();
  const { user } = useSession();
  const [now, setNow] = useState(Date.now);
  const [networkConnected, setNetworkConnected] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => NetInfo.addEventListener((state) => setNetworkConnected(state.isConnected)), []);
  const { width } = useWindowDimensions();
  const { tankId, tanks, isLoading: tanksLoading, error: tanksError } = useTankSelection();
  const { data: reading, isLoading, isError, error: readingError, refetch } = useQuery({ queryKey: ['latest-reading', tankId], queryFn: () => api.getLatestReading(tankId), enabled: Boolean(tankId) });
  const thresholds = useQuery({ queryKey: ['configured-thresholds'], queryFn: listConfiguredThresholds });
  const devices = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses(), refetchInterval: 30_000 });
  const alerts = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const tank = tanks.find((item) => item.id === tankId);
  const statuses = reading && thresholds.data ? getReadingStatuses(reading, thresholds.data) : null;
  const device = devices.data?.find((item) => item.deviceId === tank?.deviceId);
  const freshness = reading ? readingFreshness(reading.timestamp, networkConnected === false ? false : device?.online, now) : null;
  const invalidReading = reading && (['temperature', 'do', 'ph'] as const).some((parameter) => !isValidMeasurement(parameter, parameterValue(reading, parameter)));
  const recentAlerts = [...(alerts.data ?? [])].filter((alert) => alert.tankId === tankId).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 4);
  const signal = networkConnected === false ? null : recentWifiSignal(device, now);
  const wifiSignal = signal === null ? 'Unavailable' : `${signal} dBm`;
  const lastReport = device?.lastSeen && Number.isFinite(Date.parse(device.lastSeen)) ? `${formatManilaDateTime(device.lastSeen)} PHT` : 'Unavailable';
  const pendingSync = device && hasReportedField(device, 'pendingSyncCount') && Number.isFinite(device.pendingSyncCount) ? `${device.pendingSyncCount}` : device?.storageAvailable === false ? 'SD unavailable' : 'Unavailable';
  return <Page>
    <View style={{ gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700', letterSpacing: 1 }}>WATER QUALITY MONITORING</Text><Text style={{ color: colors.ink, fontSize: uiScale.type.title, fontWeight: '500' }}>Welcome, {user?.name}.</Text></View>
    <Title icon={<Activity size={23} color={colors.teal} />} detail={tank ? hatcheryLabel(tank.site) : 'Live water-quality status'} >Live Monitor</Title>
    <TankPicker />
    {reading && (freshness?.stale || invalidReading) && <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.glassControl, borderColor: colors.warning, borderWidth: 1, borderRadius: uiScale.radius.control, padding: uiScale.spacing[3], gap: uiScale.spacing[1] }}>
      <Text style={{ color: colors.warning, fontWeight: '700' }}>{freshness?.stale ? 'Reading status unavailable while offline' : 'Check probe: invalid sensor reading'}</Text>
      <Text style={{ color: colors.ink }}>{freshness?.stale ? `Last reading ${readingAge(freshness.ageMs)}.` : 'Invalid readings are excluded from analysis.'}</Text>
    </View>}
    {tanksLoading || (Boolean(tankId) && isLoading) || (Boolean(tankId) && thresholds.isLoading) ? <StateMessage message="Loading latest readings and thresholds…" loading /> : tanksError ? null : !tankId ? null : isError || thresholds.isError ? <Card><StateMessage message={`Could not load readings or thresholds: ${(readingError ?? thresholds.error)?.message ?? 'Check your connection.'}`} /><Button label="Retry" onPress={() => { void refetch(); void thresholds.refetch(); }} secondary /></Card> : reading && statuses && thresholds.data ? <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>
        {(['temperature', 'do', 'ph'] as const).map((parameter) => <View key={parameter} style={{ width: width >= 950 ? '32%' : width >= 600 ? '48%' : '100%' }}><ReadingCard parameter={parameter} reading={reading} threshold={getConfiguredThreshold(thresholds.data, parameter)} stale={freshness?.stale ?? false} /></View>)}
      </View>
    </> : <StateMessage message="No reading is available for this tank." />}
    {Boolean(tankId) && !tanksError && <>
      <Card title="Device Connection">
        {devices.isLoading ? <StateMessage message="Loading device status…" loading /> : devices.isError ? <><StateMessage message={`Could not load device status: ${devices.error.message}`} /><Button label="Retry" secondary onPress={() => void devices.refetch()} /></> : <>
          <DataRow label="Connection" value={typeof device?.online === 'boolean' ? device.online ? 'Online' : 'Offline' : 'Unavailable'} />
          <DataRow label="Wi-Fi" value={wifiSignal} />
          <DataRow label="Last report" value={lastReport} />
          <DataRow label="Pending sync" value={pendingSync} />
        </>}
      </Card>
      <Card title="Recent Alerts" action={<Pressable accessibilityRole="link" accessibilityLabel="View all alerts" onPress={() => navigation.navigate('Alerts')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.teal, fontWeight: '700' }}>View all</Text></Pressable>}>
        {alerts.isLoading ? <StateMessage message="Loading recent alerts…" loading /> : alerts.isError ? <><StateMessage message={`Could not load alerts: ${alerts.error.message}`} /><Button label="Retry" secondary onPress={() => void alerts.refetch()} /></> : recentAlerts.length === 0 ? <StateMessage message="No alerts are recorded for this tank." /> : recentAlerts.map((alert) => <View key={alert.id} style={{ minWidth: 0, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[2], gap: uiScale.spacing[1] }}>
          <SeverityBadge severity={alert.severity} />
          <Text style={{ color: colors.ink }}>{formatMeasuredParameterLabel(alert.parameter)} · {alert.value} · {alert.threshold}</Text>
          <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{Number.isFinite(Date.parse(alert.createdAt)) ? `${formatManilaDateTime(alert.createdAt)} PHT` : 'Unavailable time'}</Text>
        </View>)}
      </Card>
    </>}
    <Card title="ESP32 Setup">
      <Text style={{ color: colors.ink }}>Connect to HydroSense-Setup-XXXX using password hydrosense. If it is not visible, press and release RESET, then immediately hold BOOT for about five seconds.</Text>
      <Text style={{ color: colors.ink }}>Open the setup page and enter the Wi-Fi network, password and registered tank device ID{tank?.deviceId ? ` (${tank.deviceId})` : ''}. Setup sends credentials over an unencrypted local connection; use it only in a trusted environment.</Text>
      <Button label="Open ESP32 setup page" secondary onPress={() => {
        setSetupError('');
        void Linking.openURL('http://192.168.4.1').catch(() => setSetupError('Could not open the setup page. Connect to the ESP32 hotspot and open http://192.168.4.1 in a browser.'));
      }} />
      {setupError ? <Text accessibilityLiveRegion="polite" style={{ color: colors.warning }}>{setupError}</Text> : null}
      <Text style={{ color: colors.muted }}>The ESP32 restarts after saving. Reconnect your phone to its usual network afterward.</Text>
    </Card>
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
      return isValidMeasurement(parameter, value) ? formatParameter(parameter, value) : `${formatMeasuredParameterLabel(parameter)}: Check probe`;
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
  const [siteOpen, setSiteOpen] = useState(false);
  const profile = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => {
      if (!user) throw new Error('Sign in to load your profile.');
      return getAccountProfile(user.id);
    },
    enabled: formOpen && user?.role === 'manager',
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tanks'] }),
      queryClient.invalidateQueries({ queryKey: ['device-statuses'] }),
    ]);
  };
  const register = useMutation({
    mutationFn: async () => {
      if (!canRegisterTank) throw new Error('You do not have permission to register a tank.');
      const tankSite = user?.role === 'manager' ? profile.data?.site?.trim() : site.trim();
      if (user?.role === 'manager' && !tankSite) throw new Error('Your account has no assigned hatchery. Contact an administrator.');
      if (!name.trim() || !tankSite || !deviceId.trim()) throw new Error('Enter a tank name, hatchery and hardware ID.');
      const tankName = name.trim().toLowerCase();
  const hardwareId = deviceId.trim().toLowerCase();
  if (allTanks.some((item) => hatcheryId(item.site) === hatcheryId(tankSite) && item.name.trim().toLowerCase() === tankName)) throw new Error(`A tank named "${name.trim()}" already exists at this location.`);
  if (allTanks.some((item) => item.deviceId.trim().toLowerCase() === hardwareId)) throw new Error(`Hardware ID "${deviceId.trim()}" is already linked to another tank.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rearingStartDate) || !Number.isFinite(Date.parse(`${rearingStartDate}T00:00:00Z`)) || new Date(`${rearingStartDate}T00:00:00Z`).toISOString().slice(0, 10) !== rearingStartDate) throw new Error('Enter a valid rearing start date in YYYY-MM-DD format.');
      return api.createTank({ name: name.trim(), site: tankSite, rearingStartDate, deviceId: deviceId.trim() }, user?.name ?? '');
    },
    onSuccess: async (tank) => {
      setName(''); setSite(''); setSiteOpen(false); setDeviceId('');
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
    {canRegisterTank && <Button label="Register tank" icon={<Plus size={18} color="white" />} onPress={() => { register.reset(); setFormOpen(true); }} />}
    {remove.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>Could not remove tank: {remove.error.message}</Text>}
    {isLoading ? <StateMessage message="Loading tanks…" loading /> : error ? <Card><StateMessage message={`Could not load tanks: ${error.message}`} /><Button label="Retry" secondary onPress={refetch} /></Card> : tanks.length ? tanks.map((tank) => <TankSummaryCard key={tank.id} tank={tank} onOpen={() => { setTankId(tank.id); navigation.navigate('Home'); }} onRemove={can(user?.role, 'removeTank') ? () => confirmRemove(tank) : undefined} removeDisabled={allTanks.length <= 1} />) : <StateMessage message="No tanks are available." />}
    <Modal visible={formOpen && canRegisterTank} animationType="slide" onRequestClose={() => setFormOpen(false)}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Page>
          <Title icon={<Waves size={23} color={colors.teal} />} detail="Link monitoring hardware to a tank">Register Tank</Title>
          <Field label="Tank name" value={name} onChangeText={setName} />
            {user?.role === 'manager' ? profile.isLoading ? <StateMessage message="Loading assigned hatchery…" loading /> : profile.isError ? <><StateMessage message={`Could not load assigned hatchery: ${profile.error.message}`} /><Button label="Retry hatchery" secondary onPress={() => void profile.refetch()} /></> : <DataRow label="Hatchery" value={hatcheryLabel(profile.data?.site)} /> : <View style={{ flexDirection: 'row' }}><FilterDropdown label="Hatchery location" summary={site || 'Select a location'} icon={<MapPin size={14} color={colors.teal} />} options={HATCHERIES.map((item) => ({ value: item.name, label: item.name }))} value={site} expanded={siteOpen} onToggle={() => setSiteOpen((open) => !open)} onChange={(value) => { setSite(value); setSiteOpen(false); }} /></View>}
        <Field label="Rearing start date (YYYY-MM-DD)" value={rearingStartDate} onChangeText={setRearingStartDate} />
        <Field label="Hardware ID" value={deviceId} onChangeText={setDeviceId} />
          {register.isError && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{register.error.message}</Text>}
          <Button label={register.isPending ? 'Registering…' : 'Register tank'} disabled={register.isPending || (user?.role === 'manager' && (profile.isLoading || profile.isError))} onPress={() => register.mutate()} />
          <Button label="Cancel" secondary onPress={() => setFormOpen(false)} disabled={register.isPending} />
        </Page>
      </SafeAreaView>
    </Modal>
    <GlassDialog solid visible={Boolean(tankToRemove)} onDismiss={() => { if (!remove.isPending) setTankToRemove(null); }}>
      <Dialog.Title style={{ marginTop: 24, color: colors.ink }}>Remove Tank?</Dialog.Title>
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
      { label: 'System Health', icon: Wifi, open: () => navigation.navigate('Status') },
    ] },
    { title: 'Records and Tools', items: [
      { label: 'Historical Logs', icon: Database, open: () => navigation.navigate('History') },
      { label: 'Reports', icon: FileText, open: () => navigation.navigate('Reports') },
      { label: 'Activity Logs', icon: Activity, open: () => navigation.navigate('Activity') },
      ...(can(user?.role, 'validation') ? [{ label: 'Validation', icon: ClipboardList, open: () => navigation.navigate('Review') }] : []),
    ] },
    { title: 'Account', items: [
      ...(canAccess(user?.role ?? null, 'users') ? [{ label: 'Users & Roles', icon: Users, open: () => navigation.navigate('Users') }] : []),
      ...(canAccess(user?.role ?? null, 'admin') ? [{ label: 'Audit & System Logs', icon: ClipboardList, open: () => navigation.navigate('AuditLogs') }] : []),
      { label: 'Chat', icon: MessageCircle, open: () => navigation.navigate('Chat') },
      { label: 'My Profile', icon: UserRound, open: () => navigation.navigate('Profile') },
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

function alertParameterKey(parameter: string) {
  const normalized = parameter.trim().toLowerCase();
  if (normalized === 'do' || normalized.includes('oxygen')) return 'do';
  if (normalized.includes('temperature')) return 'temperature';
  return normalized;
}

function alertParameterLabel(parameter: string) {
  if (parameter === 'temperature') return 'Temperature';
  if (parameter === 'do') return 'DO';
  if (parameter === 'ph') return 'pH';
  return parameter;
}

export function AlertsScreen({ navigation }: Props<'Alerts'>) {
  const { colors } = useTheme();
  const { tanks, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const [statusFilter, setStatusFilter] = useState<AlertItem['status'] | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertItem['severity'] | 'all'>('all');
  const [parameterFilter, setParameterFilter] = useState<'temperature' | 'do' | 'ph' | null>(null);
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['alerts', 'all'], queryFn: () => api.listAlerts(), refetchInterval: 5000 });
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
    <Card title="Alert List">
      <AlertFilters status={statusFilter} severity={severityFilter} parameter={parameterFilter}
        onStatusChange={(value) => { if (statusFilter !== value) { setStatusFilter(value); setPage(1); } }}
        onSeverityChange={(value) => { if (severityFilter !== value) { setSeverityFilter(value); setPage(1); } }}
        onParameterChange={(value) => { if (parameterFilter !== value) { setParameterFilter(value); setPage(1); } }} />
      {query.isLoading || tanksLoading ? <StateMessage message="Loading alerts…" loading /> : tanksError ? <><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry tank list" secondary onPress={refetchTanks} /></> : query.isError ? <><StateMessage message={`Alert data could not be loaded: ${query.error.message}`} /><Button label="Retry alerts" secondary onPress={() => void query.refetch()} /></> : rows.length === 0 ? <StateMessage message={statusFilter === 'all' && severityFilter === 'all' && parameterFilter === null ? 'No alerts are recorded for the selected hatchery.' : 'No alerts match these filters.'} /> : <>
      {rows.slice((currentPage - 1) * 5, currentPage * 5).map((alert) => {
        const StatusIcon = alert.severity === 'critical' ? AlertCircle : AlertTriangle;
        const statusColor = alert.severity === 'critical' ? colors.critical : colors.warning;
        const parameter = alertParameterKey(alert.parameter);
        const parameterLabel = ['temperature', 'do', 'ph'].includes(parameter) ? alertParameterLabel(parameter) : formatMeasuredParameterLabel(alert.parameter);
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
  const { user } = useSession();
  const { allTanks, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
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
  const responseTime = (status: AlertItem['status']) => (responses.data ?? [])
    .filter((response) => response.status === status && Number.isFinite(Date.parse(response.createdAt)))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]?.createdAt;
  const timelineTime = (value?: string) => {
    if (!value) return responses.isLoading ? 'Loading…' : responses.isError ? 'Unavailable' : '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Unavailable';
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    return `${day} · ${time} PHT`;
  };
  return <Page>
    <Title icon={<AlertTriangle size={23} color={colors.teal} />} detail="Review the alert and record verified actions">Alert Detail</Title>
    {alertQuery.isLoading ? <StateMessage message="Loading alert…" loading /> : alertQuery.isError ? <StateMessage message="Could not load alert details." /> : !alert ? <StateMessage message="Alert was not found." /> : <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: uiScale.spacing[2] }}><SeverityBadge severity={alert.severity} /><Text style={{ color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700', flexShrink: 1 }}>{formatMeasuredParameterLabel(alert.parameter)}</Text></View>
      {tanksError && <><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry tank list" secondary onPress={refetchTanks} /></>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
        {[['Tank', tanksLoading ? 'Loading…' : allTanks.find((tank) => tank.id === alert.tankId)?.name ?? 'Unknown tank'], ['Value', String(alert.value)], ['Threshold', alert.threshold], ['Status', alert.status]].map(([label, value]) => <View key={label} style={{ flexBasis: '48%', flexGrow: 1, minWidth: 0, backgroundColor: colors.glassControl, borderRadius: uiScale.radius.control, padding: uiScale.spacing[2], gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted }}>{label}</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{value}</Text></View>)}
      </View>
      <View style={{ gap: uiScale.spacing[1] }}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Timeline</Text>
        {[['Created', timelineTime(alert.createdAt)], ['Acknowledged', timelineTime(alert.acknowledgedAt ?? responseTime('acknowledged'))], ['Resolved', timelineTime(responseTime('resolved'))]].map(([label, value]) => <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] }}><Text style={{ color: colors.muted, flexShrink: 1 }}>{label}</Text><Text style={{ color: colors.ink, flex: 1, minWidth: 0, textAlign: 'right' }}>{value}</Text></View>)}
      </View>
      <Text style={{ color: colors.ink, fontWeight: '700', marginTop: uiScale.spacing[2] }}>Response History</Text>
      {responses.isLoading ? <StateMessage message="Loading responses…" loading /> : responses.isError ? <><StateMessage message={`Could not load responses: ${responses.error.message}`} /><Button label="Retry responses" secondary onPress={() => void responses.refetch()} /></> : (responses.data ?? []).length === 0 ? <Text style={{ color: colors.muted }}>No responses recorded.</Text> : responses.data?.map((response) => <View key={response.id} style={{ minWidth: 0, backgroundColor: colors.glassControl, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, padding: uiScale.spacing[3], gap: uiScale.spacing[1] }}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{response.status.charAt(0).toUpperCase() + response.status.slice(1)} by {response.createdBy}</Text>
        <Text style={{ color: colors.muted }}>{timelineTime(response.createdAt)}</Text>
        {response.note ? <Text style={{ color: colors.ink }}>{response.note}</Text> : null}
      </View>)}
      {alert.status !== 'resolved' && <Field label={alert.status === 'open' ? 'Acknowledgement note (optional)' : 'Resolution note'} value={note} onChangeText={setNote} placeholder="What did you observe or verify?" />}
      {alert.status === 'open' && <Button label="Acknowledge" icon={<CheckCircle2 size={18} color={colors.teal} />} disabled={mutation.isPending} onPress={() => mutation.mutate('acknowledge')} secondary />}
      {alert.status === 'acknowledged' && can(user?.role, 'resolveAlert') &&             <Button label="Resolve alert" icon={<CheckCircle2 size={18} color={colors.critical} />} disabled={mutation.isPending} onPress={() => setResolveConfirmation(true)} soft />}
      {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
    </Card>}
    <GlassDialog solid visible={resolveConfirmation} onDismiss={() => { if (!mutation.isPending) setResolveConfirmation(false); }}>
      <Dialog.Title style={{ marginTop: 24, color: colors.ink }}>Resolve Alert?</Dialog.Title>
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
  const { user } = useSession();
  const { tanks, tankId, setTankId, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const [days, setDays] = useState(1);
  const [customFrom, setCustomFrom] = useState(() => getManilaDateString(new Date(Date.now() - 6 * 86_400_000)));
  const [customTo, setCustomTo] = useState(() => getManilaDateString());
  const [expanded, setExpanded] = useState<MeasuredParameter | null>(null);
  const [exporting, setExporting] = useState(false);
  const today = getManilaDateString();
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00+08:00`)) && getManilaDateString(new Date(`${value}T00:00:00+08:00`)) === value;
  const validRange = days !== 0 || (validDate(customFrom) && validDate(customTo) && customFrom <= customTo && customTo <= today);
  const dates = useMemo(() => {
    if (days === 0) return { from: `${customFrom}T00:00:00+08:00`, to: `${customTo}T23:59:59.999+08:00` };
    const now = Date.now();
    return { from: new Date(now - days * 86_400_000).toISOString(), to: new Date(now).toISOString() };
  }, [days, customFrom, customTo]);
  const readings = useQuery({ queryKey: ['mobile-trends', tankId, dates.from, dates.to], queryFn: () => loadAllReadings(api, { tankId: tankId!, ...dates }), enabled: Boolean(tankId) && validRange });
  const alerts = useQuery({ queryKey: ['mobile-trend-alerts', tankId, dates.from, dates.to], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) && validRange });
  const thresholds = useQuery({ queryKey: ['configured-thresholds'], queryFn: listConfiguredThresholds });
  const parameters: TrendParameter[] = ([{ key: 'temperature', title: 'Temperature', unit: '°C' }, { key: 'do', title: 'DO', unit: 'mg/L' }, { key: 'ph', title: 'pH', unit: 'pH' }] as const).map((parameter) => {
    const threshold = thresholds.data?.find((item) => item.parameter === parameter.key) ?? DEFAULT_THRESHOLDS.find((item) => item.parameter === parameter.key);
    return { ...parameter, safeMin: threshold?.min, safeMax: threshold?.max };
  });
  const rows = useMemo(() => prepareTrendRows(readings.data?.rows ?? []).rows, [readings.data]);
  const stats = parameters.map((parameter) => calculateTrendStatistics(rows, parameter));
  const selectedTank = tanks.find((tank) => tank.id === tankId);
  const currentDay = selectedTank ? rearingDay(selectedTank.rearingStartDate) : null;
  const dailyRows = new Map<string, Reading[]>();
  rows.forEach((row) => {
    const day = getManilaDateString(new Date(row.timestamp));
    const group = dailyRows.get(day) ?? [];
    group.push(row);
    dailyRows.set(day, group);
  });
  const alertCounts = new Map<string, { warning: number; critical: number }>();
  (alerts.data ?? []).forEach((alert) => {
    const time = Date.parse(alert.createdAt);
    if (!Number.isFinite(time) || time < Date.parse(dates.from) || time > Date.parse(dates.to)) return;
    const day = getManilaDateString(new Date(time));
    const count = alertCounts.get(day) ?? { warning: 0, critical: 0 };
    count[alert.severity] += 1;
    alertCounts.set(day, count);
  });
  const frequency = [...alertCounts.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxAlerts = Math.max(1, ...frequency.map(([, count]) => count.warning + count.critical));
  const tankOptions = tanks.map((tank) => ({ value: tank.id, label: tank.name }));
  const number = (value: number | null, digits = 2) => value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
  const safeRange = (parameter: TrendParameter) => parameter.safeMin === undefined ? parameter.safeMax === undefined ? 'Not configured' : `≤${parameter.safeMax} ${parameter.unit}` : parameter.safeMax === undefined ? `≥${parameter.safeMin} ${parameter.unit}` : `${parameter.safeMin}–${parameter.safeMax} ${parameter.unit}`;
  const selectedParameter = parameters.find((parameter) => parameter.key === expanded);
  const selectedStats = stats.find((item) => item.parameter === expanded);
  const latest = expanded ? [...rows].reverse().find((row) => isValidMeasurement(expanded, parameterValue(row, expanded))) : undefined;
  const latestRows = parameters.map((parameter) => [...rows].reverse().find((row) => isValidMeasurement(parameter.key, parameterValue(row, parameter.key))));
  const metricGrid = (items: Array<[string, string]>) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: uiScale.spacing[3], rowGap: uiScale.spacing[3] }}>{items.map(([label, value]) => <View key={label} style={{ width: '50%', minWidth: 0, gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{label}</Text><Text style={{ color: colors.ink, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text></View>)}</View>;
  async function shareTrends() {
    setExporting(true);
    try {
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      const csv = toCsv([['Time PHT', 'Temperature', 'DO', 'pH'], ...rows.map((row) => [formatManilaDateTime(row.timestamp), row.temperature, row.doMgL, row.ph])]);
      const encoded = encodeURIComponent(csv).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const fileUri = `${FileSystem.documentDirectory}hydrosense-trends-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, fromByteArray(Uint8Array.from(encoded, (character) => character.charCodeAt(0))), { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share trend readings' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share trend readings.');
    } finally {
      setExporting(false);
    }
  }
  const exportDisabled = exporting || !validRange || readings.isLoading || readings.isError || !rows.length || Boolean(readings.data?.truncated);
  return <Page>
    <Title icon={<Activity size={23} color={colors.teal} />} detail={selectedTank ? `${hatcheryLabel(selectedTank.site)} · ${selectedTank.name}${rows.length ? ` · Last reading ${formatManilaDateTime(rows[rows.length - 1].timestamp)} PHT` : ''}` : 'Sensor readings'}>Trends</Title>
    <TrendFilters tanks={tankOptions} tankId={tankId ?? ''} onTankChange={setTankId} days={days} onDaysChange={setDays} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} today={today} action={user && can(user.role, 'exportReports') ? <Pressable accessibilityRole="button" accessibilityLabel="Export CSV" accessibilityState={{ disabled: exportDisabled }} disabled={exportDisabled} onPress={() => void shareTrends()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, opacity: exportDisabled ? 0.5 : 1 }}><FileDown size={18} color={colors.teal} /></Pressable> : undefined} />
    {!validRange ? <StateMessage message="Enter valid dates in YYYY-MM-DD format, from no later than to, and not after today (PHT)." /> : tanksLoading || (Boolean(tankId) && (readings.isLoading || alerts.isLoading)) || thresholds.isLoading ? <StateMessage message="Loading trend data…" loading /> : tanksError ? <Card><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry" secondary onPress={refetchTanks} /></Card> : !tankId ? <StateMessage message="No tanks are available for the selected hatchery." /> : readings.isError || thresholds.isError || alerts.isError ? <Card><StateMessage message={`Could not load trends: ${(readings.error ?? thresholds.error ?? alerts.error)?.message}`} /><Button label="Retry" secondary onPress={() => { void readings.refetch(); void thresholds.refetch(); void alerts.refetch(); }} /></Card> : <>
      {readings.data?.truncated && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Some readings could not be loaded. Statistics are incomplete; select a shorter range to export.</Text>}
      <View accessibilityLabel="Latest sensor readings" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
        {parameters.map((parameter, index) => <Card key={parameter.key} style={{ flexGrow: 1, flexBasis: '47%', minWidth: 0 }}>
          <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700' }}>{parameter.title}</Text>
          <Text style={{ color: colors.ink, fontSize: uiScale.type.title, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{number(stats[index].latest)} <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{parameter.unit}</Text></Text>
          <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{latestRows[index] ? `Latest valid · ${formatManilaDateTime(latestRows[index]!.timestamp)} PHT` : 'No valid sensor reading in this period'}</Text>
        </Card>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}><Chip compact label="Safe bands use configured thresholds" /><Chip compact label="Overnight 22:00–06:00 PHT" /></View>
      <Card title="Range Statistics">
        <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{days === 1 ? 'Last 24 hours' : days === 7 ? 'Last 7 days' : days === 21 ? 'Full cycle' : 'Custom range'} · {stats.reduce((total, stat) => total + stat.invalidReadings, 0)} invalid readings excluded</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Range statistics table">
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[2] }}>{['Parameter', 'Latest', 'Min', 'Max', 'Mean', 'Std dev', 'In range', 'Excursions', 'Longest (h)', 'Safe range'].map((label, index) => <Text key={label} style={{ width: index === 0 || index === 9 ? 120 : 85, color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700' }}>{label}</Text>)}</View>
            {parameters.map((parameter, index) => {
              const stat = stats[index];
              return <View key={parameter.key} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[3] }}>{[`${parameter.title} (${parameter.unit})`, number(stat.latest), number(stat.minimum), number(stat.maximum), number(stat.mean), number(stat.standardDeviation), stat.percentInRange === null ? '—' : `${number(stat.percentInRange, 1)}%`, stat.readings ? String(stat.excursions) : '—', stat.readings ? number(stat.longestExcursionHours, 1) : '—', safeRange(parameter)].map((value, cell) => <Text key={cell} style={{ width: cell === 0 || cell === 9 ? 120 : 85, color: colors.ink, fontSize: uiScale.type.caption, fontWeight: cell === 0 ? '700' : '400' }}>{value}</Text>)}</View>;
            })}
          </View>
        </ScrollView>
      </Card>
      {parameters.map((parameter, index) => {
        const stat = stats[index];
        return <Card key={parameter.key} title={`${parameter.title} · ${parameter.unit}`} action={<Pressable accessibilityRole="button" accessibilityLabel={`Expand ${parameter.title} chart`} onPress={() => setExpanded(parameter.key)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface }}><Maximize2 size={18} color={colors.teal} /></Pressable>}>
          <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Safe range: {safeRange(parameter)}</Text>
          <TrendChart readings={rows} parameter={parameter} />
          {metricGrid([['Latest', `${number(stat.latest)} ${parameter.unit}`], ['Min / max', `${number(stat.minimum)} / ${number(stat.maximum)}`], ['Mean', number(stat.mean)], ['In range', stat.percentInRange === null ? '—' : `${number(stat.percentInRange, 1)}%`]])}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>{[['In-range reading', colors.teal], ['Out-of-range reading', colors.critical], ['Safe range', colors.normal], ['Overnight', colors.teal], ['Offline gap', colors.muted]].map(([label, color]) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[1] }}><View style={{ width: 10, height: 8, borderRadius: label === 'Out-of-range reading' ? uiScale.radius.pill : 2, backgroundColor: color, opacity: label === 'Overnight' || label === 'Offline gap' ? 0.4 : 1 }} /><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{label}</Text></View>)}</View>
          {stat.invalidReadings > 0 && <Text style={{ color: colors.warning }}>{stat.invalidReadings} invalid readings excluded. Check probe.</Text>}
        </Card>;
      })}
      <Card title="Overnight vs Daytime"><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Day 06:00–22:00 · night 22:00–06:00 PHT · change = night mean − day mean</Text>{parameters.map((parameter) => {
        const { day, night } = comparisonStatistics(rows, parameter.key);
        return <View key={parameter.key} style={{ paddingVertical: uiScale.spacing[2], gap: uiScale.spacing[2] }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{parameter.title} ({parameter.unit})</Text>{metricGrid([['Day mean / min', `${number(day.mean)} / ${number(day.min)}`], ['Night mean / min', `${number(night.mean)} / ${number(night.min)}`], ['Change', number(day.mean === null || night.mean === null ? null : night.mean - day.mean)]])}</View>;
      })}</Card>
      <Card title="Rearing Day View"><Text style={{ color: colors.ink }}>{currentDay === null ? 'Start date unavailable' : currentDay < 0 ? `Starts in ${-currentDay} days` : currentDay > 21 ? `Day ${currentDay} · cycle ended` : `Day ${currentDay} of 21`}</Text><View accessibilityLabel={currentDay === null ? 'Rearing start date unavailable' : `Rearing day ${currentDay}; harvest window begins on day 21`} style={{ flexDirection: 'row', gap: 2 }}>{Array.from({ length: 22 }, (_, day) => <View key={day} style={{ flex: 1, height: uiScale.spacing[2], borderRadius: 2, backgroundColor: currentDay !== null && day === currentDay ? colors.ink : currentDay !== null && day < currentDay ? colors.teal : colors.border }} />)}</View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Day 0</Text><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Day 21 harvest window</Text></View><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Daily means in the selected range (PHT)</Text>{dailyRows.size === 0 ? <StateMessage message="No readings in this range." /> : [...dailyRows.entries()].map(([day, dayRows]) => <View key={day} style={{ paddingVertical: uiScale.spacing[1] }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{day}{selectedTank && rearingDay(selectedTank.rearingStartDate, new Date(`${day}T12:00:00+08:00`)) !== null ? ` · Day ${rearingDay(selectedTank.rearingStartDate, new Date(`${day}T12:00:00+08:00`))}` : ''}</Text><Text style={{ color: colors.muted }}>{parameters.map((parameter) => `${parameter.title} ${number(calculateTrendStatistics(dayRows, parameter).mean)}`).join(' · ')}</Text></View>)}</Card>
      <Card title="Alert Frequency"><Text style={{ color: colors.muted }}>Alerts per day · selected range</Text>{frequency.length === 0 ? <StateMessage message="No alerts occurred in this range." /> : frequency.map(([day, count]) => <View key={day} style={{ gap: uiScale.spacing[1], paddingVertical: uiScale.spacing[1] }}><Text style={{ color: colors.ink }}>{day} · {count.warning} warning · {count.critical} critical</Text><View style={{ flexDirection: 'row', height: uiScale.spacing[2] }}><View style={{ width: `${count.warning / maxAlerts * 100}%`, backgroundColor: colors.warning }} /><View style={{ width: `${count.critical / maxAlerts * 100}%`, backgroundColor: colors.critical }} /></View></View>)}</Card>
    </>}
    <Modal visible={expanded !== null} animationType="slide" onRequestClose={() => setExpanded(null)}><SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}><Page><Title icon={<Activity size={23} color={colors.teal} />}>{`${selectedParameter?.title ?? 'Trend'} Trend`}</Title>{expanded && selectedParameter && selectedStats && <Card><TrendChart readings={rows} parameter={selectedParameter} expanded /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>{[
      ['Latest valid', `${number(selectedStats.latest)} ${selectedParameter.unit}${latest ? ` · ${formatManilaDateTime(latest.timestamp)} PHT` : ''}`],
      ['Mean', number(selectedStats.mean)], ['Min / Max', `${number(selectedStats.minimum)} / ${number(selectedStats.maximum)}`],
      ['Std dev', number(selectedStats.standardDeviation)], ['In range', selectedStats.percentInRange === null ? '—' : `${number(selectedStats.percentInRange, 1)}%`],
      ['Excursions', selectedStats.readings ? String(selectedStats.excursions) : '—'], ['Longest excursion (h)', selectedStats.readings ? number(selectedStats.longestExcursionHours, 1) : '—'],
      ['Safe range', safeRange(selectedParameter)], ['Valid / invalid', `${selectedStats.readings} / ${selectedStats.invalidReadings}`], ['Missing samples', String(countMissingSamples(rows))],
    ].map(([label, value]) => <View key={label} style={{ width: '48%', flexGrow: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.glassControl, padding: uiScale.spacing[3], gap: uiScale.spacing[1] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{label}</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{value}</Text></View>)}</View></Card>}<Button label="Close" secondary onPress={() => setExpanded(null)} /></Page></SafeAreaView></Modal>
  </Page>;
}

export function StatusScreen() {
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const { tanks, hatchery, isLoading, error, refetch } = useTankSelection();
  const statuses = useQuery({ queryKey: ['device-statuses'], queryFn: () => api.listDeviceStatuses(), refetchInterval: 30_000 });
  const devices = getAssignedDevices(statuses.data ?? [], tanks)
    .filter(({ tank }) => hatchery === 'all' || hatcheryId(tank.site) === hatchery);
  const reportedDevices = devices.flatMap(({ device }) => device ? [device] : []);
  const pendingTotal = pendingRecordTotal(reportedDevices);
  return <Page>
    <Title icon={<Wifi size={23} color={colors.teal} />} detail="Sensor and connectivity health">System Health</Title>
    {statuses.isLoading || isLoading ? <StateMessage message="Loading device status…" loading /> : statuses.isError || error ? <Card><StateMessage message={`Could not load device status: ${(statuses.error ?? error)?.message}`} /><Button label="Retry" secondary onPress={() => { void statuses.refetch(); refetch(); }} /></Card> : devices.length === 0 ? <StateMessage message="No device status is available." /> : <>
      <Card title="Overview"><DataRow label="Devices" value={`${devices.length}`} /><DataRow label="Online" value={`${reportedDevices.filter((device) => device.online === true).length}`} /><DataRow label="Offline" value={`${reportedDevices.filter((device) => device.online === false).length}`} /><DataRow label="Pending offline records" value={pendingTotal === null ? 'Unavailable' : `${pendingTotal}`} /></Card>
      {devices.map(({ device, tank }) => <Card key={tank.id} title={tank.name}>
        <DataRow label="Device" value={tank.deviceId || 'No device assigned'} />
        <DataRow label="Connection" value={!device ? 'Never reported' : typeof device.online !== 'boolean' ? 'Unavailable' : device.online ? 'Online' : 'Offline'} detail={device?.lastSeen && Number.isFinite(Date.parse(device.lastSeen)) ? `Last seen ${formatManilaDateTime(device.lastSeen)} PHT` : undefined} />
        <DataRow label="Wi-Fi signal" value={recentWifiSignal(device, now) === null ? 'Unavailable' : `${device?.wifiRssi} dBm`} />
        <DataRow label="Pending offline records" value={device && hasReportedField(device, 'pendingSyncCount') && Number.isFinite(device.pendingSyncCount) ? `${device.pendingSyncCount}` : 'Unavailable'} />
        {device?.invalidParameters && device.invalidParameters.length > 0 && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Check probe: {device.invalidParameters.map(formatMeasuredParameterLabel).join(', ')}{device.probeCheckedAt ? ` · ${formatManilaDateTime(device.probeCheckedAt)} PHT` : ''}</Text>}
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
    <Title detail="Compare sensor averages with reference readings">Manager Review</Title>
    {rows.isLoading || tolerances.isLoading ? <StateMessage message="Loading validation…" loading /> :
      rows.isError || tolerances.isError ? <Card><StateMessage message={`Could not load validation: ${(rows.error ?? tolerances.error)?.message ?? 'Unknown error'}`} /><Button label="Retry" secondary onPress={() => { void rows.refetch(); void tolerances.refetch(); }} /></Card> :
      !rows.data?.length || !tolerances.data ? <StateMessage message="No validation comparisons are available." /> :
      rows.data.map((row, index) => {
        const key = row.parameter.toLowerCase().includes('temp') ? 'temperature' : row.parameter.toLowerCase().includes('ph') ? 'ph' : 'do';
        const tolerance = tolerances.data[key];
        const difference = row.hydrosenseMean - row.reference;
        const percent = row.reference === 0 ? 0 : Number((Math.abs(difference) / Math.abs(row.reference) * 100).toFixed(2));
        return <Card key={`${row.parameter}-${index}`} title={formatMeasuredParameterLabel(row.parameter)}>
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const layout = createLogScreenStyles(colors);
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
  const [expandedFormFilter, setExpandedFormFilter] = useState<'scope' | 'type' | 'impact' | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [formError, setFormError] = useState('');
  const [exportingLogs, setExportingLogs] = useState(false);
  const logScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
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
        ...filteredLogs.map((log) => [hatcheryLabel(activityHatcheryName(log, allTanks)), log.occurredAt && Number.isFinite(Date.parse(log.occurredAt)) ? formatManilaDateTime(log.occurredAt) : 'Unavailable', log.kind ?? '', log.type ?? '', log.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(log.tankId) ?? log.tankId ?? '', log.notes ?? '', log.operator ?? '', log.waterChangePercent, log.waterSource, log.impact, log.manualReadings?.dissolvedOxygen, log.manualReadings?.temperature, log.manualReadings?.ph, log.manualReadings?.salinity, log.manualReadings?.ammonia, log.manualReadings?.method]),
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
    setExpandedFormFilter(null);
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
    <View style={{ gap: uiScale.spacing[3] }}>
    <Title detail="Log operations and environmental events">Activity Logs</Title>
    <TankPicker horizontal />
    <ActivityLogActions role={user?.role ?? null} width={width} onOpen={openLog} />
    <View style={layout.cards}>
      <Card title="Filters" style={{ padding: uiScale.spacing[3] }}>
        <View style={{ gap: uiScale.spacing[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiScale.spacing[2] }}>
          <FilterDropdown label="Kind" summary={kindFilter === 'all' ? 'All kinds' : kindFilter === 'OPERATION' ? 'Operation' : kindFilter === 'ENVIRONMENT' ? 'Environment' : 'Alert resolution'} icon={<ListFilter size={14} color={colors.teal} />} triggerStyle={{ height: 38 }} singleLine options={[{ value: 'all', label: 'All kinds' }, { value: 'OPERATION', label: 'Operation' }, { value: 'ENVIRONMENT', label: 'Environment' }, { value: 'ALERT RESOLUTION', label: 'Alert resolution' }]} value={kindFilter} expanded={expandedFilter === 'kind'} onToggle={() => setExpandedFilter((current) => current === 'kind' ? null : 'kind')} onChange={(value) => { setKindFilter(value as ActivityLogKind | 'all'); setExpandedFilter(null); }} />
          <FilterDropdown label="Date range" summary={dateFrom || dateTo ? `${dateFrom || 'Any'} to ${dateTo || 'Any'}` : 'Any date'} icon={<CalendarDays size={14} color={colors.teal} />} triggerStyle={{ height: 38 }} singleLine expanded={expandedFilter === 'dates'} onToggle={() => setExpandedFilter((current) => current === 'dates' ? null : 'dates')}>
            <View style={[layout.dates, width < 600 && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ flex: 1, minWidth: 0 }}><CalendarFilterField label="From date (PHT)" value={dateFrom} onChangeText={setDateFrom} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><CalendarFilterField label="To date (PHT)" value={dateTo} onChangeText={setDateTo} /></View>
            </View>
          </FilterDropdown>
          </View>
        </View>
      </Card>
      <View style={{ gap: uiScale.spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2] }}>
          <View style={{ flex: 1, minWidth: 0, gap: uiScale.spacing[1] }}>
            <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700' }}>Activity Records</Text>
            <Text style={layout.label}>Times in PHT</Text>
          </View>
          {user?.role === 'admin' ? <Pressable accessibilityRole="button" accessibilityLabel={exportingLogs ? 'Preparing CSV' : 'Share CSV'} accessibilityState={{ disabled: exportingLogs || logs.isLoading || logs.isError || tanks.isLoading || Boolean(tanks.error) || filteredLogs.length === 0 }} disabled={exportingLogs || logs.isLoading || logs.isError || tanks.isLoading || Boolean(tanks.error) || filteredLogs.length === 0} onPress={() => void shareLogs()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, opacity: exportingLogs || logs.isLoading || logs.isError || tanks.isLoading || Boolean(tanks.error) || filteredLogs.length === 0 ? 0.5 : 1 }}><FileDown size={18} color={colors.teal} /></Pressable> : null}
        </View>
        {logs.isLoading || tanks.isLoading ? <StateMessage message="Loading activity logs…" loading /> : logs.isError ? <><StateMessage message={`Could not load activity logs: ${logs.error.message}`} /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></> : tanks.error ? <StateMessage message={`Could not load tanks: ${tanks.error.message}`} /> : filteredLogs.length === 0 ? <StateMessage message="No activity logs match the selected filters." spacious /> : <View style={{ gap: uiScale.spacing[2] + 2 }}>{filteredLogs.slice(0, 20).map((log) => <View key={log.id} style={{ padding: uiScale.spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.spacing[4], backgroundColor: colors.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2] }}>
            <View style={{ width: 36, height: 36, borderRadius: uiScale.radius.pill, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' }}>
              {log.kind === 'OPERATION' ? <ClipboardList size={16} color={colors.teal} /> : log.kind === 'ENVIRONMENT' ? <CloudSun size={16} color={colors.teal} /> : <CheckCircle2 size={16} color={colors.teal} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: uiScale.spacing[1] }}>
              <Text numberOfLines={2} style={{ color: colors.ink, fontWeight: '700' }}>{log.type ?? '—'}</Text>
              <Text numberOfLines={1} ellipsizeMode="tail" style={layout.label}>{log.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(log.tankId) ?? 'Unknown tank'} · {log.operator ?? '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', maxWidth: '40%', gap: uiScale.spacing[1] }}>
              <Chip label={String(log.kind ?? 'Activity').charAt(0).toUpperCase() + String(log.kind ?? 'Activity').slice(1).toLowerCase()} />
              <Text numberOfLines={1} style={layout.label}>{log.occurredAt && Number.isFinite(Date.parse(log.occurredAt)) ? formatManilaDateTime(log.occurredAt, { year: undefined }).replace(', ', ' · ') : 'Unavailable'}</Text>
            </View>
          </View>
          <Text style={{ color: colors.ink, marginTop: uiScale.spacing[2] }} numberOfLines={3}>{log.notes ?? '—'}</Text>
        </View>)}</View>}
      </View>
    </View>
    </View>
    {modalKind && (
      <Modal transparent visible onRequestClose={() => setModalKind(null)} statusBarTranslucent>
        <KeyboardAvoidingView style={layout.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close activity form" onPress={() => setModalKind(null)} style={[StyleSheet.absoluteFill, { backgroundColor: authColors.scrimBottom }]} />
          <View style={[layout.modalSheet, { maxHeight: Math.min(height * 0.85, height - insets.top - uiScale.spacing[5]) }]}>
          <ScrollView ref={logScrollRef} style={layout.modalScroll} contentContainerStyle={[layout.modalContent, { paddingBottom: insets.bottom + uiScale.spacing[4], paddingLeft: Math.max(insets.left, uiScale.spacing[4]), paddingRight: Math.max(insets.right, uiScale.spacing[4]) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets onFocusCapture={(event) => scrollFocusedInputIntoView(logScrollRef, event)}>
            <View style={{ width: 36, height: 4, alignSelf: 'center', borderRadius: uiScale.radius.pill, backgroundColor: colors.border }} />
            <View style={{ gap: uiScale.spacing[1] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2] }}>
                {modalKind === 'OPERATION' ? <ClipboardList size={20} color={colors.teal} /> : <CloudSun size={20} color={colors.teal} />}
                <Text style={[layout.modalTitle, { flexShrink: 1 }]}>{modalKind === 'OPERATION' ? 'Log Hatchery Operation' : 'Log Weather or Event'}</Text>
              </View>
              <Text style={layout.label}>Add an activity record for shift handover.</Text>
            </View>
            <View style={{ flexDirection: width < 360 ? 'column' : 'row', alignItems: width < 360 ? 'stretch' : 'flex-start', gap: uiScale.spacing[2] }}>
              <FilterDropdown label={modalKind === 'OPERATION' ? 'Tank or scope' : 'Event scope'} summary={scope === 'hatchery' ? 'Entire hatchery' : tanks.tanks.find((tank) => tank.id === scope)?.name ?? 'Unknown tank'} icon={<Droplets size={16} color={colors.teal} />} triggerStyle={{ height: 44, backgroundColor: colors.glassControl }} singleLine value={scope} expanded={expandedFormFilter === 'scope'} onToggle={() => setExpandedFormFilter((current) => current === 'scope' ? null : 'scope')} onChange={(value) => { setScope(value); setExpandedFormFilter(null); }} options={[{ value: 'hatchery', label: 'Entire hatchery' }, ...tanks.tanks.map((tank) => ({ value: tank.id, label: tank.name }))]} />
              <FilterDropdown label={modalKind === 'OPERATION' ? 'Operation type' : 'Event type'} summary={activityType || 'Select type'} icon={<ListFilter size={16} color={colors.teal} />} triggerStyle={{ height: 44, backgroundColor: colors.glassControl }} singleLine value={activityType} expanded={expandedFormFilter === 'type'} onToggle={() => setExpandedFormFilter((current) => current === 'type' ? null : 'type')} onChange={(value) => { setActivityType(value); setExpandedFormFilter(null); }} options={(modalKind === 'OPERATION' ? ACTIVITY_OPERATION_TYPES : ACTIVITY_EVENT_TYPES).map((type) => ({ value: type, label: type }))} />
            </View>
            {modalKind === 'OPERATION' && activityType === 'Water change / exchange' && <View style={layout.dates}>
              <View style={layout.modalField}><Text style={layout.label}>Water replaced (%)</Text><TextInput accessibilityLabel="Water replaced (%)" value={waterChangePercent} onChangeText={setWaterChangePercent} placeholder="e.g. 20" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={layout.modalInput} /></View>
              <View style={layout.modalField}><Text style={layout.label}>Water source (optional)</Text><TextInput accessibilityLabel="Water source (optional)" value={waterSource} onChangeText={setWaterSource} placeholder="e.g. treated reservoir" placeholderTextColor={colors.muted} style={layout.modalInput} /></View>
            </View>}
            {modalKind === 'ENVIRONMENT' && <FilterDropdown label="Observed impact" summary={impact || 'Select impact'} icon={<ListFilter size={16} color={colors.teal} />} triggerStyle={{ height: 44, backgroundColor: colors.glassControl }} singleLine value={impact} expanded={expandedFormFilter === 'impact'} onToggle={() => setExpandedFormFilter((current) => current === 'impact' ? null : 'impact')} onChange={(value) => { setImpact(value); setExpandedFormFilter(null); }} options={['Low', 'Moderate', 'High', 'Unknown'].map((value) => ({ value, label: value }))} />}
            <View style={layout.modalField}>
              <Text style={layout.label}>Notes</Text>
              <TextInput accessibilityLabel="Notes" placeholder={modalKind === 'OPERATION' ? 'What was done? Include observations or follow-up needed.' : 'When did it occur? What changed around the tank?'} style={[layout.modalInput, layout.modalNotes]} placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes} multiline numberOfLines={4} />
            </View>
            {formError ? <Text accessibilityRole="alert" style={layout.modalError}>{formError}</Text> : null}
            {createLog.isError && <Text accessibilityRole="alert" style={layout.modalError}>{createLog.error.message}</Text>}
            <View style={[layout.actions, width < 360 && layout.stackedActions]}>
              <Pressable accessibilityRole="button" onPress={() => setModalKind(null)} style={[layout.modalButton, width < 360 && { flex: 0 }, { backgroundColor: colors.glassControl }]}><Text style={layout.glassActionLabel}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={createLog.isPending} onPress={submitLog} style={[layout.modalButton, width < 360 && { flex: 0 }, { opacity: createLog.isPending ? 0.5 : 1 }]}><LinearGradient colors={primaryButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /><Text style={[layout.glassActionLabel, { color: colors.onPrimary }]}>{createLog.isPending ? 'Saving…' : 'Save entry'}</Text></Pressable>
            </View>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      <Card title="Log Calibration">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}><Button label="pH" secondary={parameter !== 'ph'} onPress={() => setParameter('ph')} /><Button label="DO" secondary={parameter !== 'do'} onPress={() => setParameter('do')} /></View>
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
      <Card title="Calibration Due Dates">
        {calibrationQuery.isLoading ? <StateMessage message="Loading calibrations…" loading /> : calibrationQuery.isError ? <><StateMessage message="Could not load calibrations." /><Button label="Retry" secondary onPress={() => void calibrationQuery.refetch()} /></> : !calibrationQuery.data?.length ? <StateMessage message="No calibration records." /> : calibrationQuery.data.map((log) => {
          const overdue = new Date(log.nextDue) < new Date();
          return <View key={log.id} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: overdue ? colors.critical : colors.ink, fontWeight: '700' }}>{formatMeasuredParameterLabel(log.parameter)} · {formatManilaDateTime(log.nextDue)} {overdue ? '· OVERDUE' : ''}</Text>
            <Text style={{ color: colors.muted }}>{log.standard} · Before: {log.before}, After: {log.after}</Text>
          </View>;
        })}
      </Card>
    )}
    <Card title="Measurement Thresholds">
      <Text style={{ color: colors.muted }}>Reference values only. Use Log calibration to record sensor calibration.</Text>
      {thresholdsQuery.isLoading ? <StateMessage message="Loading thresholds…" loading /> : thresholdsQuery.isError ? <><StateMessage message="Could not load thresholds." /><Button label="Retry" secondary onPress={() => void thresholdsQuery.refetch()} /></> : (['temperature', 'do', 'ph'] as const).map((param) => {
        const item = thresholdsQuery.data?.find((threshold) => threshold.parameter === param);
        const unit = param === 'temperature' ? '°C' : param === 'do' ? 'mg/L' : 'pH';
        return <View key={param} style={{ gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>{param === 'do' ? 'DO (mg/L)' : param === 'temperature' ? 'Temperature (°C)' : 'pH'}</Text>
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
  return <Card title="Field Water-Quality Entry">
    <Field label="Salinity (ppt)" value={salinity} onChangeText={setSalinity} keyboardType="numeric" placeholder="Optional" />
    <Field label="Ammonia (mg/L)" value={ammonia} onChangeText={setAmmonia} keyboardType="numeric" placeholder="Optional" />
    <Field label="Notes (required)" value={notes} onChangeText={setNotes} placeholder="At least 4 characters" />
    <Button label="Save field readings" disabled={mutation.isPending} onPress={() => mutation.mutate()} />
    {mutation.isError && <Text style={{ color: colors.critical }}>{mutation.error.message}</Text>}
  </Card>;
}

export function FieldEntryScreen() {
  return <Page>
    <Title detail="Record manual field water-quality measurements">Field Water-Quality Entry</Title>
    <TankPicker />
    <ManualEntryCard />
  </Page>;
}

export function HistoryScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const layout = createLogScreenStyles(colors);
  const { tanks, tankId, setTankId } = useTankSelection();
  const [visibleCount, setVisibleCount] = useState(5);
  const [parameter, setParameter] = useState<'all' | 'temperature' | 'do' | 'ph'>('all');
  const [sortKey, setSortKey] = useState<'timestamp' | MeasuredParameter>('timestamp');
  const [ascending, setAscending] = useState(false);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedFilter, setExpandedFilter] = useState<'tank' | 'dates' | 'parameter' | null>(null);
  const parameterOptions = [{ value: 'all', label: 'All Measured' }, { value: 'temperature', label: 'Temperature' }, { value: 'do', label: 'DO' }, { value: 'ph', label: 'pH' }] as const;
  const tankOptions = tanks.map((tank) => ({ value: tank.id, label: tank.name }));
  const tankLabel = tanks.find((tank) => tank.id === tankId)?.name ?? 'No tank selected';
  const parameterLabel = parameterOptions.find((option) => option.value === parameter)?.label ?? 'All measured';
  const query = useQuery({
    queryKey: ['history', tankId, from, to, parameter],
    queryFn: () => loadAllReadings(api, {
      tankId: tankId!,
      from: `${from}T00:00:00+08:00`,
      to: `${to}T23:59:59.999+08:00`,
    }),
    enabled: Boolean(tankId),
  });
  const parameterValue = (reading: Reading, param: 'do' | 'temperature' | 'ph') => param === 'do' ? reading.doMgL : reading[param];
  const rows = (query.data?.rows ?? []).filter((row) => parameter === 'all' || Number.isFinite(parameterValue(row, parameter))).sort((a, b) => {
    const difference = sortKey === 'timestamp' ? a.timestamp.localeCompare(b.timestamp) : parameterValue(a, sortKey) - parameterValue(b, sortKey);
    return ascending ? difference : -difference;
  });
  const visibleRows = rows.slice(0, visibleCount);
  useEffect(() => {
    setVisibleCount(5);
  }, [tankId, from, to, parameter, sortKey, ascending]);
  return <Page bottomPadding={tabBarHeight + uiScale.spacing[4]}>
    <Title>History</Title>
    <View style={layout.cards}>
      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, paddingHorizontal: uiScale.spacing[3] }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Filter by: ${tankLabel} · ${from} to ${to} · ${parameterLabel}`} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((open) => !open)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2] }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Filter by:</Text>{filtersOpen ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
        </Pressable>
        {filtersOpen && <View style={{ paddingBottom: uiScale.spacing[2], gap: uiScale.spacing[3] }}>
          <View style={{ flexDirection: width < 360 ? 'column' : 'row', alignItems: width < 360 ? 'stretch' : 'flex-start', gap: uiScale.spacing[2] }}>
          <FilterDropdown label="Tank" summary={tankLabel} icon={<Droplets size={14} color={colors.teal} />} options={tankOptions} value={tankId} expanded={expandedFilter === 'tank'} onToggle={() => setExpandedFilter((current) => current === 'tank' ? null : 'tank')} onChange={(value) => { setTankId(value); setVisibleCount(5); }} />
          <FilterDropdown label="Parameter" summary={parameterLabel} icon={<ListFilter size={14} color={colors.teal} />} options={parameterOptions} value={parameter} expanded={expandedFilter === 'parameter'} onToggle={() => setExpandedFilter((current) => current === 'parameter' ? null : 'parameter')} onChange={(value) => { const selected = parameterOptions.find((option) => option.value === value); if (selected) { setParameter(selected.value); setVisibleCount(5); } }} />
          </View>
          <FilterDropdown label="Date range" summary={`${from} to ${to}`} icon={<CalendarDays size={14} color={colors.teal} />} expanded={expandedFilter === 'dates'} onToggle={() => setExpandedFilter((current) => current === 'dates' ? null : 'dates')}>
            <View style={[layout.dates, width < 360 && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <CalendarFilterField label="From date (PHT)" value={from} onChangeText={(value) => { setFrom(value); setVisibleCount(5); }} />
              <CalendarFilterField label="To date (PHT)" value={to} onChangeText={(value) => { setTo(value); setVisibleCount(5); }} />
            </View>
          </FilterDropdown>
        </View>}
      </View>
      <Card title="Readings" style={{ width: '100%', minWidth: 0 }}>
        {!tankId ? <StateMessage message="No tank is selected." /> : query.isLoading ? <StateMessage message="Loading readings…" loading /> : query.isError ? <><StateMessage message={`Could not load readings: ${query.error.message}`} /><Button label="Retry" secondary onPress={() => void query.refetch()} /></> : <>
          <Text style={layout.count}>{rows.length} readings</Text>
          {query.data?.truncated && <Text accessibilityRole="alert" style={{ color: colors.warning }}>Some readings could not be loaded. Choose a shorter range for complete results.</Text>}
          <View style={{ width: '100%', minWidth: 0, gap: uiScale.spacing[3] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
              {([{ key: 'timestamp', label: 'Time' }, { key: 'temperature', label: 'Temperature' }, { key: 'do', label: 'DO' }, { key: 'ph', label: 'pH' }] as const).map(({ key, label }) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Sort by ${label}`} onPress={() => {
                if (sortKey === key) setAscending((value) => !value);
                else { setSortKey(key); setAscending(false); }
              }} style={{ minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: sortKey === key ? colors.teal : colors.border, borderRadius: uiScale.radius.pill, backgroundColor: sortKey === key ? colors.selected : colors.glassControl, paddingHorizontal: uiScale.spacing[3] }}><Text style={{ color: sortKey === key ? colors.teal : colors.ink, fontSize: uiScale.type.caption }}>{label}{sortKey === key ? ascending ? ' ↑' : ' ↓' : ''}</Text></Pressable>)}
            </View>
            {rows.length === 0 ? <StateMessage message="No readings match the selected filters." spacious /> : <View style={{ width: '100%', minWidth: 0, gap: uiScale.spacing[3] }}>
              <View style={{ width: '100%', minWidth: 0, gap: uiScale.spacing[3] }}>{visibleRows.map((row) => <RecordRow key={row.id}
                icon={<Activity size={20} color={colors.teal} />}
                title={`${formatManilaDateTime(row.timestamp)} PHT`}
                caption={tanks.find((tank) => tank.id === row.tankId)?.name ?? 'Unknown tank'}>
                <RecordMetrics items={[{ label: 'Temp °C', value: Number.isFinite(row.temperature) ? row.temperature.toFixed(2) : '—' }, { label: 'DO mg/L', value: Number.isFinite(row.doMgL) ? row.doMgL.toFixed(2) : '—' }, { label: 'pH', value: Number.isFinite(row.ph) ? row.ph.toFixed(2) : '—' }]} />
              </RecordRow>)}</View>
              {rows.length > visibleCount && <Button label="Load more" secondary onPress={() => setVisibleCount((count) => Math.min(rows.length, count + 5))} />}
            </View>}
          </View>
        </>}
      </Card>
    </View>
  </Page>;
}

function saveReportMetadata(report: ReportModel, reportType: ReportModel['format']) {
  void api.saveReport({
    id: report.id,
    reportType,
    tankIds: report.tanks.map((tank) => tank.id),
    rangeFrom: report.range.from,
    rangeTo: report.range.to,
  }).catch((error) => console.error('Could not save report metadata:', error));
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
  const [expandedFilter, setExpandedFilter] = useState<'dataset' | 'tanks' | 'sections' | null>(null);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const [sections, setSections] = useState<ReportSection[]>(['summary', 'statistics', 'alerts', 'raw-readings']);
  const [sharing, setSharing] = useState(false);
  const [downloadConfirmation, setDownloadConfirmation] = useState<'csv' | 'pdf' | null>(null);
  const [dataset, setDataset] = useState<ReportDataset>('readings');
  const datasetOptions: { value: ReportDataset; label: string }[] = [
    { value: 'readings', label: 'Raw readings' },
    { value: 'alerts', label: 'Alerts' },
    { value: 'activity', label: 'Activity logs' },
  ];
  if (canAccess(user?.role ?? null, 'canCalibrate')) datasetOptions.push({ value: 'calibration', label: 'Calibration log' });
  if (canAccess(user?.role ?? null, 'validation')) datasetOptions.push({ value: 'validation', label: 'Validation' });
  const sectionOptions: { value: ReportSection; label: string }[] = [
    { value: 'summary', label: 'Summary' },
    { value: 'statistics', label: 'Statistics' },
    { value: 'alerts', label: 'Alerts' },
    { value: 'raw-readings', label: 'Readings' },
  ];
  const selectedIds = selectedTanks === null
    ? tanks.some((tank) => tank.id === tankId) ? [tankId] : []
    : selectedTanks.filter((id) => tanks.some((tank) => tank.id === id));
  const selectedTankLabel = selectedIds.length === tanks.length && tanks.length > 0
    ? 'All tanks'
    : selectedIds.length === 1
      ? tanks.find((tank) => tank.id === selectedIds[0])?.name ?? '1 tank selected'
      : selectedIds.length > 1 ? `${selectedIds.length} tanks selected` : 'Select tanks';
  const selectedSectionCount = sections.length;
  const datasetLabel = datasetOptions.find((option) => option.value === dataset)?.label ?? 'Raw readings';
  const [reportId] = useState(() => generateReportId());
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(`${to}T23:59:59.999+08:00`);
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) &&
    getManilaDateString(start) === from && getManilaDateString(end) === to && start <= end;
  const preview = useQuery({
    queryKey: ['report-preview', user?.id, user?.role, selectedIds, from, to],
    enabled: validRange && selectedIds.length > 0 && Boolean(user),
    staleTime: 60_000,
    queryFn: async () => {
      const [readingResults, alerts, thresholds, activityLogs, calibrationLogs, validationRows] = await Promise.all([
        Promise.all(selectedIds.map((id) => loadAllReadings(api, {
          tankId: id,
          from: start.toISOString(),
          to: end.toISOString(),
        }))),
        Promise.all(selectedIds.map((id) => api.listAlerts(id))),
        listConfiguredThresholds(),
        api.listActivityLogs(),
        canAccess(user?.role ?? null, 'canCalibrate') ? api.listCalibrationLogs() : Promise.resolve([]),
        canAccess(user?.role ?? null, 'validation') ? Promise.all(selectedIds.map((id) => api.listValidationRows(id))).then((rows) => rows.flat()) : Promise.resolve([]),
      ]);
      return {
        readings: readingResults.flatMap((result) => result.rows),
        alerts: alerts.flat(),
        thresholds,
        activityLogs,
        calibrationLogs,
        validationRows,
        truncated: readingResults.some((result) => result.truncated) ||
          alerts.some((rows) => rows.length >= 1000) ||
          activityLogs.length >= 1000 ||
          calibrationLogs.length >= 1000 ||
          validationRows.length >= 1000,
      };
    },
  });
  const model = preview.data && validRange && selectedIds.length && user && selectedIds.every((id) => tanks.some((tank) => tank.id === id))
    ? buildReport({ tankIds: selectedIds, from: start.toISOString(), to: end.toISOString(), sections, format: 'pdf', generatedBy: { name: user.name, role: user.role } }, {
      tanks, ...preview.data, advisories: {}, deviceStatuses: [],
    }, undefined, reportId) : null;
  const datasetRows = model ? reportDatasetRows(model, dataset) : null;
  const matched = datasetRows ? datasetRows.length - 1 : preview.data ? 0 : null;
  async function shareReport() {
    setSharing(true);
    try {
      if (!user || !can(user.role, 'exportReports')) throw new Error('You do not have permission to export reports.');
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      if (!validRange) throw new Error('Enter a valid start and end date in YYYY-MM-DD format.');
      if (!selectedIds.length || !sections.length) throw new Error('Select at least one tank and report section.');
      const result = await preview.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Could not prepare report data.');
      const report = buildReport({ tankIds: selectedIds, from: start.toISOString(), to: end.toISOString(), sections, format: 'pdf', generatedBy: { name: user.name, role: user.role } }, {
        tanks, ...result.data, advisories: {}, deviceStatuses: [],
      }, undefined, reportId);
      saveReportMetadata(report, 'pdf');
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
      if (model) saveReportMetadata(model, 'csv');
      const fileUri = `${FileSystem.documentDirectory}hydrosense-${dataset}-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, toCsv(rows), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share HydroSense dataset' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share file.');
    } finally {
      setSharing(false);
    }
  }
  const exportDisabled = sharing || matched === null || matched === 0 || preview.isFetching;
  const reportDisabled = sharing || !model || preview.isFetching;
  const closeDownloadConfirmation = () => {
    if (!sharing) setDownloadConfirmation(null);
  };
  const confirmDownload = () => {
    const selectedDownload = downloadConfirmation;
    setDownloadConfirmation(null);
    if (selectedDownload === 'csv') void shareCsv();
    if (selectedDownload === 'pdf') void shareReport();
  };
  return <Page>
    <Title icon={<FileText size={23} color={colors.teal} />} detail="Choose data and report contents to download">Reports</Title>
    <Card title="Records Match" action={user && can(user.role, 'exportReports') ? <Pressable accessibilityRole="button" accessibilityLabel={`Download CSV for ${datasetLabel}`} accessibilityState={{ disabled: exportDisabled }} disabled={exportDisabled} onPress={() => setDownloadConfirmation('csv')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, opacity: exportDisabled ? 0.5 : 1 }}><FileDown size={18} color={colors.teal} /></Pressable> : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: uiScale.spacing[2] }}>
        <Text style={{ color: colors.ink, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{matched ?? '—'}</Text>
        <Text style={{ color: colors.muted }}>{dataset === 'readings' ? 'readings' : dataset === 'activity' ? 'activity logs' : datasetOptions.find((option) => option.value === dataset)?.label.toLowerCase() ?? dataset}</Text>
      </View>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>Period: {from} to {to} PHT</Text>
      <HatcheryPicker />
      <FilterDropdown label="CSV file data" summary={datasetLabel} icon={<Database size={14} color={colors.teal} />} options={datasetOptions} value={dataset} expanded={expandedFilter === 'dataset'} onToggle={() => setExpandedFilter((current) => current === 'dataset' ? null : 'dataset')} onChange={(value) => {
        const selected = datasetOptions.find((option) => option.value === value);
        if (selected) {
          setDataset(selected.value);
          setExpandedFilter(null);
        }
      }} />
      <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>CSV includes the selected dataset, tanks, and date range; report sections apply to the preview and PDF.</Text>
      {dataset === 'validation' && <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>Validation comparisons have no date field and cannot be filtered by period.</Text>}
      {tanksLoading ? <StateMessage message="Loading tanks…" loading /> : tanksError ? <><StateMessage message={`Could not load tanks: ${tanksError.message}`} /><Button label="Retry tank list" secondary onPress={refetchTanks} /></> : tanks.length === 0 ? <StateMessage message="No tanks are available for this account." /> : null}
      <View style={{ flexDirection: width < 360 ? 'column' : 'row', alignItems: width < 360 ? 'stretch' : 'flex-start', gap: uiScale.spacing[2] }}>
      {tanks.length > 0 && <FilterDropdown label="Tanks included in PDF" summary={selectedTankLabel} icon={<Droplets size={14} color={colors.teal} />} expanded={expandedFilter === 'tanks'} onToggle={() => setExpandedFilter((current) => current === 'tanks' ? null : 'tanks')}>
        <View style={{ gap: uiScale.spacing[2] }}>
          {tanks.map((tank) => <ReportChoice key={tank.id} kind="checkbox" label={tank.name} selected={selectedIds.includes(tank.id)} onPress={() => setSelectedTanks((current) => {
            const existing = (current ?? (tankId ? [tankId] : [])).filter((id) => tanks.some((available) => available.id === id));
            return existing.includes(tank.id) ? existing.filter((id) => id !== tank.id) : [...existing, tank.id];
          })} />)}
        </View>
      </FilterDropdown>}
      <FilterDropdown label="PDF report sections" summary={selectedSectionCount ? `${selectedSectionCount} selected` : 'Select sections'} icon={<ListFilter size={14} color={colors.teal} />} expanded={expandedFilter === 'sections'} onToggle={() => setExpandedFilter((current) => current === 'sections' ? null : 'sections')}>
        <View style={{ gap: uiScale.spacing[2] }}>
          {sectionOptions.map(({ value, label }) => <ReportChoice key={value} kind="checkbox" label={label} selected={sections.includes(value)} onPress={() => setSections((current) => current.includes(value) ? current.filter((section) => section !== value) : [...current, value])} />)}
        </View>
      </FilterDropdown>
      </View>
      <View style={{ gap: uiScale.spacing[2] }}>
        <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700' }}>Date Range</Text>
        <View style={{ flexDirection: width < 360 ? 'column' : 'row', alignItems: width < 360 ? 'stretch' : 'flex-start', gap: uiScale.spacing[2] }}>
          <View style={{ flex: 1, minWidth: 0 }}><CalendarFilterField label="From date (PHT)" value={from} onChangeText={setFrom} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><CalendarFilterField label="To date (PHT)" value={to} onChangeText={setTo} /></View>
        </View>
      </View>
    </Card>
    {sections.includes('statistics') && <Card title="Readings in Range">
      <Text style={{ color: colors.muted }}>Percentage of valid readings within configured thresholds</Text>
      {!tanks.length ? <StateMessage message="No tanks are available for this hatchery." /> : !validRange || !selectedIds.length ? <StateMessage message="Select a tank and valid dates to view the analysis." /> : preview.isLoading || preview.isFetching ? <StateMessage message="Preparing analysis…" loading /> : preview.isError ? null : model?.statistics.map((stat) => <View key={stat.parameter} style={{ gap: 5, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.ink }}>{stat.parameter === 'temperature' ? 'Temperature' : stat.parameter === 'do' ? 'DO' : 'pH'}</Text><Text style={{ color: colors.ink }}>{stat.percentInRange === null ? 'No data' : `${stat.percentInRange.toFixed(1)}%`}</Text></View>
        <View style={{ height: 16, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}><View style={{ height: '100%', width: `${stat.percentInRange ?? 0}%`, backgroundColor: '#087c78' }} /></View>
      </View>)}
    </Card>}
    <Card title="Report Preview" action={user && can(user.role, 'exportReports') ? <Pressable accessibilityRole="button" accessibilityLabel="Print or save PDF report" accessibilityState={{ disabled: reportDisabled }} disabled={reportDisabled} onPress={() => setDownloadConfirmation('pdf')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, opacity: reportDisabled ? 0.5 : 1 }}><Printer size={18} color={colors.teal} /></Pressable> : undefined}>
      {!validRange ? <StateMessage message="Enter a valid start and end date." /> : !tanks.length ? <StateMessage message="No tanks are available for this hatchery." /> : !selectedIds.length ? <StateMessage message="Select a tank to generate the report." /> : preview.isLoading ? <StateMessage message="Preparing report…" loading /> : preview.isError ? <><StateMessage message={preview.error instanceof Error ? preview.error.message : 'Could not prepare report.'} /><Button label="Retry" secondary onPress={() => void preview.refetch()} /></> : model && <>
        <View style={{ gap: uiScale.spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: uiScale.spacing[2] }}><Text style={{ color: colors.ink, fontWeight: '700', flexShrink: 1 }}>Report ID</Text><Text selectable style={{ flex: 1, minWidth: 0, color: colors.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right' }}>{model.id}</Text></View>
          <DataRow label="Prepared by" value={`${model.generatedBy.name} (${model.generatedBy.role})`} />
          <DataRow label="Period" value={`${from} to ${to} PHT`} />
          <View style={{ gap: uiScale.spacing[1], paddingVertical: uiScale.spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700' }}>Tanks</Text>
            {model.tanks.map((tank, index) => <View key={tank.id} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], borderTopWidth: index ? 1 : 0, borderColor: colors.border, paddingVertical: uiScale.spacing[1] }}>
              <View style={{ flex: 1, minWidth: 0, gap: uiScale.spacing[1] }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{tank.name}</Text><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{hatcheryLabel(tank.site)}</Text></View>
            </View>)}
          </View>
          <DataRow label="Generated" value={`${formatManilaDateTime(model.generatedAt)} PHT`} />
        </View>
        {sections.includes('summary') && <View style={{ borderLeftWidth: 3, borderLeftColor: colors.teal, backgroundColor: colors.glassControl, padding: uiScale.spacing[3] }}><Text style={{ color: colors.ink }}>{model.summary}</Text></View>}
        {sections.includes('statistics') && <ScrollView horizontal accessibilityLabel="Report statistics table">
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[2] }}>
              {['Parameter', 'Min', 'Max', 'Mean', 'Std dev', 'In range', 'Excursions', 'Longest (h)'].map((value, index) => <Text key={value} style={[caption, { width: index === 0 ? 110 : 92, textAlign: index ? 'right' : 'left' }]}>{value}</Text>)}
            </View>
            {model.statistics.map((row) => <View key={row.parameter} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: uiScale.spacing[3] }}>
              <Text style={{ color: colors.ink, width: 110 }}>{formatMeasuredParameterLabel(row.parameter)}</Text>
              {[row.min?.toFixed(2) ?? '—', row.max?.toFixed(2) ?? '—', row.mean?.toFixed(2) ?? '—', row.standardDeviation?.toFixed(2) ?? '—', row.percentInRange == null ? '—' : `${row.percentInRange.toFixed(1)}%`, String(row.excursions), row.longestExcursionHours.toFixed(1)].map((value, index) => <Text key={index} style={[numeric, { width: 92 }]}>{value}</Text>)}
            </View>)}
          </View>
        </ScrollView>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[3] }}>
          {sections.includes('alerts') && <View style={summaryTile}><Text style={caption}>Alerts</Text><Text style={{ color: colors.ink }}>{model.alertCounts.critical} critical · {model.alertCounts.warning} warning · {model.alertCounts.open} open · {model.alertCounts.acknowledged} acknowledged · {model.alertCounts.resolved} resolved</Text></View>}
          <View style={{ flexBasis: '100%', gap: uiScale.spacing[2] }}>
            <View style={[summaryTile, { flexBasis: '100%' }]}><Text style={caption}>Thresholds Used</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[1] }}>{model.thresholds.map((threshold) => <Chip key={threshold.parameter} label={`${formatMeasuredParameterLabel(threshold.parameter)} ${threshold.min ?? '—'}–${threshold.max ?? '—'}`} />)}</View></View>
            <View style={[summaryTile, { flexBasis: '100%' }]}><Text style={caption}>Expected Reading</Text><Text style={{ color: colors.ink }}>Expected {model.dataQuality.expectedReadings} · Received {model.dataQuality.receivedReadings} ({model.dataQuality.receivedPercent.toFixed(1)}%)</Text></View>
          </View>
          <View style={summaryTile}><Text style={caption}>Activity logs</Text><Text style={numeric}>{model.activityLogs.length}</Text></View>
          {canAccess(user?.role ?? null, 'canCalibrate') && <View style={summaryTile}><Text style={caption}>Calibration</Text><Text style={numeric}>{model.calibrationLogs.length}</Text></View>}
          {canAccess(user?.role ?? null, 'validation') && <View style={summaryTile}><Text style={caption}>Validation</Text><Text style={numeric}>{model.validationRows.length}</Text></View>}
        </View>
        {sections.includes('raw-readings') && <View style={{ gap: uiScale.spacing[3] }}>
          <Text style={caption}>Showing first {Math.min(10, model.rawReadings.length)} of {model.rawReadings.length} readings</Text>
          {model.rawReadings.slice(0, 10).map((row) => <RecordRow key={row.id} icon={<Activity size={20} color={colors.teal} />} title={formatManilaDateTime(row.timestamp)} caption={model.tanks.find((tank) => tank.id === row.tankId)?.name ?? 'Unknown tank'}>
            <RecordMetrics items={[{ label: 'Temp °C', value: row.temperature.toFixed(2) }, { label: 'DO mg/L', value: row.doMgL.toFixed(2) }, { label: 'pH', value: row.ph.toFixed(2) }]} />
          </RecordRow>)}
        </View>}
        {user && !can(user.role, 'exportReports') && <Text style={{ color: colors.muted }}>Operators may view reports; export is available to managers and administrators.</Text>}
      </>}
    </Card>
    <GlassDialog solid visible={downloadConfirmation !== null} onDismiss={closeDownloadConfirmation}>
      <Dialog.Title style={{ marginTop: 24, color: colors.ink }}>{downloadConfirmation === 'csv' ? `Download CSV File for ${datasetLabel}?` : 'Print / Save PDF Report?'}</Dialog.Title>
      <Dialog.Content>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>
          {downloadConfirmation === 'csv'
            ? `This file will contain ${datasetLabel} for ${selectedTankLabel}, from ${from} to ${to} PHT.`
            : `This report will include ${selectedTankLabel} and the selected PDF report sections for ${from} to ${to} PHT.`}
        </Text>
      </Dialog.Content>
      <Dialog.Actions style={{ justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Pressable accessibilityRole="button" disabled={sharing} onPress={closeDownloadConfirmation} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={sharing} onPress={confirmDownload} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: uiScale.radius.pill, backgroundColor: colors.teal, opacity: sharing ? 0.5 : 1 }}><Text style={{ color: colors.surface, fontWeight: '700' }}>{downloadConfirmation === 'csv' ? 'Download CSV' : 'Continue to PDF'}</Text></Pressable>
      </Dialog.Actions>
    </GlassDialog>
  </Page>;
}

export function ConnectionNotice({ online }: { online: boolean }) {
  const { colors } = useTheme();
  if (online) return null;
  return <View style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 100, backgroundColor: colors.offline, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.warning, fontWeight: '800' }}>Offline · showing cached data when available</Text></View>;
}
