import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ choice: 'system', error: null as string | null, setChoice: vi.fn() }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 1: 4, 2: 8 } },
  useTheme: () => ({
    choice: state.choice, setChoice: state.setChoice, error: state.error,
    mode: 'dark', colors: { selected: '#def', surface: '#fff', teal: '#06c', border: '#ccc', muted: '#444', ink: '#000', critical: '#c00' },
  }),
}));

import { AppearanceOptions } from './AppearanceOptions';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

beforeEach(() => {
  state.choice = 'system';
  state.error = null;
  state.setChoice.mockReset();
});

describe('inline appearance options', () => {
  it('shows light and dark choices and saves the selected theme', () => {
    const options = elements(AppearanceOptions(), 'Pressable');
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.props.accessibilityState)).toEqual([{ checked: false }, { checked: true }]);
    (options[1].props.onPress as () => void)();
    expect(state.setChoice).toHaveBeenCalledWith('dark');
    state.choice = 'dark';
    expect(elements(AppearanceOptions(), 'Pressable')[1].props.accessibilityState).toEqual({ checked: true });
  });

  it('surfaces preference storage errors', () => {
    state.error = 'Could not save appearance preference.';
    expect(elements(AppearanceOptions(), 'Text').some((item) => item.props.accessibilityRole === 'alert' && item.props.children === state.error)).toBe(true);
  });
});
