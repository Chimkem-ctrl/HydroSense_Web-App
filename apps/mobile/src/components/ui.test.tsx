import { Children, isValidElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ reduceTransparency: false, platform: 'android' }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useContext: vi.fn(),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()],
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Image: 'Image',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: { get OS() { return themeState.platform; } },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  useWindowDimensions: () => ({ width: 440, height: 900 }),
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('expo-blur', () => ({ BlurTargetView: 'blur-target', BlurView: 'blur-view' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) }));
vi.mock('react-native-paper', () => ({ Dialog: 'dialog', Portal: 'portal' }));
vi.mock('lucide-react-native', () => ({ CalendarDays: 'CalendarDays', ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight' }));
vi.mock('../theme', () => ({
  authColors: { ink: '#fff', muted: '#ddd', caption: '#ddd', placeholder: '#aaa', border: '#888', panel: '#123', panelTop: '#123', solidPanel: '#123', background: '#000', accent: '#abc', focus: '#2563eb', scrimTop: '#000', scrimBottom: '#000' },
  uiScale: { spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 }, type: {}, radius: { card: 20 } },
  useTheme: () => ({ colors: { canvas: '#eaf3ff', surface: '#ffffff', glassControl: 'rgba(255,255,255,0.25)', backgroundVia: '#dfeafe', backgroundTo: '#f3eefe' }, reduceTransparency: themeState.reduceTransparency }),
}));

import { BlurTargetContext, Brand, CalendarFilterField, Card, Chip, FilterField, GlassDialog, Page } from './ui';

type ElementProps = { children?: ReactNode; style?: unknown; contentContainerStyle?: unknown; resizeMode?: string; intensity?: number; blurReductionFactor?: number; tint?: string; ref?: unknown; accessibilityLabel?: string; accessibilityState?: unknown; onChangeText?: (value: string) => void; onPress?: () => void; edges?: string[] };

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

  it('shows a calendar control alongside date inputs', () => {
    const field = CalendarFilterField({ label: 'From date (PHT)', value: '', onChangeText: vi.fn() });
    expect(findElement(field, 'TextInput')?.props.accessibilityLabel).toBe('From date (PHT)');
    expect(findElement(field, 'CalendarDays')).toBeDefined();
    expect(findElement(field, 'Pressable')?.props.accessibilityLabel).toBe('Choose from date (pht)');
  });

  it('keeps the calendar modal within safe screen bounds with a padded, scrollable panel', () => {
    const field = CalendarFilterField({ label: 'From date (PHT)', value: '', onChangeText: vi.fn() });
    const modal = findElement(field, 'Modal');
    const scroll = findElement(modal, 'ScrollView');
    const panel = findElement(scroll, 'View');
    expect(flattenStyle(scroll?.props.style).maxHeight).toBe(810);
    expect(flattenStyle(panel?.props.style)).toMatchObject({ width: 408, padding: 16 });
  });

  it('exposes chip selection and forwards presses', () => {
    const onPress = vi.fn();
    const chip = findElement(Chip({ label: 'Temperature', selected: true, onPress }), 'Pressable');
    expect(chip?.props.accessibilityState).toEqual({ checked: true });
    chip?.props.onPress?.();
    expect(onPress).toHaveBeenCalledOnce();
    expect(findElement(Chip({ label: 'Environment' }), 'Pressable')).toBeUndefined();
  });

  it('uses the themed glass input only in redesigned pages', () => {
    vi.mocked(useContext).mockReturnValueOnce(true);
    const redesigned = findElement(FilterField({ label: 'From', value: '', onChangeText: () => {} }), 'TextInput');
    expect(flattenStyle(redesigned?.props.style).backgroundColor).toBe('rgba(255,255,255,0.25)');
    vi.mocked(useContext).mockReturnValueOnce(false);
    const standard = findElement(FilterField({ label: 'From', value: '', onChangeText: () => {} }), 'TextInput');
    expect(flattenStyle(standard?.props.style).backgroundColor).toBe('#ffffff');
  });
});

describe('header brand', () => {
  it('opens navigation and hides the caption in compact headers', () => {
    const onLogoPress = vi.fn();
    const brand = Brand({ compact: true, onLogoPress, logoExpanded: false });
    const button = findElement(brand, 'Pressable');
    expect(button?.props.accessibilityLabel).toBe('Open navigation menu');
    expect(button?.props.accessibilityState).toEqual({ expanded: false });
    button?.props.onPress?.();
    expect(onLogoPress).toHaveBeenCalledOnce();
    const texts = Children.toArray(findElement(brand, 'View')?.props.children);
    expect(texts.some((node) => isValidElement<ElementProps>(node) && node.props.children === 'WATER QUALITY MONITORING')).toBe(false);
  });
});

describe('page background layers', () => {
  it('lets the tab bar own the bottom inset while keeping it for stack and auth screens', () => {
    vi.mocked(useContext).mockReturnValueOnce(true);
    expect(findElement(Page({ children: 'Tab' }), 'SafeAreaView')?.props.edges).toEqual(['left', 'right']);
    vi.mocked(useContext).mockReturnValueOnce(false);
    expect(findElement(Page({ children: 'Stack' }), 'SafeAreaView')?.props.edges).toEqual(['left', 'right', 'bottom']);
    vi.mocked(useContext).mockReturnValueOnce(false);
    expect(findElement(Page({ auth: true, children: 'Auth' }), 'SafeAreaView')?.props.edges).toEqual(['top', 'left', 'right', 'bottom']);
  });
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

    it('uses a solid background when an Android card has no blur target', () => {
      vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false);
      const card = Card({ children: 'Content' });
      expect(findElement(card, 'blur-view')).toBeUndefined();
      expect(flattenStyle(findElement(card, 'View')?.props.style).backgroundColor).toBe('#ffffff');
    });

    it('applies a status tint above the card background', () => {
      vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false);
      const card = Card({ children: 'Content', toneColor: '#146b35' });
      const root = findElement(card, 'View');
      expect(flattenStyle(root?.props.style)).toMatchObject({ backgroundColor: '#ffffff', borderColor: '#146b35' });
      const tint = Children.toArray(root?.props.children).find((child) =>
        isValidElement<ElementProps>(child) && flattenStyle(child.props.style).backgroundColor === '#146b3520');
      expect(tint).toBeDefined();
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

  it('fills the authentication viewport with a covered image behind scrolling content', () => {
    const page = Page({ auth: true, children: 'Content' });
    const target = findElement(page, 'blur-target');
    expect(flattenStyle(page.props.style)).toMatchObject({ minHeight: 900, width: '100%' });
    expect(flattenStyle(target?.props.style)).toMatchObject({ position: 'absolute', width: '100%', height: '100%' });
    const image = findElement(target, 'Image');
    expect(image?.props.resizeMode).toBe('cover');
    expect(flattenStyle(image?.props.style)).toMatchObject({ width: '100%', height: '100%' });
    expect(findElement(target, 'LinearGradient')).toBeDefined();
    const provider = Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === BlurTargetContext.Provider);
    expect(isValidElement<{ value: unknown }>(provider) && provider.props.value).toBe(target?.props.ref);
    const scroll = findElement(page, 'ScrollView');
    expect(flattenStyle(scroll?.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, backgroundColor: 'transparent' });
    expect(flattenStyle(findElement(scroll?.props.children, 'View')?.props.style).backgroundColor).toBe('transparent');
  });

  it('uses a lighter dark blur for auth cards without changing other cards', () => {
    vi.mocked(useContext).mockReturnValueOnce({ current: null }).mockReturnValueOnce(false).mockReturnValueOnce(false);
    const blur = findElement(Card({ auth: true, children: 'Content' }), 'blur-view');
    expect(blur?.props.tint).toBe('dark');
    expect(blur?.props.intensity! / blur?.props.blurReductionFactor!).toBe(8);
  });

  it('uses a lighter backdrop blur on web and retains the reduced-transparency fallback', () => {
    themeState.platform = 'web';
    vi.stubGlobal('CSS', { supports: () => true });
    try {
      vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false).mockReturnValueOnce(false);
      const card = Card({ auth: true, children: 'Content' });
      const blur = Children.toArray(findElement(card, 'View')?.props.children)[0];
      expect(flattenStyle(findElement(blur, 'View')?.props.style).backdropFilter).toBe('blur(8px) saturate(120%)');
      themeState.reduceTransparency = true;
      vi.mocked(useContext).mockReturnValueOnce(null).mockReturnValueOnce(false).mockReturnValueOnce(false);
      const fallback = Card({ auth: true, children: 'Content' });
      expect(flattenStyle(findElement(fallback, 'View')?.props.style).backgroundColor).toBe('#123');
      expect(findElement(fallback, 'LinearGradient')).toBeUndefined();
    } finally {
      themeState.reduceTransparency = false;
      themeState.platform = 'android';
      vi.unstubAllGlobals();
    }
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

  it('renders solid dialogs without a translucent blur layer', () => {
    const target = { current: null };
    vi.mocked(useContext).mockReturnValueOnce(target);
    const dialog = findElement(GlassDialog({ visible: true, onDismiss: () => {}, solid: true, children: 'Content' }), 'dialog');
    expect(flattenStyle(dialog?.props.style).backgroundColor).toBe('#ffffff');
    expect(Children.toArray(dialog?.props.children)).toEqual(['Content']);
  });
});
