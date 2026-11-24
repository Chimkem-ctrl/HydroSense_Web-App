import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ open: false, width: 390 }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.open, (value: typeof state.open) => { state.open = value; }],
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: state.width }) }));
vi.mock('lucide-react-native', () => ({ CalendarDays: 'CalendarDays', Check: 'Check', ChevronDown: 'ChevronDown', Droplets: 'Droplets' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 1: 4, 2: 8, 3: 12 }, radius: { control: 12 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { muted: 'muted', teal: 'teal', border: 'border', surface: 'surface', selected: 'selected', ink: 'ink' } }),
}));
vi.mock('./ui', () => ({ CalendarFilterField: 'CalendarFilterField' }));

import { TrendFilters } from './TrendFilters';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (typeof node.type === 'function') return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props), type);
  return [...(node.type === type ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type))];
}

beforeEach(() => { state.open = false; state.width = 390; });
const dateProps = { from: '2025-01-01', to: '2025-01-07', today: '2025-01-07', onFromChange: vi.fn(), onToChange: vi.fn() };

it('shows range tabs and changes the tank and range', () => {
  const onTankChange = vi.fn();
  const onDaysChange = vi.fn();
  const props = { tanks: [{ value: 'a', label: 'Tank A' }, { value: 'b', label: 'Tank B' }], tankId: 'a', onTankChange, days: 1, onDaysChange, ...dateProps };
  let buttons = elements(TrendFilters(props), 'Pressable');
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual(['Tank: Tank A', '24 hours', '7 days', 'Full cycle (21 days)', 'Custom']);
  expect(buttons[1].props.accessibilityState).toEqual({ selected: true });
  (buttons[2].props.onPress as () => void)();
  expect(onDaysChange).toHaveBeenCalledWith(7);
  (buttons[0].props.onPress as () => void)();
  buttons = elements(TrendFilters(props), 'Pressable');
  expect(buttons[1].props.accessibilityState).toEqual({ checked: true });
  (buttons[2].props.onPress as () => void)();
  expect(onTankChange).toHaveBeenCalledWith('b');
  expect(state.open).toBe(false);
});

it('disables the tank filter when no tanks are available', () => {
  const buttons = elements(TrendFilters({ tanks: [], tankId: '', onTankChange: vi.fn(), days: 1, onDaysChange: vi.fn(), ...dateProps }), 'Pressable');
  expect(buttons[0].props.accessibilityState).toEqual({ expanded: false, disabled: true });
  expect(buttons[0].props.accessibilityLabel).toBe('Tank: None available');
  expect(buttons[1].props.disabled).not.toBe(true);
});

it('offers the full cycle and custom dates with Manila date bounds', () => {
  const props = { tanks: [], tankId: '', onTankChange: vi.fn(), days: 0, onDaysChange: vi.fn(), ...dateProps };
  const root = TrendFilters(props);
  const fields = elements(root, 'CalendarFilterField');
  expect(fields).toHaveLength(2);
  expect(fields[0].props.max).toBe('2025-01-07');
  expect(fields[1].props.min).toBe('2025-01-01');
  expect(fields[1].props.max).toBe('2025-01-07');
  const custom = elements(root, 'Pressable').find((button) => button.props.accessibilityLabel === 'Custom');
  expect(custom?.props.accessibilityState).toEqual({ selected: true });
  state.width = 359;
  expect(TrendFilters(props).props.children[2].props.style.flexDirection).toBe('column');
});
