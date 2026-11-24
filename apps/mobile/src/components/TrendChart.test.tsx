import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Text: 'Text', View: 'View' }));
vi.mock('react-native-svg', () => ({ default: 'Svg', Circle: 'Circle', Line: 'Line', Path: 'Path', Rect: 'Rect', Text: 'SvgText' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 1: 4, 2: 8 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { muted: 'muted', teal: 'teal', border: 'border', normal: 'normal', critical: 'critical' } }),
}));

import { TrendChart } from './TrendChart';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === type ? [node] : []), ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type))];
}

const parameter = { key: 'temperature' as const, title: 'Temperature', unit: '°C', safeMin: 25, safeMax: 30 };
const reading = { id: 'a', tankId: 'tank', timestamp: '2024-01-01T22:00:00+08:00', temperature: 28, doMgL: 5, ph: 7 };

it('renders a single reading with finite coordinates and the configured safe band', () => {
  const chart = TrendChart({ readings: [reading], parameter });
  const circle = elements(chart, 'Circle')[0];
  expect(Number.isFinite(circle.props.cx)).toBe(true);
  expect(Number.isFinite(circle.props.cy)).toBe(true);
  expect(elements(chart, 'Rect').some((rect) => rect.props.fill === 'normal')).toBe(true);
});

it('breaks the line at invalid readings and offline gaps, and marks excursions', () => {
  const chart = TrendChart({ readings: [
    reading,
    { ...reading, id: 'b', timestamp: '2024-01-02T01:00:00+08:00', temperature: -999 },
    { ...reading, id: 'c', timestamp: '2024-01-02T07:00:00+08:00', temperature: 32 },
  ], parameter });
  expect(elements(chart, 'Path')).toHaveLength(2);
  expect(elements(chart, 'Circle').map((circle) => circle.props.fill)).toEqual(['teal', 'critical']);
  expect(elements(chart, 'Rect').some((rect) => rect.props.fill === 'muted')).toBe(true);
});

it('shows an empty message when no valid measurements exist', () => {
  const chart = TrendChart({ readings: [{ ...reading, temperature: -999 }], parameter });
  expect(elements(chart, 'Text')[0].props.children).toBe('No valid readings in this range.');
  expect(elements(chart, 'Svg')).toHaveLength(0);
});
