import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { safeRangeGauge } from '@hydrosense/shared';

vi.mock('react-native', () => ({ Text: 'Text', View: 'View' }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('../theme', () => ({ useTheme: () => ({ colors: { ink: '#fff', canvas: '#000' } }) }));

import { RangeBar } from './RangeBar';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

describe('range bar', () => {
  it('aligns the colored range, marker and labels with the configured thresholds', () => {
    const gauge = safeRangeGauge(30, { parameter: 'temperature', min: 28, max: 32 });
    if (!gauge) throw new Error('Expected a valid gauge.');
    const root = RangeBar({ gauge, min: 28, max: 32, accessibilityLabel: 'Temperature, 30 °C. Safe 28–32 °C. Normal.' });
    expect(root.props.accessibilityLabel).toContain('Safe 28–32 °C');
    expect(elements(root, 'LinearGradient')[0].props.style).toMatchObject({ left: '25%', width: '50%' });
    expect(elements(root, 'View').some((item) => (item.props.style as { left?: string })?.left === '50%')).toBe(true);
    expect(elements(root, 'Text').map((item) => item.props.children)).toEqual([28, 32]);
  });

  it('clamps the marker and leaves the upper end safe when only a minimum is set', () => {
    const gauge = safeRangeGauge(20, { parameter: 'do', min: 5 });
    if (!gauge) throw new Error('Expected a valid gauge.');
    const root = RangeBar({ gauge, min: 5, accessibilityLabel: 'Dissolved oxygen' });
    expect(elements(root, 'LinearGradient')[0].props.style).toMatchObject({ left: '50%', width: '50%' });
    expect(elements(root, 'View').some((item) => (item.props.style as { left?: string })?.left === '100%')).toBe(true);
    expect(elements(root, 'Text').map((item) => item.props.children)).toEqual([5]);
  });
});
