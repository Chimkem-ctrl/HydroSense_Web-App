import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ hatchery: 'all' }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('../state', () => ({
  useTankSelection: () => ({
    hatchery: state.hatchery,
    setHatchery: (value: string) => { state.hatchery = value; },
    locations: [{ id: 'camiguin-sagay', name: 'Sagay' }, { id: 'camiguin-benoni', name: 'Benoni' }],
  }),
}));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 2: 8, 4: 16 }, radius: { pill: 999 } },
  useTheme: () => ({ colors: { muted: 'muted', teal: 'active', border: 'border', selected: 'selected', surface: 'surface', ink: 'ink' } }),
}));

import { HatcheryPicker } from './HatcheryPicker';

function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === 'Pressable' ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap(buttons)];
}

beforeEach(() => { state.hatchery = 'all'; });

it('selects Benoni and updates its selected appearance', () => {
  let choices = buttons(HatcheryPicker());
  expect(choices[0].props.accessibilityState).toEqual({ checked: true });
  (choices[2].props.onPress as () => void)();
  choices = buttons(HatcheryPicker());
  expect(choices[0].props.accessibilityState).toEqual({ checked: false });
  expect(choices[2].props.accessibilityState).toEqual({ checked: true });
  expect(choices[2].props.style).toMatchObject({ backgroundColor: 'selected', borderColor: 'active' });
});
