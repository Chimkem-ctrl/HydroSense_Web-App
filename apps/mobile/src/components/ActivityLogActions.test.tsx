import { Children } from 'react';
import type { ReactElement } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('lucide-react-native', () => ({ ClipboardList: 'ClipboardList', CloudSun: 'CloudSun' }));
vi.mock('../theme', () => ({ uiScale: { spacing: { 3: 12 } } }));
vi.mock('./ui', () => ({ Button: 'Button' }));

import { ActivityLogActions } from './ActivityLogActions';

it('hides logging actions for admins but retains both actions for operators', () => {
  const onOpen = vi.fn();
  expect(ActivityLogActions({ role: 'admin', width: 400, onOpen })).toBeNull();
  const actions = ActivityLogActions({ role: 'operator', width: 400, onOpen });
  const buttons = Children.toArray(actions!.props.children) as ReactElement<{ onPress: () => void }>[];
  buttons[0].props.onPress();
  buttons[1].props.onPress();
  expect(onOpen.mock.calls).toEqual([['OPERATION'], ['ENVIRONMENT']]);
  expect(ActivityLogActions({ role: 'manager', width: 320, onOpen })?.props.style.flexDirection).toBe('column');
});
