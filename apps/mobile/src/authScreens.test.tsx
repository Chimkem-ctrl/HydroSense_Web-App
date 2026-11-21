import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0, cleanups: [] as Array<() => void> }));
const resend = vi.hoisted(() => vi.fn());
const openURL = vi.hoisted(() => vi.fn());

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = typeof initial === 'function' ? initial() : initial;
    return [state.values[index], (value: unknown) => {
      state.values[index] = typeof value === 'function' ? value(state.values[index]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) state.cleanups.push(cleanup);
  },
}));
vi.mock('react-native', () => ({
  FlatList: 'FlatList', Linking: { openURL }, Pressable: 'Pressable', Text: 'Text',
  TextInput: 'TextInput', View: 'View', useWindowDimensions: () => ({ width: 360 }),
}));
vi.mock('react-native-paper', () => ({ Dialog: { Title: 'Title', Content: 'Content', Actions: 'Actions' } }));
vi.mock('lucide-react-native', () => ({ ChevronDown: 'ChevronDown', Eye: 'Eye', EyeOff: 'EyeOff' }));
vi.mock('./components/ui', () => ({
  Brand: 'Brand', Button: 'Button', Card: 'Card', GlassDialog: 'GlassDialog', Page: 'Page', createFormStyles: () => ({}),
}));
vi.mock('./components/PhoneField', () => ({ PhoneField: 'PhoneField' }));
vi.mock('./theme', () => ({
  authColors: { ink: '#fff', muted: '#ccc', accent: '#abc' },
  uiScale: { spacing: { 1: 4, 2: 8, 3: 12, 4: 16 }, type: { body: 16 } },
  useTheme: () => ({ colors: {} }),
}));
vi.mock('./state', () => ({ useSession: () => ({}) }));
vi.mock('./services/client', () => ({ API_BASE_URL: 'https://example.test/functions/v1/api', API_KEY: 'test', DATA_MODE: 'api' }));
vi.mock('./services/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('./services/auth')>(),
  resendVerification: resend,
}));

import { LoginScreen, VerifyEmailScreen } from './authScreens';

type Props = { children?: ReactNode; label?: string; detail?: string; disabled?: boolean; onPress?: () => void };
function find(node: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return undefined;
}

function render(email: string) {
  state.index = 0;
  const navigation = { replace: vi.fn(), popTo: vi.fn() } as Partial<Parameters<typeof VerifyEmailScreen>[0]['navigation']> as Parameters<typeof VerifyEmailScreen>[0]['navigation'];
  return VerifyEmailScreen({ navigation, route: { key: 'verification', name: 'VerifyEmail', params: { email } } });
}

beforeEach(() => {
  state.values = [];
  state.cleanups = [];
  vi.useFakeTimers();
  resend.mockReset().mockResolvedValue(undefined);
  openURL.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  state.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe('email verification screen', () => {
  it('displays the address and offers Gmail only for Google mail addresses', () => {
    const gmail = render('test@gmail.com');
    expect(find(gmail, (element) => element.props.detail?.includes('test@gmail.com') === true)).toBeDefined();
    find(gmail, (element) => element.props.label === 'Open Gmail')?.props.onPress?.();
    expect(openURL).toHaveBeenCalledWith('https://mail.google.com');
    state.values = [];
    expect(find(render('test@example.com'), (element) => element.props.label === 'Open Gmail')).toBeUndefined();
  });

  describe('login screen', () => {
    it('renders in API mode without referencing a removed sample-data mode', () => {
      const navigation = {} as Parameters<typeof LoginScreen>[0]['navigation'];
      const screen = LoginScreen({ navigation, route: { key: 'login', name: 'Login' } });
      expect(find(screen, (element) => element.props.label === 'Sign in')).toBeDefined();
    });
  });

  it('disables resending for 60 seconds and restarts the cooldown after a request', async () => {
    let screen = render('test@example.com');
    expect(find(screen, (element) => element.props.label === 'Resend in 60s')?.props.disabled).toBe(true);
    vi.advanceTimersByTime(60_000);
    screen = render('test@example.com');
    const button = find(screen, (element) => element.props.label === 'Resend verification email');
    expect(button?.props.disabled).toBe(false);
    button?.props.onPress?.();
    await Promise.resolve();
    expect(resend).toHaveBeenCalledWith('https://example.test/functions/v1/api', 'test', 'test@example.com');
    screen = render('test@example.com');
    expect(find(screen, (element) => element.props.label === 'Resend in 60s')?.props.disabled).toBe(true);
  });
});
