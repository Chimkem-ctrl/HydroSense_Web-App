import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ panel: null as string | null, setPanel: vi.fn(), setTankId: vi.fn() }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: () => undefined,
    useState: (initial: unknown) => initial === null ? [state.panel, state.setPanel] : [initial, vi.fn()],
  };
});
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles, absoluteFill: {} }, Text: 'Text', View: 'View',
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isError: false }) }));
vi.mock('lucide-react-native', () => Object.fromEntries([
  'Activity', 'AlertTriangle', 'Bell', 'ChevronDown', 'ClipboardList', 'Database', 'FileText',
  'LayoutDashboard', 'LogOut', 'Menu', 'Sliders', 'UserRound', 'Users', 'Waves', 'Wifi', 'WifiOff', 'X',
].map((name) => [name, name])));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('../services/client', () => ({ api: {}, DATA_MODE: 'mock', listPendingAccounts: vi.fn(), liveClient: null }));
vi.mock('../state', () => ({
  useSession: () => ({ user: { name: 'Test User', role: 'operator' }, signOut: vi.fn() }),
  useTankSelection: () => ({ tanks: [{ id: '1', name: 'Tank 01', site: 'Site' }], tankId: '1', setTankId: state.setTankId, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../theme', () => ({
  uiScale: { radius: { pill: 999 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { ink: '#000', muted: '#444', teal: '#06c', border: '#ccc', surface: '#fff', selected: '#def', normal: '#080', warning: '#a80', critical: '#c00', overlay: '#000' }, reduceMotion: false }),
}));
vi.mock('./ui', () => ({ Brand: 'Brand' }));

import { HeaderToolbar } from './HeaderToolbar';
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

const props = { navigation: { navigate: vi.fn() }, route: { key: 'home', name: 'Home' } } as unknown as BottomTabHeaderProps;

beforeEach(() => {
  state.panel = null;
  state.setPanel.mockClear();
  state.setTankId.mockClear();
});

describe('account dashboard controls', () => {
  it('places tank selection and connection status inside the account panel', () => {
    state.panel = 'account';
    const root = HeaderToolbar(props);
    const selector = elements(root, 'Pressable').find((item) => item.props.accessibilityLabel === 'Select tank: Tank 01');
    expect(selector).toBeDefined();
    expect(elements(root, 'View').some((item) => item.props.accessibilityLabel === 'Connection Offline')).toBe(true);
    (selector?.props.onPress as () => void)();
    expect(state.setPanel).toHaveBeenCalledWith('tanks');
  });

  it('selects a tank and returns to the account panel', () => {
    state.panel = 'tanks';
    const root = HeaderToolbar(props);
    const tank = elements(root, 'Pressable').find((item) => item.props.accessibilityRole === 'radio');
    expect(tank?.props.accessibilityState).toEqual({ checked: true });
    (tank?.props.onPress as () => void)();
    expect(state.setTankId).toHaveBeenCalledWith('1');
    expect(state.setPanel).toHaveBeenCalledWith('account');
  });
});
