import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ open: null as 'tank' | 'range' | null }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.open, (value: typeof state.open) => { state.open = value; }],
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('lucide-react-native', () => ({ CalendarDays: 'CalendarDays', Check: 'Check', ChevronDown: 'ChevronDown', Droplets: 'Droplets' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 1: 4, 2: 8, 3: 12 }, radius: { control: 12 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { muted: 'muted', teal: 'teal', border: 'border', surface: 'surface', selected: 'selected', ink: 'ink' } }),
}));

import { TrendFilters } from './TrendFilters';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (typeof node.type === 'function') return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props), type);
  return [...(node.type === type ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type))];
}

beforeEach(() => { state.open = null; });

it('shows separate side-by-side filters and changes each selection', () => {
  const onTankChange = vi.fn();
  const onDaysChange = vi.fn();
  const props = { tanks: [{ value: 'a', label: 'Tank A' }, { value: 'b', label: 'Tank B' }], tankId: 'a', onTankChange, days: 1, onDaysChange };
  let root = TrendFilters(props);
  expect(root.props.style.flexDirection).toBe('row');
  let buttons = elements(root, 'Pressable');
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual(['Tank: Tank A', 'Date range: 24 hours']);
  (buttons[0].props.onPress as () => void)();
  buttons = elements(TrendFilters(props), 'Pressable');
  expect(buttons[1].props.accessibilityState).toEqual({ checked: true });
  (buttons[2].props.onPress as () => void)();
  expect(onTankChange).toHaveBeenCalledWith('b');
  expect(state.open).toBeNull();
  root = TrendFilters(props);
  (elements(root, 'Pressable')[1].props.onPress as () => void)();
  buttons = elements(TrendFilters(props), 'Pressable');
  (buttons[3].props.onPress as () => void)();
  expect(onDaysChange).toHaveBeenCalledWith(7);
  expect(state.open).toBeNull();
});

it('disables the tank filter when no tanks are available', () => {
  const buttons = elements(TrendFilters({ tanks: [], tankId: '', onTankChange: vi.fn(), days: 1, onDaysChange: vi.fn() }), 'Pressable');
  expect(buttons[0].props.accessibilityState).toEqual({ expanded: false, disabled: true });
  expect(buttons[0].props.accessibilityLabel).toBe('Tank: None available');
  expect(buttons[1].props.disabled).toBe(false);
});
