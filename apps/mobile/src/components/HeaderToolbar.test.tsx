import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ panel: null as string | null, role: 'operator' as 'operator' | 'manager' | 'admin', mode: 'light' as 'light' | 'dark', width: 390, height: 844, headerLayout: { height: 67, rowY: 8, rowHeight: 48 }, insets: { top: 24, bottom: 34, left: 0, right: 0 }, platform: 'android', alerts: [] as Array<{ id: string; status: string; severity: string; parameter: string; value: string; threshold: string }>, tanksLoading: false, tanksError: null as Error | null, refetchTanks: vi.fn(), setPanel: vi.fn(), setTankId: vi.fn() }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: () => undefined,
    useState: (initial: unknown) => {
      if (initial === null) return [state.panel, state.setPanel];
      if (initial && typeof initial === 'object' && 'rowHeight' in initial) {
        return [state.headerLayout, (update: (current: typeof state.headerLayout) => typeof state.headerLayout) => { state.headerLayout = update(state.headerLayout); }];
      }
      return [initial, vi.fn()];
    },
  };
});
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() }, Modal: 'Modal', Platform: { get OS() { return state.platform; } }, Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles, absoluteFill: {} }, Text: 'Text', View: 'View',
  useWindowDimensions: () => ({ width: state.width, height: state.height }),
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'alerts' ? state.alerts : [], isError: false }) }));
vi.mock('lucide-react-native', () => Object.fromEntries([
  'Activity', 'AlertTriangle', 'ArrowLeft', 'Bell', 'Check', 'ChevronDown', 'ClipboardList', 'Database', 'FileText',
  'LayoutDashboard', 'LogOut', 'MapPin', 'Menu', 'MessageCircle', 'Sliders', 'UserRound', 'Users', 'Waves', 'Wifi', 'WifiOff', 'X',
].map((name) => [name, name])));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => state.insets }));
vi.mock('react-native-paper', () => ({ Menu: 'PaperMenu' }));
vi.mock('../services/client', () => ({ api: {}, listPendingAccounts: vi.fn(), liveClient: null }));
vi.mock('../state', () => ({
  useSession: () => ({ user: { name: 'Test User', role: state.role }, signOut: vi.fn() }),
  useTankSelection: () => ({ tanks: [{ id: '1', name: 'Tank 01', site: 'Site' }], tankId: '1', setTankId: state.setTankId, isLoading: state.tanksLoading, error: state.tanksError, refetch: state.refetchTanks }),
}));
vi.mock('../theme', () => ({
  uiScale: { radius: { pill: 999 }, type: { caption: 12 } },
  useTheme: () => ({ mode: state.mode, colors: { ink: '#000', muted: '#444', teal: '#06c', border: '#ccc', surface: '#fff', card: state.mode === 'dark' ? '#122040' : 'rgba(255,255,255,0.82)', selected: '#def', normal: '#080', warning: '#a80', critical: '#c00', overlay: '#000' }, reduceMotion: false }),
}));
vi.mock('./ui', () => ({ Brand: 'Brand' }));
vi.mock('./HatcheryPicker', () => ({ HatcheryPicker: 'HatcheryPicker' }));

import { HeaderToolbar } from './HeaderToolbar';
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...elements(node.props.anchor as ReactNode, type),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

function elementMarkers(node: ReactNode): string[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === 'HatcheryPicker' ? ['hatchery'] : []),
    ...(node.props.accessibilityLabel === 'Connection Offline' ? ['connection'] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap(elementMarkers),
  ];
}

const props = { navigation: { navigate: vi.fn() }, route: { key: 'home', name: 'Home' } } as unknown as BottomTabHeaderProps;

beforeEach(() => {
  state.panel = null;
  state.role = 'operator';
  state.mode = 'light';
  state.tanksLoading = false;
  state.tanksError = null;
  state.refetchTanks.mockClear();
  state.width = 390;
  state.height = 844;
  state.headerLayout = { height: 67, rowY: 8, rowHeight: 48 };
  state.insets = { top: 24, bottom: 34, left: 0, right: 0 };
  state.platform = 'android';
  state.alerts = [];
  state.setPanel.mockClear();
  state.setTankId.mockClear();
  vi.mocked(props.navigation.navigate).mockClear();
});

describe('account profile controls', () => {
  it('returns secondary pages to More without showing back on main tabs', () => {
    expect(elements(HeaderToolbar(props), 'Pressable').some((item) => item.props.accessibilityLabel === 'Back to More')).toBe(false);
    const root = HeaderToolbar({ ...props, route: { ...props.route, name: 'Reports' } });
    const back = elements(root, 'Pressable').find((item) => item.props.accessibilityLabel === 'Back to More');
    (back?.props.onPress as () => void)();
    expect(props.navigation.navigate).toHaveBeenCalledWith('More');
  });
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
    expect(elements(buttons[chatIndex + 1], 'Pressable').some((item) => String(item.props.accessibilityLabel).includes('open alerts'))).toBe(true);
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
    const menu = elements(root, 'PaperMenu').find((item) => item.props.visible);
    const menuStyles = (menu?.props.contentStyle as unknown[]).flat(Infinity).filter(Boolean);
    expect(Object.assign({}, ...menuStyles)).toMatchObject({ width: 244 });
    expect(menu?.props.anchorPosition).toBe('bottom');
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
    expect(elements(root, 'HatcheryPicker')).toHaveLength(0);
    const accountMenu = elements(root, 'PaperMenu').find((item) => item.props.visible);
    expect(accountMenu?.props.anchorPosition).toBe('bottom');
    expect(elements(accountMenu?.props.anchor as ReactNode, 'Pressable')[0].props.accessibilityLabel).toBe('Account menu for Test User');
    expect(elements(root, 'Modal')[0].props.visible).toBe(false);
  });

  it('offers the hatchery filter only in the administrator account menu', () => {
    state.role = 'admin';
    state.panel = 'account';
    const root = HeaderToolbar(props);
    expect(elements(root, 'HatcheryPicker')).toHaveLength(1);
    const markers = elementMarkers(root);
    expect(markers.indexOf('connection')).toBeLessThan(markers.indexOf('hatchery'));
    state.panel = 'navigation';
    expect(elements(HeaderToolbar(props), 'HatcheryPicker')).toHaveLength(0);
  });

  it('shows loading and retry states for the administrator hatchery filter', () => {
    state.role = 'admin';
    state.panel = 'account';
    state.tanksLoading = true;
    expect(elements(HeaderToolbar(props), 'Text').some((item) => item.props.children === 'Loading hatcheries...')).toBe(true);
    state.tanksLoading = false;
    state.tanksError = new Error('Network error');
    const root = HeaderToolbar(props);
    expect(elements(root, 'HatcheryPicker')).toHaveLength(0);
    const retry = elements(root, 'Pressable').find((item) => elements(item, 'Text').some((text) => text.props.children === 'Retry'));
    (retry?.props.onPress as () => void)();
    expect(state.refetchTanks).toHaveBeenCalledOnce();
  });

  it('positions notifications beneath the bell within the viewport', () => {
    state.panel = 'notifications';
    const root = HeaderToolbar(props);
    const menu = elements(root, 'PaperMenu').find((item) => item.props.visible);
    expect(menu?.props.anchorPosition).toBe('bottom');
    expect(String(elements(menu?.props.anchor as ReactNode, 'Pressable')[0].props.accessibilityLabel)).toContain('open alerts');
    expect(elements(root, 'Modal')[0].props.visible).toBe(false);
    (menu?.props.onDismiss as () => void)();
    expect(state.setPanel).toHaveBeenCalledWith(null);
    expect(elements(root, 'Text').some((item) => item.props.children === 'View all')).toBe(true);
  });

  it.each([
    [320, 0, 0], [390, 0, 0], [480, 0, 0], [760, 44, 44],
  ])('keeps the bell menu inside a %ipx viewport with safe-area insets', (width, leftInset, rightInset) => {
    state.width = width;
    state.insets.left = leftInset;
    state.insets.right = rightInset;
    state.panel = 'notifications';
    const menu = elements(HeaderToolbar(props), 'PaperMenu').find((item) => item.props.visible);
    const menuWidth = Object.assign({}, ...(menu?.props.contentStyle as object[])).width as number;
    const padding = width < 380 ? 12 : 16;
    const gap = width < 380 ? 4 : 10;
    const anchorRight = width - rightInset - padding - 48 - gap;
    expect(anchorRight - menuWidth).toBeGreaterThanOrEqual(leftInset + padding);
    expect(anchorRight).toBeLessThanOrEqual(width - rightInset);
    expect(menuWidth).toBeLessThanOrEqual(340);
  });

  it('constrains and scrolls a long notification list above the bottom safe area', () => {
    state.panel = 'notifications';
    state.height = 420;
    state.insets = { top: 40, bottom: 28, left: 0, right: 0 };
    state.alerts = Array.from({ length: 20 }, (_, index) => ({
      id: String(index), status: 'open', severity: 'warning', parameter: `Alert ${index}`, value: '1', threshold: '2',
    }));
    const menu = elements(HeaderToolbar(props), 'PaperMenu').find((item) => item.props.visible);
    const list = elements(menu, 'ScrollView')[0];
    const maxHeight = (list.props.style as { maxHeight: number }).maxHeight;
    const anchorBottom = state.insets.top + 8 + 48;
    expect(anchorBottom + (menu?.props.style as { marginTop: number }).marginTop + state.insets.top + maxHeight + 2).toBeLessThanOrEqual(state.height - state.insets.bottom - 8);
    expect(elements(list, 'Text').some((item) => item.props.children === 'View all')).toBe(true);
    expect(elements(list, 'Pressable')).toHaveLength(21);
  });

  it('positions both menus below the measured header, including wrapped content', () => {
    const root = HeaderToolbar(props);
    const header = elements(root, 'View').find((item) => typeof item.props.onLayout === 'function' && elements(item, 'Brand').length > 0);
    const row = elements(header, 'View').find((item) => item !== header && typeof item.props.onLayout === 'function');
    (header?.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { height: 125 } } });
    (row?.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { y: 8, height: 64 } } });
    const anchorBottom = 8 + (64 + 48) / 2;
    for (const panel of ['notifications', 'account']) {
      state.panel = panel;
      const menu = elements(HeaderToolbar(props), 'PaperMenu').find((item) => item.props.visible);
      expect((menu?.props.style as { marginTop: number }).marginTop + anchorBottom).toBe(125);
      const scroll = elements(menu, 'ScrollView')[0];
      expect((scroll.props.style as { maxHeight: number }).maxHeight + 125 + state.insets.top * 2 + state.insets.bottom).toBeLessThan(state.height);
    }
  });

  it('toggles each anchored menu from its icon', () => {
    for (const panel of ['notifications', 'account']) {
      state.panel = panel;
      state.setPanel.mockClear();
      const menu = elements(HeaderToolbar(props), 'PaperMenu').find((item) => item.props.visible);
      const anchor = elements(menu?.props.anchor as ReactNode, 'Pressable')[0];
      expect(anchor.props.accessibilityState).toMatchObject({ expanded: true });
      (anchor.props.onPress as () => void)();
      expect(state.setPanel).toHaveBeenCalledWith(null);
    }
  });

  it.each([
    ['admin', 'light', 'rgba(255,255,255,0.82)'], ['manager', 'light', '#d7e6ed'], ['operator', 'light', '#d9e4f6'],
    ['admin', 'dark', '#122040'], ['manager', 'dark', '#152a38'], ['operator', 'dark', '#132440'],
  ] as const)('uses the %s %s theme for both menus', (role, mode, background) => {
    state.role = role;
    state.mode = mode;
    for (const panel of ['account', 'notifications']) {
      state.panel = panel;
      const root = HeaderToolbar(props);
      const menu = elements(root, 'PaperMenu').find((item) => item.props.visible);
      expect(Object.assign({}, ...(menu?.props.contentStyle as object[]))).toMatchObject({ backgroundColor: background });
      if (role === 'admin' && panel === 'account') {
        expect(elements(root, 'HatcheryPicker')[0].props.colors).toMatchObject({ surface: background });
      }
    }
  });
});
