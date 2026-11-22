import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ panel: null as string | null, role: 'operator' as 'operator' | 'admin', width: 390, setPanel: vi.fn(), setTankId: vi.fn() }));
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
  useWindowDimensions: () => ({ width: state.width, height: 844 }),
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isError: false }) }));
vi.mock('lucide-react-native', () => Object.fromEntries([
  'Activity', 'AlertTriangle', 'Bell', 'ChevronDown', 'ClipboardList', 'Database', 'FileText',
  'LayoutDashboard', 'LogOut', 'Menu', 'MessageCircle', 'Sliders', 'UserRound', 'Users', 'Waves', 'Wifi', 'WifiOff', 'X',
].map((name) => [name, name])));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) }));
vi.mock('../services/client', () => ({ api: {}, listPendingAccounts: vi.fn(), liveClient: null }));
vi.mock('../state', () => ({
  useSession: () => ({ user: { name: 'Test User', role: state.role }, signOut: vi.fn() }),
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
  state.role = 'operator';
  state.width = 390;
  state.setPanel.mockClear();
  state.setTankId.mockClear();
  vi.mocked(props.navigation.navigate).mockClear();
});

describe('account profile controls', () => {
  it('shows the brand and caption in the navigation header', () => {
    state.panel = 'navigation';
    const root = HeaderToolbar(props);
    const brands = elements(root, 'Brand');
    expect(brands).toHaveLength(2);
    expect(brands.filter((brand) => brand.props.showCaption)).toHaveLength(1);
    expect(elements(root, 'Text').some((item) => item.props.children === 'Navigation')).toBe(false);
    expect(elements(root, 'Text').some((item) => Array.isArray(item.props.children) && item.props.children.join('') === 'OPERATOR Workspace')).toBe(true);
    expect(elements(root, 'Text').some((item) => item.props.children === '© 2026 HydroSense')).toBe(true);
  });

  it('opens navigation from the header logo without a separate menu icon', () => {
    const root = HeaderToolbar(props);
    const brand = elements(root, 'Brand').find((item) => typeof item.props.onLogoPress === 'function');
    expect(brand?.props.logoExpanded).toBe(false);
    (brand?.props.onLogoPress as () => void)();
    expect(state.setPanel).toHaveBeenCalledWith('navigation');
    expect(elements(root, 'Menu')).toHaveLength(0);
  });

  it('places chat beside notifications and opens the chat screen', () => {
    const root = HeaderToolbar(props);
    const headerRow = elements(root, 'View').find((item) => {
      const children = Children.toArray(item.props.children as ReactNode);
      return children.some((child) => isValidElement<Record<string, unknown>>(child) && child.props.accessibilityLabel === 'Open chat');
    });
    const buttons = Children.toArray(headerRow?.props.children as ReactNode).filter(isValidElement<Record<string, unknown>>);
    const chatIndex = buttons.findIndex((item) => item.props.accessibilityLabel === 'Open chat');
    expect(chatIndex).toBeGreaterThanOrEqual(0);
    expect(String(buttons[chatIndex + 1].props.accessibilityLabel)).toContain('open alerts');
    (buttons[chatIndex].props.onPress as () => void)();
    expect(props.navigation.navigate).toHaveBeenCalledWith('Chat');
  });

  it('keeps touch targets full-size and repositions notifications on narrow screens', () => {
    state.width = 320;
    state.panel = 'notifications';
    const root = HeaderToolbar(props);
    const chat = elements(root, 'Pressable').find((item) => item.props.accessibilityLabel === 'Open chat');
    expect(chat?.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 48, height: 48 })]));
    const header = elements(root, 'Brand').find((item) => typeof item.props.onLogoPress === 'function');
    expect(header?.props.showCaption).toBe(false);
    const panel = elements(root, 'SafeAreaView').find((item) => Array.isArray(item.props.edges) && item.props.edges.length === 0);
    const panelStyles = (panel?.props.style as unknown[]).flat(Infinity).filter(Boolean);
    expect(Object.assign({}, ...panelStyles)).toMatchObject({ right: 64, width: 244 });
  });

  it('does not offer calibration in administrator navigation', () => {
    state.role = 'admin';
    state.panel = 'navigation';
    const root = HeaderToolbar(props);
    expect(elements(root, 'Text').some((item) => item.props.children === 'Calibration')).toBe(false);
    expect(elements(root, 'Text').some((item) => item.props.children === 'Activity logs')).toBe(true);
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
    const accountPanel = elements(root, 'SafeAreaView').find((item) => Array.isArray(item.props.edges) && item.props.edges.length === 0);
    const panelStyles = (accountPanel?.props.style as unknown[]).flat(Infinity).filter(Boolean);
    expect(Object.assign({}, ...panelStyles)).toMatchObject({ position: 'absolute', top: 98, right: 16, width: 340, maxHeight: 696 });
  });

  it('positions notifications beneath the bell within the viewport', () => {
    state.panel = 'notifications';
    const root = HeaderToolbar(props);
    const notificationPanel = elements(root, 'SafeAreaView').find((item) => Array.isArray(item.props.edges) && item.props.edges.length === 0);
    const panelStyles = (notificationPanel?.props.style as unknown[]).flat(Infinity).filter(Boolean);
    expect(Object.assign({}, ...panelStyles)).toMatchObject({ position: 'absolute', top: 98, right: 74, width: 300, maxHeight: 696 });
    expect(elements(root, 'Text').some((item) => item.props.children === 'View all')).toBe(true);
  });
});
