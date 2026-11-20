import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tankId: 'tank-01' }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }));
vi.mock('../state', () => ({
  useSession: () => ({ user: { role: 'operator' } }),
  useTankSelection: () => ({
    tanks: [{ id: 'tank-01', name: 'Tank 01' }, { id: 'tank-02', name: 'Tank 02' }],
    tankId: state.tankId,
    setTankId: (id: string) => { state.tankId = id; },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock('../theme', () => ({
  uiScale: { radius: { pill: 999 }, spacing: { 2: 8, 4: 16 }, type: { body: 16 } },
  useTheme: () => ({ colors: { teal: 'active-border', border: 'border', selected: 'active-background', surface: 'surface', ink: 'ink' } }),
}));
vi.mock('./ui', () => ({ Button: 'Button', Card: 'Card', StateMessage: 'StateMessage' }));
vi.mock('./HatcheryPicker', () => ({ HatcheryPicker: 'HatcheryPicker' }));

import { TankPicker } from './TankPicker';

function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === 'Pressable' ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap(buttons),
  ];
}

beforeEach(() => { state.tankId = 'tank-01'; });

describe('tank picker', () => {
  it.each([false, true])('tracks selection and highlighting when switching tanks (horizontal: %s)', (horizontal) => {
    let chips = buttons(TankPicker({ horizontal }));
    expect(chips[0].props.accessibilityState).toEqual({ selected: true });
    expect(chips[1].props.accessibilityState).toEqual({ selected: false });
    (chips[1].props.onPress as () => void)();
    chips = buttons(TankPicker({ horizontal }));
    expect(chips[0].props.accessibilityState).toEqual({ selected: false });
    expect(chips[0].props.style).toMatchObject({ backgroundColor: 'surface', borderColor: 'border' });
    expect(chips[1].props.accessibilityState).toEqual({ selected: true });
    expect(chips[1].props.style).toMatchObject({ backgroundColor: 'active-background', borderColor: 'active-border' });
    (chips[0].props.onPress as () => void)();
    expect(buttons(TankPicker({ horizontal }))[0].props.accessibilityState).toEqual({ selected: true });
  });
});
