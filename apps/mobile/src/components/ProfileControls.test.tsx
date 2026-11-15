import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Switch: 'Switch', Text: 'Text', View: 'View' }));
vi.mock('../theme', () => ({ useTheme: () => ({ colors: { ink: '#000', muted: '#777', border: '#c4d2e8' } }) }));
vi.mock('./ui', () => ({ Button: 'Button' }));

import { AlertPreferenceControls, DeviceMaintenanceControls, SecurityControls } from './ProfileControls';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

describe('profile placeholder controls', () => {
  it('shows disabled notification switches', () => {
    const switches = elements(AlertPreferenceControls({ phone: '123', email: 'a@example.test' }), 'Switch');
    expect(switches.map((item) => item.props.accessibilityLabel)).toEqual(['SMS alerts', 'Email alerts']);
    expect(switches.every((item) => item.props.disabled === true && item.props.value === false)).toBe(true);
    const wrappers = elements(AlertPreferenceControls({}), 'View').filter((item) => {
      const style = item.props.style;
      return typeof style === 'object' && style !== null && 'borderColor' in style && style.borderColor === '#c4d2e880';
    });
    expect(wrappers).toHaveLength(2);
  });

  it('shows disabled security buttons', () => {
    const buttons = elements(SecurityControls({}), 'Button');
    expect(buttons.map((item) => item.props.label)).toEqual(['Change password', 'Sign out other devices']);
    expect(buttons.every((item) => item.props.disabled === true)).toBe(true);
  });

  it.each([
    ['operator', ['Request calibration', 'Request reboot']],
    ['manager', ['Reboot device']],
    ['admin', ['Reboot device']],
  ] as const)('shows disabled device actions for %s', (role, labels) => {
    const buttons = elements(DeviceMaintenanceControls({ role }), 'Button');
    expect(buttons.map((item) => item.props.label)).toEqual(labels);
    expect(buttons.every((item) => item.props.disabled === true)).toBe(true);
  });
});
