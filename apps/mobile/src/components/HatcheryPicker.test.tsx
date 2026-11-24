import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ hatchery: 'all', expanded: false }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: () => [state.expanded, (value: boolean | ((current: boolean) => boolean)) => {
      state.expanded = typeof value === 'function' ? value(state.expanded) : value;
    }],
  };
});
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('lucide-react-native', () => ({ Check: 'Check', ChevronDown: 'ChevronDown', MapPin: 'MapPin' }));
vi.mock('../state', () => ({
  useTankSelection: () => ({
    hatchery: state.hatchery,
    setHatchery: (value: string) => { state.hatchery = value; },
    locations: [{ id: 'camiguin-sagay', name: 'Sagay' }, { id: 'camiguin-benoni', name: 'Benoni' }],
  }),
}));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 2: 8, 3: 12, 4: 16 }, radius: { control: 12, pill: 999 }, type: { body: 16, caption: 12 } },
  useTheme: () => ({ colors: { muted: 'muted', teal: 'active', border: 'border', selected: 'selected', surface: 'surface', ink: 'ink' } }),
}));

import { HatcheryPicker } from './HatcheryPicker';

function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === 'Pressable' ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap(buttons)];
}

beforeEach(() => { state.hatchery = 'all'; state.expanded = false; });

it('opens a themed dropdown and updates the selection', () => {
  let choices = buttons(HatcheryPicker());
  expect(choices).toHaveLength(1);
  expect(choices[0].props.accessibilityState).toEqual({ expanded: false });
  expect(choices[0].props.accessibilityLabel).toBe('Hatchery filter, All hatcheries');
  (choices[0].props.onPress as () => void)();

  choices = buttons(HatcheryPicker());
  expect(choices).toHaveLength(4);
  expect(choices[1].props.accessibilityState).toEqual({ checked: true });
  expect(choices[1].props.style).toMatchObject({ backgroundColor: 'selected' });
  (choices[3].props.onPress as () => void)();

  choices = buttons(HatcheryPicker());
  expect(choices).toHaveLength(1);
  expect(choices[0].props.accessibilityLabel).toBe('Hatchery filter, Benoni');
  expect(choices[0].props.style).toMatchObject({ borderColor: 'border', backgroundColor: 'surface' });
  (choices[0].props.onPress as () => void)();
  choices = buttons(HatcheryPicker());
  expect(choices[3].props.accessibilityState).toEqual({ checked: true });
  expect(choices[3].props.style).toMatchObject({ backgroundColor: 'selected' });
});
