import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('lucide-react-native', () => ({ ChevronDown: 'ChevronDown', ChevronUp: 'ChevronUp' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 2: 8, 3: 12 }, radius: { control: 12 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { border: '#555', ink: '#fff', muted: '#aaa' } }),
}));

import { AlertFilterSection } from './AlertFilterSection';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

describe('alert filter section', () => {
  const options = [{ value: 'all', label: 'All statuses' }, { value: 'open', label: 'New' }] as const;

  it('shows the current choice and toggles the collapsed section', () => {
    const onToggle = vi.fn();
    const root = AlertFilterSection({ title: 'Status', options, value: 'open', expanded: false, onToggle, onChange: vi.fn() });
    const button = elements(root, 'Pressable')[0];
    expect(button.props.accessibilityLabel).toBe('Status: New');
    expect(button.props.accessibilityState).toEqual({ expanded: false });
    expect(elements(root, 'Pressable')).toHaveLength(1);
    (button.props.onPress as () => void)();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('marks the selected option and forwards a new choice', () => {
    const onChange = vi.fn();
    const root = AlertFilterSection({ title: 'Status', options, value: 'open', expanded: true, onToggle: vi.fn(), onChange });
    const radios = elements(root, 'Pressable').filter((element) => element.props.accessibilityRole === 'radio');
    expect(radios.map((radio) => radio.props.accessibilityState)).toEqual([{ checked: false }, { checked: true }]);
    (radios[0].props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
