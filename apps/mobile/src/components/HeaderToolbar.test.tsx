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

describe('account profile controls', () => {
  it('opens navigation from the header logo without a separate menu icon', () => {
    const root = HeaderToolbar(props);
    const brand = elements(root, 'Brand').find((item) => typeof item.props.onLogoPress === 'function');
    expect(brand?.props.logoExpanded).toBe(false);
    (brand?.props.onLogoPress as () => void)();
    expect(state.setPanel).toHaveBeenCalledWith('navigation');
    expect(elements(root, 'Menu')).toHaveLength(0);
  });

  it('shows connection status without dashboard or tank selection controls', () => {
    state.panel = 'account';
    const root = HeaderToolbar(props);
    expect(elements(root, 'Pressable').some((item) => String(item.props.accessibilityLabel).startsWith('Select tank:'))).toBe(false);
    const accountButton = elements(root, 'Pressable').find((item) => String(item.props.accessibilityLabel).startsWith('Account menu for'));
    expect(accountButton).toBeDefined();
    expect(elements(accountButton, 'UserRound')).toHaveLength(1);
    expect(elements(accountButton, 'Text').map((item) => item.props.children)).not.toContain('TE');
    expect(elements(root, 'Text').some((item) => item.props.children === 'DASHBOARD')).toBe(false);
    expect(elements(root, 'View').some((item) => item.props.accessibilityLabel === 'Connection Offline')).toBe(true);
    expect(elements(root, 'WifiOff')[0].props.color).toBe('#c00');
  });
});
