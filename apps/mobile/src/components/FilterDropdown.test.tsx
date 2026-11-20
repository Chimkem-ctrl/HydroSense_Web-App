import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('lucide-react-native', () => ({ Check: 'Check', ChevronDown: 'ChevronDown' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 1: 4, 2: 8, 3: 12 }, radius: { control: 12 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { teal: 'teal', border: 'border', muted: 'muted', selected: 'selected', surface: 'surface', ink: 'ink' } }),
}));

import { FilterDropdown } from './FilterDropdown';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === type ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type))];
}

it('reveals date inputs independently and toggles its own expansion', () => {
  const onToggle = vi.fn();
  const root = FilterDropdown({ label: 'Date range', summary: 'Start to end', icon: null, expanded: true, onToggle, children: <input /> });
  expect(elements(root, 'input')).toHaveLength(1);
  const button = elements(root, 'Pressable')[0];
  expect(button.props.accessibilityState).toEqual({ expanded: true, disabled: false });
  (button.props.onPress as () => void)();
  expect(onToggle).toHaveBeenCalledOnce();
  expect(elements(FilterDropdown({ label: 'Date range', summary: 'Start to end', icon: null, expanded: false, onToggle, children: <input /> }), 'input')).toHaveLength(0);
});
