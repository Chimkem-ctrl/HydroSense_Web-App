import { Children, isValidElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ reduceTransparency: false, platform: 'android' }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useContext: vi.fn(),
  useRef: () => ({ current: null }),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { get OS() { return themeState.platform; } },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  useWindowDimensions: () => ({ width: 440 }),
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('expo-blur', () => ({ BlurTargetView: 'blur-target', BlurView: 'blur-view' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('react-native-paper', () => ({ Dialog: 'dialog', Portal: 'portal' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 }, type: {}, radius: { card: 20 } },
  useTheme: () => ({ colors: { canvas: '#eaf3ff', surface: '#ffffff', backgroundVia: '#dfeafe', backgroundTo: '#f3eefe' }, reduceTransparency: themeState.reduceTransparency }),
}));

import { BlurTargetContext, Card, Chip, FilterField, GlassDialog, Page } from './ui';

type ElementProps = { children?: ReactNode; style?: unknown; contentContainerStyle?: unknown; intensity?: number; blurReductionFactor?: number; tint?: string; ref?: unknown; accessibilityLabel?: string; accessibilityState?: unknown; onChangeText?: (value: string) => void; onPress?: () => void };

function findElement(node: ReactNode, type: string): ReactElement<ElementProps> | undefined {
  if (!isValidElement<ElementProps>(node)) return undefined;
  if (node.type === type) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return undefined;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style && typeof style === 'object' ? { ...style } : {};
}

describe('log filter controls', () => {
  it('labels the editable field and forwards changes', () => {
    const onChangeText = vi.fn();
    const input = findElement(FilterField({ label: 'From date (PHT)', value: '', onChangeText }), 'TextInput');
    expect(input?.props.accessibilityLabel).toBe('From date (PHT)');
    input?.props.onChangeText?.('2026-01-01');
    expect(onChangeText).toHaveBeenCalledWith('2026-01-01');
  });

  it('exposes chip selection and forwards presses', () => {
    const onPress = vi.fn();
    const chip = findElement(Chip({ label: 'Temperature', selected: true, onPress }), 'Pressable');
    expect(chip?.props.accessibilityState).toEqual({ checked: true });
    chip?.props.onPress?.();
    expect(onPress).toHaveBeenCalledOnce();
    expect(findElement(Chip({ label: 'Environment' }), 'Pressable')).toBeUndefined();
  });
});

describe('page background layers', () => {
  it('keeps authenticated page wrappers transparent and the scroll content full-height', () => {
    const page = Page({ children: 'Content' });
    for (const type of ['View', 'KeyboardAvoidingView', 'SafeAreaView', 'ScrollView']) {
      expect(flattenStyle(findElement(page, type)?.props.style).backgroundColor).toBe('transparent');
    }
    const scroll = findElement(page, 'ScrollView');
    expect(flattenStyle(scroll?.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, backgroundColor: 'transparent' });
    expect(flattenStyle(findElement(scroll?.props.children, 'View')?.props.style).backgroundColor).toBe('transparent');
  });

  describe('frosted cards', () => {
    it('blurs outer cards only and uses a transparent nested card', () => {
      vi.mocked(useContext).mockReturnValueOnce({ current: null }).mockReturnValueOnce(false);
      const outer = Card({ children: 'Outer' });
      const blur = findElement(outer, 'blur-view');
      expect(flattenStyle(blur?.props.style).position).toBe('absolute');
      expect(blur?.props.intensity! / blur?.props.blurReductionFactor!).toBe(20);
      expect(0.44 * blur?.props.intensity! / 100).toBeCloseTo(0.04, 2);
      expect(flattenStyle(findElement(outer, 'View')?.props.style).backgroundColor).toBe('transparent');

      vi.mocked(useContext).mockReturnValueOnce({ current: null }).mockReturnValueOnce(true);
      const nested = Card({ children: 'Nested' });
      expect(findElement(nested, 'blur-view')).toBeUndefined();
      expect(flattenStyle(findElement(nested, 'View')?.props.style).backgroundColor).toBe('transparent');
    });

    it('uses the web backdrop filter without an extra tint and falls back when unsupported', () => {
      themeState.platform = 'web';
      vi.stubGlobal('CSS', { supports: () => true });
      try {
        vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false);
        const card = Card({ children: 'Content' });
        const root = findElement(card, 'View');
        const blur = Children.toArray(root?.props.children)[0];
        expect(flattenStyle(findElement(blur, 'View')?.props.style)).toMatchObject({
          backdropFilter: 'blur(20px) saturate(120%)',
          WebkitBackdropFilter: 'blur(20px) saturate(120%)',
          backgroundColor: 'transparent',
        });
        expect(flattenStyle(root?.props.style).backgroundColor).toBe('rgba(255,255,255,0.04)');

        vi.stubGlobal('CSS', { supports: () => false });
        vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false);
        const fallback = Card({ children: 'Content' });
        expect(flattenStyle(findElement(fallback, 'View')?.props.style).backgroundColor).toBe('#ffffff');
      } finally {
        vi.unstubAllGlobals();
        themeState.platform = 'android';
      }
    });

    it('uses a lighter native material on iOS', () => {
      themeState.platform = 'ios';
      try {
        vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false);
        const blur = findElement(Card({ children: 'Content' }), 'blur-view');
        expect(blur?.props.tint).toBe('systemUltraThinMaterial');
        expect(blur?.props.intensity).toBe(25);
      } finally {
        themeState.platform = 'android';
      }
    });

    it('uses a solid background without blur when reduced transparency is enabled', () => {
      themeState.reduceTransparency = true;
      try {
        vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false);
        const card = Card({ children: 'Content' });
        expect(findElement(card, 'blur-view')).toBeUndefined();
        expect(flattenStyle(findElement(card, 'View')?.props.style).backgroundColor).toBe('#ffffff');
      } finally {
        themeState.reduceTransparency = false;
      }
    });
  });

  it('blurs the authentication gradient through transparent page wrappers', () => {
    const page = Page({ auth: true, children: 'Content' });
    const target = findElement(page, 'blur-target');
    expect(findElement(target, 'LinearGradient')).toBeDefined();
    const provider = Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === BlurTargetContext.Provider);
    expect(isValidElement<{ value: unknown }>(provider) && provider.props.value).toBe(target?.props.ref);
    const scroll = findElement(page, 'ScrollView');
    expect(flattenStyle(scroll?.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, backgroundColor: 'transparent' });
    expect(flattenStyle(findElement(scroll?.props.children, 'View')?.props.style).backgroundColor).toBe('transparent');
  });

  it('uses the page blur target for dialogs and keeps a reduced-transparency fallback', () => {
    const target = { current: null };
    vi.mocked(useContext).mockReturnValueOnce(target);
    const dialog = findElement(GlassDialog({ visible: true, onDismiss: () => {}, children: 'Content' }), 'dialog');
    expect(flattenStyle(dialog?.props.style)).toMatchObject({ backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.15)' });
    const backdrop = Children.toArray(dialog?.props.children)[0];
    expect(isValidElement<{ blurTarget: unknown }>(backdrop) && backdrop.props.blurTarget).toBe(target);

    themeState.reduceTransparency = true;
    try {
      vi.mocked(useContext).mockReturnValueOnce(target);
      const fallback = findElement(GlassDialog({ visible: true, onDismiss: () => {}, children: 'Content' }), 'dialog');
      expect(flattenStyle(fallback?.props.style).backgroundColor).toBe('#ffffff');
      expect(Children.toArray(fallback?.props.children)).toEqual(['Content']);
    } finally {
      themeState.reduceTransparency = false;
    }
  });
});
