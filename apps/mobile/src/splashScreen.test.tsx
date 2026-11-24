import { isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  states: [] as boolean[],
  index: 0,
  effects: [] as Array<() => void>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => void) => { hookState.effects.push(effect); },
    useState: (initial: boolean) => {
      const index = hookState.index++;
      if (hookState.states[index] === undefined) hookState.states[index] = initial;
      return [hookState.states[index], (value: boolean) => { hookState.states[index] = value; }];
    },
  };
});

vi.mock('react-native', () => ({
  Image: 'Image',
  ImageBackground: 'ImageBackground',
  Pressable: 'Pressable',
  StyleSheet: {
    create: (styles: object) => styles,
    absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390 }),
}));

vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('./theme', () => ({ useTheme: () => ({ reduceMotion: false, colors: { canvas: '#123' } }) }));
vi.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Defs: 'Defs',
  RadialGradient: 'RadialGradient',
  Rect: 'Rect',
  Stop: 'Stop',
}));
import SplashScreen, { SplashGate } from './splashScreen';

beforeEach(() => {
  hookState.states = [];
  hookState.index = 0;
  hookState.effects = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile splash gate', () => {
  it('disables Get Started until restore completes and waits for its async handler', async () => {
    const app = 'app navigator';
    let finish = () => {};
    const onGetStarted = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const splash = SplashGate({ ready: false, hasUser: false, children: app, onGetStarted });

    expect(isValidElement(splash) && splash.type).toBe(SplashScreen);
    expect(isValidElement<{ disabled: boolean }>(splash) && splash.props.disabled).toBe(true);
    vi.advanceTimersByTime(10_000);
    hookState.index = 0;
    const stillSplash = SplashGate({ ready: true, hasUser: false, children: app, onGetStarted });
    expect(isValidElement(stillSplash) && stillSplash.type).toBe(SplashScreen);
    expect(isValidElement<{ disabled: boolean }>(stillSplash) && stillSplash.props.disabled).toBe(false);

    const starting = isValidElement<{ onGetStarted: () => Promise<void> }>(stillSplash) ? stillSplash.props.onGetStarted() : Promise.resolve();
    hookState.index = 0;
    const pending = SplashGate({ ready: true, hasUser: false, children: app, onGetStarted });
    expect(isValidElement<{ disabled: boolean }>(pending) && pending.props.disabled).toBe(true);
    finish();
    await starting;
    hookState.index = 0;
    expect(SplashGate({ ready: false, hasUser: false, children: app, onGetStarted })).not.toBe(app);
    hookState.index = 0;
    expect(SplashGate({ ready: true, hasUser: false, children: app, onGetStarted })).not.toBe(app);
    hookState.effects.at(-1)?.();
    hookState.index = 0;
    expect(SplashGate({ ready: true, hasUser: false, children: app, onGetStarted })).toBe(app);
    expect(onGetStarted).toHaveBeenCalledOnce();
  });

  it('waits for the user to clear before mounting, then permits later sign-in', async () => {
    const app = 'app navigator';
    const onGetStarted = vi.fn().mockResolvedValue(undefined);
    const splash = SplashGate({ ready: true, hasUser: true, children: app, onGetStarted });
    if (isValidElement<{ onGetStarted: () => Promise<void> }>(splash)) await splash.props.onGetStarted();

    hookState.index = 0;
    const waiting = SplashGate({ ready: true, hasUser: true, children: app, onGetStarted });
    expect(isValidElement<{ style: object }>(waiting) && waiting.type).toBe('View');
    expect(isValidElement<{ style: object }>(waiting) && waiting.props.style).toEqual({ flex: 1, backgroundColor: '#123' });
    hookState.effects.at(-1)?.();
    hookState.index = 0;
    expect(SplashGate({ ready: true, hasUser: false, children: app, onGetStarted })).not.toBe(app);
    hookState.effects.at(-1)?.();
    hookState.index = 0;
    expect(SplashGate({ ready: true, hasUser: false, children: app, onGetStarted })).toBe(app);
    hookState.index = 0;
    expect(SplashGate({ ready: true, hasUser: true, children: app, onGetStarted })).toBe(app);
  });
});
