import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ open: null as 'status' | 'severity' | 'parameter' | null, width: 390 }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.open, (value: typeof state.open) => { state.open = value; }],
}));
vi.mock('react-native', () => ({ View: 'View', useWindowDimensions: () => ({ width: state.width }) }));
vi.mock('lucide-react-native', () => ({ Activity: 'Activity', AlertTriangle: 'AlertTriangle', ListFilter: 'ListFilter', Check: 'Check', ChevronDown: 'ChevronDown' }));
vi.mock('../theme', () => ({ uiScale: { spacing: { 2: 8, 3: 12 } }, useTheme: () => ({ colors: { teal: 'teal' } }) }));

import { AlertFilters } from './AlertFilters';
import { FilterDropdown } from './FilterDropdown';

function dropdowns(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === FilterDropdown ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap(dropdowns)];
}

beforeEach(() => { state.open = null; state.width = 390; });

it('opens each filter independently and forwards selections including all parameters', () => {
  const props = { status: 'all', severity: 'all', parameter: null, onStatusChange: vi.fn(), onSeverityChange: vi.fn(), onParameterChange: vi.fn() } as const;
  expect(AlertFilters(props).props.children[0].props.style.flexDirection).toBe('row');
  state.width = 359;
  expect(AlertFilters(props).props.children[0].props.style.flexDirection).toBe('column');
  state.width = 390;
  let filters = dropdowns(AlertFilters(props));
  expect(filters.map((filter) => filter.props.label)).toEqual(['Status', 'Severity', 'Parameter']);
  (filters[0].props.onToggle as () => void)();
  filters = dropdowns(AlertFilters(props));
  expect(filters.map((filter) => filter.props.expanded)).toEqual([true, false, false]);
  (filters[1].props.onToggle as () => void)();
  filters = dropdowns(AlertFilters(props));
  expect(filters.map((filter) => filter.props.expanded)).toEqual([false, true, false]);
  (filters[1].props.onChange as (value: string) => void)('critical');
  expect(props.onSeverityChange).toHaveBeenCalledWith('critical');
  expect(state.open).toBeNull();
  (filters[0].props.onChange as (value: string) => void)('open');
  expect(props.onStatusChange).toHaveBeenCalledWith('open');
  (filters[2].props.onChange as (value: string) => void)('do');
  (filters[2].props.onChange as (value: string) => void)('all');
  expect(props.onParameterChange.mock.calls).toEqual([['do'], [null]]);
});
