import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { parseThemeChoice, resolveTheme } from './themePreference';
import type { ThemeChoice, ThemeMode } from './themePreference';

export type { ThemeChoice } from './themePreference';
export const THEME_KEY = 'hydrosense.mobile.theme';

export const uiScale = {
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 },
  type: { caption: 12, body: 16, section: 18, title: 28 },
  radius: { control: 12, card: 20, pill: 999 },
} as const;

export const palettes = {
  light: {
    ink: '#0b1b33', muted: '#41526e', surface: '#ffffff', canvas: '#eaf3ff',
    border: '#c4d2e8', teal: '#2563eb', warning: '#855000', critical: '#b51c1c',
    offline: '#fff3d4', selected: '#e5eeff', card: 'rgba(255,255,255,0.82)',
    cardBorder: '#ffffff', backgroundVia: '#dfeafe', backgroundTo: '#f3eefe',
    normal: '#146b35', overlay: 'rgba(5,11,26,0.65)', onPrimary: '#ffffff',
  },
  dark: {
    ink: '#eaf1ff', muted: '#b6c4e0', surface: '#182a54', canvas: '#050b1a',
    border: '#506588', teal: '#6aa2ff', warning: '#fcd34d', critical: '#fca5a5',
    offline: '#493b1e', selected: '#243d6d', card: '#122040',
    cardBorder: '#43567c', backgroundVia: '#0a1a38', backgroundTo: '#0b1030',
    normal: '#86efac', overlay: 'rgba(0,0,0,0.75)', onPrimary: '#ffffff',
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string };
interface ThemeValue {
  choice: ThemeChoice;
  mode: ThemeMode;
  colors: Palette;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  setChoice: (choice: ThemeChoice) => Promise<void>;
  error: string | null;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>('system');
  const [error, setError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const changed = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_KEY).then((value) => {
      if (active && !changed.current) setChoiceState(parseThemeChoice(value));
    }).catch((failure: unknown) => {
      console.error('Could not load appearance preference.', failure);
      if (active) setError('Could not load the saved appearance preference.');
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch((failure: unknown) => {
      console.error('Could not read the reduced-motion preference.', failure);
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const preference = window.matchMedia('(prefers-reduced-transparency: reduce)');
      setReduceTransparency(preference.matches);
      const update = (event: MediaQueryListEvent) => setReduceTransparency(event.matches);
      preference.addEventListener('change', update);
      return () => {
        motionSubscription.remove();
        preference.removeEventListener('change', update);
      };
    }

    if (Platform.OS === 'ios') {
      const transparencySubscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
      AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency).catch((failure: unknown) => {
        console.error('Could not read the reduced-transparency preference.', failure);
      });
      return () => {
        motionSubscription.remove();
        transparencySubscription.remove();
      };
    }

    return () => motionSubscription.remove();
  }, []);
  const setChoice = useCallback(async (next: ThemeChoice) => {
    changed.current = true;
    setChoiceState(next);
    setError(null);
    const write = writeQueue.current.then(() => AsyncStorage.setItem(THEME_KEY, next));
    writeQueue.current = write.catch(() => undefined);
    try {
      await write;
    } catch (failure) {
      console.error('Could not save appearance preference.', failure);
      setError('Could not save the appearance preference. It may reset after restarting.');
    }
  }, []);
  const mode = resolveTheme(choice, system);
  const value = useMemo(() => ({ choice, mode, colors: palettes[mode], reduceMotion, reduceTransparency, setChoice, error }), [choice, mode, reduceMotion, reduceTransparency, setChoice, error]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider.');
  return value;
}
