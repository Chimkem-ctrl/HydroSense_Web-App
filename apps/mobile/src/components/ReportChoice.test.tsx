import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
vi.mock('lucide-react-native', () => ({ Check: 'Check' }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 2: 8, 3: 12 }, radius: { control: 12 } },
  useTheme: () => ({ colors: { teal: 'teal', border: 'border', muted: 'muted', selected: 'selected', surface: 'surface', ink: 'ink' } }),
}));

import { ReportChoice } from './ReportChoice';

it.each(['checkbox', 'radio'] as const)('exposes and toggles a %s selection', (kind) => {
  const onPress = vi.fn();
  const choice = ReportChoice({ kind, label: 'Selection', selected: true, onPress });
  expect(choice.props.accessibilityRole).toBe(kind);
  expect(choice.props.accessibilityState).toEqual({ checked: true });
  expect(choice.props.style.backgroundColor).toBe('selected');
  choice.props.onPress();
  expect(onPress).toHaveBeenCalledOnce();
  expect(ReportChoice({ kind, label: 'Selection', selected: false, onPress }).props.accessibilityState).toEqual({ checked: false });
});
