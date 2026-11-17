import { isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  states: [] as boolean[],
  index: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
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
vi.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Defs: 'Defs',
  RadialGradient: 'RadialGradient',
  Rect: 'Rect',
  Stop: 'Stop',
}));
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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mobile splash gate', () => {
  it('does not auto-advance and waits for both the tap and session restore', () => {
    const app = 'app navigator';
    const splash = SplashGate({ ready: false, children: app });

    expect(isValidElement(splash) && splash.type).toBe(SplashScreen);
    vi.advanceTimersByTime(10_000);
    hookState.index = 0;
    const stillSplash = SplashGate({ ready: true, children: app });
    expect(isValidElement(stillSplash) && stillSplash.type).toBe(SplashScreen);

    if (isValidElement<{ onGetStarted: () => void }>(stillSplash)) stillSplash.props.onGetStarted();
    hookState.index = 0;
    expect(SplashGate({ ready: false, children: app })).not.toBe(app);
    hookState.index = 0;
    expect(SplashGate({ ready: true, children: app })).toBe(app);
  });
});
