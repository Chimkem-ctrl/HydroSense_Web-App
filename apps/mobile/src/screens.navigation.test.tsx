import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'manager' as 'operator' | 'manager' | 'admin',
  values: [] as unknown[],
  index: 0,
  queries: [] as string[],
  profile: { site: 'camiguin-sagay' as string | null },
  profileError: null as Error | null,
  mutations: [] as Array<{ mutationFn: (...args: never[]) => Promise<unknown>; onSuccess?: (value: never) => Promise<void> }>,
  createTank: vi.fn(),
  setTankId: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: () => undefined,
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = typeof initial === 'function' ? initial() : initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
}));
vi.mock('react-native', () => ({
  Alert: {}, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text',
  TextInput: 'TextInput', View: 'View', StyleSheet: { create: (styles: object) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('@react-native-community/netinfo', () => ({ default: {} }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('react-native-paper', () => ({ Dialog: { Title: 'DialogTitle', Content: 'DialogContent', Actions: 'DialogActions' }, Portal: 'Portal' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    state.queries.push(queryKey[0]);
    return queryKey[0] === 'profile'
      ? { data: state.profile, isLoading: false, isError: Boolean(state.profileError), error: state.profileError, refetch: vi.fn() }
      : { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  },
  useMutation: (options: typeof state.mutations[number]) => {
    state.mutations.push(options);
    return { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('lucide-react-native', () => Object.fromEntries([
  'Activity', 'AlertCircle', 'AlertTriangle', 'CalendarDays', 'CheckCircle2', 'ChevronDown', 'ChevronRight', 'ChevronUp',
  'ClipboardList', 'Database', 'Droplets', 'Eye', 'FileDown', 'FileText', 'ListFilter', 'Maximize2', 'MessageCircle',
  'MoreHorizontal', 'Plus', 'Printer', 'Trash2', 'UserRound', 'Users', 'Waves', 'Wifi',
].map((name) => [name, name])));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('expo-sharing', () => ({}));
vi.mock('./services/client', () => ({ api: { createTank: state.createTank }, getAccountProfile: vi.fn() }));
vi.mock('./state', () => ({
  useSession: () => ({ user: { id: 'user', name: 'Test User', role: state.role } }),
  useTankSelection: () => ({ tanks: [], allTanks: [], setTankId: state.setTankId, isLoading: false, error: null }),
}));
vi.mock('./theme', () => ({ uiScale: { radius: { pill: 999 }, spacing: [0, 4, 8, 12, 16], type: { body: 14 } }, useTheme: () => ({ colors: {} }) }));
vi.mock('./components/ui', () => ({
  Button: 'Button', Card: 'Card', DataRow: 'DataRow', Page: 'Page', StateMessage: 'StateMessage', Title: 'Title',
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
vi.mock('./services/reportFiles', () => ({}));

import { AlertsScreen, MoreScreen, TanksScreen } from './screens';
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
  state.profile = { site: 'camiguin-sagay' };
  state.profileError = null;
  state.createTank.mockReset();
  state.setTankId.mockReset();
  navigate.mockReset();
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
