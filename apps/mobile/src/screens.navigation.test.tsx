import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toByteArray } from 'base64-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  allTanks: [] as Array<{ id: string; name: string; site: string; deviceId: string; rearingStartDate: string }>,
  role: 'manager' as 'operator' | 'manager' | 'admin',
  values: [] as unknown[],
  index: 0,
  queries: [] as string[],
  profile: { site: 'camiguin-sagay' as string | null },
  profileError: null as Error | null,
  mutations: [] as Array<{ mutationFn: (...args: never[]) => Promise<unknown>; onSuccess?: (value: never) => Promise<void> }>,
  createTank: vi.fn(),
  setTankId: vi.fn(),
  selectedTank: null as null | { id: string; name: string; site: string; deviceId: string; rearingStartDate: string },
  additionalTanks: [] as Array<{ id: string; name: string; site: string; deviceId: string; rearingStartDate: string }>,
  hatchery: 'all',
  queryOptions: [] as Array<{ queryKey: unknown[]; queryFn: () => Promise<unknown>; enabled?: boolean }>,
  queryData: {} as Record<string, unknown>,
  listReadings: vi.fn(),
  shareAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: () => undefined,
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = typeof initial === 'function' ? initial() : initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
}));
vi.mock('react-native', () => ({
  Alert: {}, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text',
  TextInput: 'TextInput', View: 'View', StyleSheet: { create: (styles: object) => styles },
  Platform: { OS: 'android' },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('@react-native-community/netinfo', () => ({ default: {} }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('react-native-paper', () => ({ Dialog: { Title: 'DialogTitle', Content: 'DialogContent', Actions: 'DialogActions' }, Portal: 'Portal' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: string[]; queryFn: () => Promise<unknown>; enabled?: boolean }) => {
    const { queryKey } = options;
    state.queryOptions.push(options);
    state.queries.push(queryKey[0]);
    return queryKey[0] === 'profile'
      ? { data: state.profile, isLoading: false, isError: Boolean(state.profileError), error: state.profileError, refetch: vi.fn() }
      : { data: state.queryData[queryKey[0]] ?? [], isLoading: false, isError: false, refetch: vi.fn() };
  },
  useMutation: (options: typeof state.mutations[number]) => {
    state.mutations.push(options);
    return { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('lucide-react-native', () => Object.fromEntries([
  'Activity', 'AlertCircle', 'AlertTriangle', 'CalendarDays', 'CheckCircle2', 'ChevronDown', 'ChevronRight', 'ChevronUp',
  'ClipboardList', 'Database', 'Droplets', 'Eye', 'FileDown', 'FileText', 'ListFilter', 'MapPin','Maximize2', 'MessageCircle',
  'MoreHorizontal', 'Plus', 'Printer', 'Trash2', 'UserRound', 'Users', 'Waves', 'Wifi',
].map((name) => [name, name])));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file://documents/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: state.writeAsStringAsync }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: state.shareAsync }));
vi.mock('./services/client', () => ({ api: { createTank: state.createTank, listReadings: state.listReadings }, getAccountProfile: vi.fn(), getConfiguredThreshold: (_thresholds: unknown, parameter: string) => ({ parameter }), listConfiguredThresholds: vi.fn() }));
vi.mock('./state', () => ({
  useSession: () => ({ user: { id: 'user', name: 'Test User', role: state.role } }),
  useTankSelection: () => ({ tanks: [...(state.selectedTank ? [state.selectedTank] : []), ...state.additionalTanks], tankId: state.selectedTank?.id, allTanks: state.allTanks, hatchery: state.hatchery, setTankId: state.setTankId, isLoading: false, error: null }),
}));
vi.mock('./theme', () => ({ uiScale: { radius: { pill: 999 }, spacing: [0, 4, 8, 12, 16], type: { body: 14 } }, useTheme: () => ({ colors: {} }) }));
vi.mock('./components/ui', () => ({
  Button: 'Button', CalendarFilterField: 'CalendarFilterField', Card: 'Card', Chip: 'Chip', DataRow: 'DataRow', Page: 'Page', RecordRow: 'RecordRow', RecordMetrics: 'RecordMetrics', StateMessage: 'StateMessage', Title: 'Title',
  GlassDialog: 'GlassDialog', RedesignedContext: {},
}));
vi.mock('./components/AlertFilters', () => ({ AlertFilters: 'AlertFilters' }));
vi.mock('./components/HatcheryPicker', () => ({ HatcheryPicker: 'HatcheryPicker' }));
vi.mock('./components/RangeBar', () => ({ RangeBar: 'RangeBar' }));
vi.mock('./components/TrendChart', () => ({ TrendChart: 'TrendChart' }));
vi.mock('./components/TrendFilters', () => ({ TrendFilters: 'TrendFilters' }));
vi.mock('./components/ActivityLogActions', () => ({ ActivityLogActions: 'ActivityLogActions' }));
vi.mock('./components/FilterDropdown', () => ({ FilterDropdown: 'FilterDropdown' }));
vi.mock('./components/ReportChoice', () => ({ ReportChoice: 'ReportChoice' }));
vi.mock('./services/reportFiles', () => ({ reportDatasetRows: () => [[]] }));

import { AlertDetailScreen, AlertsScreen, HistoryScreen, HomeScreen, MoreScreen, ReportsScreen, StatusScreen, TanksScreen, TrendsScreen } from './screens';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './navigation';

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}

const navigate = vi.fn();
const props = { navigation: { navigate }, route: { key: 'test', name: 'More' } } as unknown as BottomTabScreenProps<MainTabParamList, 'More'>;
const renderTanks = () => {
  state.index = 0;
  state.mutations = [];
  return TanksScreen(props as unknown as BottomTabScreenProps<MainTabParamList, 'Tanks'>);
};

beforeEach(() => {
  state.role = 'manager';
  state.values = [];
  state.index = 0;
  state.queries = [];
  state.mutations = [];
  state.queryOptions = [];
  state.queryData = {};
  state.selectedTank = null;
  state.additionalTanks = [];
  state.hatchery = 'all';
  state.allTanks = [];
  state.listReadings.mockReset();
  state.writeAsStringAsync.mockReset();
  state.shareAsync.mockReset();
  state.profile = { site: 'camiguin-sagay' };
  state.profileError = null;
  state.createTank.mockReset();
  state.setTankId.mockReset();
  navigate.mockReset();
});

describe('monitoring and report views', () => {
  const tank = { id: 'tank-a', name: 'Tank Alpha', site: 'Sagay', deviceId: 'device-a', rearingStartDate: '2024-01-01' };
  const reading = { id: 'reading', tankId: tank.id, timestamp: '2024-01-01T00:00:00Z', temperature: 28, doMgL: 5, ph: 7 };
  const device = { deviceId: tank.deviceId, online: true, lastSeen: '2024-01-01T00:00:00Z', wifiRssi: -60, pendingSyncCount: 3, reportedFields: ['wifiRssi', 'pendingSyncCount'] };
  const alert = { id: 'alert', tankId: tank.id, parameter: 'temperature', value: 32, threshold: '30', severity: 'critical', status: 'resolved', createdAt: '2024-01-02T01:48:00Z', acknowledgedAt: '2024-01-02T02:48:00Z' };
  beforeEach(() => {
    state.selectedTank = tank;
    state.allTanks = [tank];
    state.queryData = { 'latest-reading': reading, 'configured-thresholds': [], 'device-statuses': [device], alerts: [] };
  });
  const renderHome = () => HomeScreen(props as unknown as BottomTabScreenProps<MainTabParamList, 'Home'>);
  const textValues = (nodes: ReactElement<Record<string, unknown>>[]) => nodes.filter((node) => node.type === 'Text').map((node) => node.props.children);

  it('shows stale or invalid banners directly after the selector and default device telemetry', () => {
    state.values = [Date.parse('2024-01-02T00:00:00Z'), null];
    let screen = elements(renderHome());
    expect(textValues(screen)).toContain('Reading status unavailable while offline');
    expect(textValues(screen)).toContain('Last reading 24 h ago.');
    expect(screen.filter((node) => node.type === 'Card').map((node) => node.props.title)).not.toContain('Last Update');
    const connection = screen.find((node) => node.type === 'Card' && node.props.title === 'Device Connection')!;
    expect(elements(connection).filter((node) => node.type === 'DataRow').map((node) => [node.props.label, node.props.value])).toEqual([
      ['Connection', 'Online'], ['Wi-Fi', '-60 dBm'], ['Last report', expect.stringContaining('PHT')], ['Pending sync', '3'],
    ]);
    state.index = 0;
    state.values = [Date.parse(reading.timestamp), null];
    state.queryData['latest-reading'] = { ...reading, ph: 20 };
    screen = elements(renderHome());
    expect(textValues(screen)).toContain('Check probe: invalid sensor reading');
    state.index = 0;
    state.queryData['latest-reading'] = reading;
    expect(textValues(elements(renderHome()))).not.toContain('Check probe: invalid sensor reading');
  });

  it('shows the latest four tank alerts and navigates to all alerts', () => {
    state.queryData.alerts = [0, 1, 2, 3, 4].map((index) => ({ ...alert, id: `${index}`, createdAt: `2024-01-0${index + 1}T00:00:00Z` }));
    const card = elements(renderHome()).find((node) => node.type === 'Card' && node.props.title === 'Recent Alerts')!;
    expect(elements(card).filter((node) => typeof node.type === 'function' && node.type.name === 'SeverityBadge')).toHaveLength(4);
    const action = card.props.action as ReactElement<{ onPress: () => void }>;
    action.props.onPress();
    expect(navigate).toHaveBeenCalledWith('Alerts');
    state.index = 0;
    state.queryData.alerts = [];
    expect(elements(renderHome()).some((node) => node.type === 'StateMessage' && node.props.message === 'No alerts are recorded for this tank.')).toBe(true);
  });

  it('lists tanks with no device status and totals only reported pending counts', () => {
    state.additionalTanks = [{ ...tank, id: 'tank-b', name: 'Tank Beta', deviceId: '' }];
    const screen = elements(StatusScreen());
    const overview = screen.find((node) => node.type === 'Card' && node.props.title === 'Overview')!;
    expect(elements(overview).find((node) => node.type === 'DataRow' && node.props.label === 'Pending offline records')?.props.value).toBe('3');
    const missing = screen.find((node) => node.type === 'Card' && node.props.title === 'Tank Beta')!;
    expect(elements(missing).filter((node) => node.type === 'DataRow').map((node) => node.props.value)).toEqual(['No device assigned', 'Never reported', 'Unavailable', 'Unavailable']);
  });

  it('shows tank names, timeline response timestamps and notes in alert details', () => {
    state.queryData['alert-detail'] = alert;
    state.queryData['alert-responses'] = [{ id: 'response', status: 'resolved', createdAt: '2024-01-02T03:48:00Z', createdBy: 'User', note: 'Checked probe' }];
    const screen = elements(AlertDetailScreen({ route: { params: { alertId: 'alert' } } } as never));
    const text = textValues(screen);
    expect(text).toContain('Tank Alpha');
    expect(text).toContain('Jan 2, 2024 · 09:48 PHT');
    expect(text).toContain('Jan 2, 2024 · 11:48 PHT');
    expect(text).toContain('Checked probe');
    state.index = 0;
    state.allTanks = [];
    expect(textValues(elements(AlertDetailScreen({ route: { params: { alertId: 'alert' } } } as never)))).toContain('Unknown tank');
  });

  it('keeps a selectable report ID stable across preview updates and shows the tank site', () => {
    state.queryData['report-preview'] = { readings: [], alerts: [], thresholds: [], activityLogs: [], calibrationLogs: [], validationRows: [] };
    let screen = elements(ReportsScreen());
    const id = screen.find((node) => node.type === 'Text' && node.props.selectable);
    expect(id?.props.children).toMatch(/^RPT-\d{8}-[A-HJ-NP-Z2-9]{6}$/);
    expect(textValues(screen)).toContain('Tank Alpha');
    expect(textValues(screen)).toContain('Camiguin, Sagay Multispecies Hatchery');
    state.index = 0;
    state.values[2] = '2024-01-01';
    screen = elements(ReportsScreen());
    expect(screen.find((node) => node.type === 'Text' && node.props.selectable)?.props.children).toBe(id?.props.children);
  });
});

describe('trends and history readings', () => {
  const reading = { id: 'r1', tankId: 'tank-a', timestamp: '2024-01-02T00:00:00+08:00', temperature: 28, doMgL: 5, ph: 7 };
  beforeEach(() => {
    state.selectedTank = { id: 'tank-a', name: 'Tank A', site: 'site', deviceId: 'device', rearingStartDate: '2024-01-01' };
    state.queryData = { 'mobile-trends': { rows: [reading], truncated: false }, history: { rows: [reading], truncated: false }, 'mobile-trend-alerts': [], 'configured-thresholds': [] };
  });

  it('uses the paginated loader and both range boundaries in trend and history queries', async () => {
    state.listReadings.mockResolvedValue([reading]);
    TrendsScreen();
    const trends = state.queryOptions.find((query) => query.queryKey[0] === 'mobile-trends')!;
    expect(trends.queryKey).toHaveLength(4);
    await trends.queryFn();
    expect(state.listReadings).toHaveBeenLastCalledWith(expect.objectContaining({ tankId: 'tank-a', from: trends.queryKey[2], to: trends.queryKey[3], limit: 2000 }));
    state.index = 0;
    state.values = [];
    HistoryScreen();
    const history = state.queryOptions.find((query) => query.queryKey[0] === 'history')!;
    await history.queryFn();
    expect(state.listReadings).toHaveBeenLastCalledWith(expect.objectContaining({ tankId: 'tank-a', to: `${history.queryKey[3]}T23:59:59.999+08:00`, limit: 2000 }));
  });

  it('rejects invalid custom dates and exposes the bounded fields', () => {
    state.values = [0, '2026-02-30', '2026-03-01'];
    const screen = elements(TrendsScreen());
    expect(state.queryOptions.find((query) => query.queryKey[0] === 'mobile-trends')?.enabled).toBe(false);
    expect(screen.some((item) => item.type === 'StateMessage' && String(item.props.message).includes('valid dates'))).toBe(true);
  });

  it('shares the selected readings as CSV and warns instead of exporting incomplete data', async () => {
    const filters = elements(TrendsScreen()).find((item) => item.type === 'TrendFilters')!;
    const action = filters.props.action as ReactElement<{ onPress: () => Promise<void>; disabled: boolean; accessibilityLabel: string }>;
    expect(action.props.accessibilityLabel).toBe('Export CSV');
    expect(action.props.disabled).toBe(false);
    await action.props.onPress();
    await vi.waitFor(() => expect(state.shareAsync).toHaveBeenCalledOnce());
    const encoded = state.writeAsStringAsync.mock.calls[0][1] as string;
    expect(Array.from(toByteArray(encoded), (byte) => String.fromCharCode(byte)).join('')).toContain('"Time PHT","Temperature","DO","pH"');
    state.index = 0;
    state.queryData['mobile-trends'] = { rows: [reading], truncated: true };
    const screen = elements(TrendsScreen());
    expect(screen.some((item) => item.type === 'Text' && String(item.props.children).includes('incomplete'))).toBe(true);
    const disabledAction = screen.find((item) => item.type === 'TrendFilters')!.props.action as ReactElement<{ disabled: boolean }>;
    expect(disabledAction.props.disabled).toBe(true);
  });

  it('displays the expanded statistics and the four trend summaries', () => {
    state.values = [0, '2024-01-01', '2024-01-03', 'do', false];
    state.queryData['mobile-trend-alerts'] = [
      { createdAt: '2024-01-02T22:00:00+08:00', severity: 'warning' },
      { createdAt: '2024-01-02T23:00:00+08:00', severity: 'critical' },
      { createdAt: '2024-01-04T00:00:00+08:00', severity: 'critical' },
    ];
    const screen = elements(TrendsScreen());
    const titles = screen.filter((item) => item.type === 'Card').map((item) => item.props.title);
    expect(titles).toEqual(expect.arrayContaining(['Range Statistics', 'Overnight vs Daytime', 'Rearing Day View', 'Alert Frequency']));
    expect(titles.indexOf('Range Statistics')).toBeLessThan(titles.indexOf('Temperature · °C'));
    const charts = screen.filter((item) => item.type === 'TrendChart');
    expect(charts.map((chart) => (chart.props.parameter as { key: string }).key)).toEqual(['temperature', 'do', 'ph', 'do']);
    expect(charts[3].props.expanded).toBe(true);
    const text = screen.filter((item) => item.type === 'Text').map((item) => item.props.children);
    expect(text).toContain('Latest valid');
    expect(text).toContain('Longest excursion (h)');
    expect(text).toContain('Missing samples');
    expect(text.some((item) => Array.isArray(item) && item.join('').includes('1 warning · 1 critical'))).toBe(true);
  });

  it('keeps the history count, rows and load-more control inside the readings card', () => {
    state.queryData.history = { rows: Array.from({ length: 7 }, (_, index) => ({ ...reading, id: String(index) })), truncated: false };
    const card = elements(HistoryScreen()).find((item) => item.type === 'Card' && item.props.title === 'Readings')!;
    const content = elements(card);
    expect(content.some((item) => item.type === 'Text' && Array.isArray(item.props.children) && item.props.children.join('') === '7 readings')).toBe(true);
    expect(content.filter((item) => item.type === 'RecordRow')).toHaveLength(5);
    expect(content.some((item) => item.type === 'Button' && item.props.label === 'Load more')).toBe(true);
  });
});

describe('mobile navigation', () => {
  it.each(['operator', 'manager', 'admin'] as const)('shows only permitted management destinations for %s', (role) => {
    state.role = role;
    const screen = elements(MoreScreen(props));
    const users = screen.find((item) => item.type === 'Pressable' && elements(item).some((child) => child.type === 'Text' && child.props.children === 'Users & Roles'));
    const audit = screen.find((item) => item.type === 'Pressable' && elements(item).some((child) => child.type === 'Text' && child.props.children === 'Audit & System Logs'));
    expect(Boolean(users)).toBe(role !== 'operator');
    expect(Boolean(audit)).toBe(role === 'admin');
    if (users) {
      (users.props.onPress as () => void)();
      expect(navigate).toHaveBeenCalledWith('Users');
    }
    if (audit) {
      (audit.props.onPress as () => void)();
      expect(navigate).toHaveBeenCalledWith('AuditLogs');
    }
  });

  it('does not load or display pending requests on alerts', () => {
    state.role = 'admin';
    const screen = elements(AlertsScreen(props as unknown as BottomTabScreenProps<MainTabParamList, 'Alerts'>));
    expect(state.queries).not.toContain('pending-accounts');
    expect(screen.some((item) => item.type === 'Card' && item.props.title === 'Account Requests')).toBe(false);
  });
});

describe('tank registration', () => {
  it.each(['manager', 'admin'] as const)('opens the registration form for %s', (role) => {
    state.role = role;
    const open = elements(renderTanks()).find((item) => item.type === 'Button' && item.props.label === 'Register tank');
    (open?.props.onPress as () => void)();
    const modal = elements(renderTanks()).find((item) => item.type === 'Modal');
    expect(modal?.props.visible).toBe(true);
  });

  it('does not offer tank registration to operators', () => {
    state.role = 'operator';
    const buttons = elements(renderTanks()).filter((item) => item.type === 'Button' && item.props.label === 'Register tank');
    expect(buttons).toHaveLength(1);
    expect(elements(renderTanks()).find((item) => item.type === 'Modal')?.props.visible).toBe(false);
  });

  it('uses the manager’s assigned hatchery when submitting and selects the created tank', async () => {
    state.values = [true, '  Tank 1 ', '', '2026-01-02', ' HS-1 ', null];
    renderTanks();
    state.createTank.mockResolvedValue({ id: 'new-tank' });
    const tank = await state.mutations[0].mutationFn();
    expect(state.createTank).toHaveBeenCalledWith({ name: 'Tank 1', site: 'camiguin-sagay', rearingStartDate: '2026-01-02', deviceId: 'HS-1' }, 'Test User');
    await state.mutations[0].onSuccess?.(tank as never);
    expect(state.setTankId).toHaveBeenCalledWith('new-tank');
  });

  it('requires an assigned hatchery for managers and accepts an administrator-entered site', async () => {
    state.values = [true, 'Tank 1', 'Benoni', '2026-01-02', 'HS-1', null];
    state.profile.site = null;
    renderTanks();
    await expect(state.mutations[0].mutationFn()).rejects.toThrow('no assigned hatchery');
    state.role = 'admin';
    renderTanks();
    await state.mutations[0].mutationFn();
    expect(state.createTank).toHaveBeenCalledWith(expect.objectContaining({ site: 'Benoni' }), 'Test User');
  });

  it('shows profile errors and disables submission until the hatchery can be loaded', () => {
    state.values = [true];
    state.profileError = new Error('Offline');
    const screen = elements(renderTanks());
    expect(screen.some((item) => item.type === 'StateMessage' && String(item.props.message).includes('Offline'))).toBe(true);
    const submit = screen.filter((item) => item.type === 'Button' && item.props.label === 'Register tank')[1];
    expect(submit.props.disabled).toBe(true);
  });

  it('rejects invalid dates without sending a registration request', async () => {
    state.values = [true, 'Tank 1', '', '2026-02-30', 'HS-1', null];
    renderTanks();
    await expect(state.mutations[0].mutationFn()).rejects.toThrow('valid rearing start date');
    expect(state.createTank).not.toHaveBeenCalled();
  });
});
