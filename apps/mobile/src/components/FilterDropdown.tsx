import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { uiScale, useTheme } from '../theme';

export type FilterOption = { value: string; label: string };

export function FilterDropdown({ label, summary, icon, expanded, onToggle, options, value, onChange, children }: {
  label: string;
  summary: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  options?: readonly FilterOption[];
  value?: string;
  onChange?: (value: string) => void;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const disabled = options !== undefined && options.length === 0;
  return <View style={{ flex: 1, minWidth: 0, gap: uiScale.spacing[2] }}>
    <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700' }}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onToggle} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], borderWidth: 1, borderColor: expanded ? colors.teal : colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, paddingHorizontal: uiScale.spacing[2] }}>
      {icon}<Text numberOfLines={1} style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{summary}</Text><ChevronDown size={16} color={colors.muted} />
    </Pressable>
    {expanded && <View accessibilityRole={options ? 'radiogroup' : undefined} accessibilityLabel={options ? `${label} options` : undefined} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface, overflow: 'hidden' }}>
      {options ? options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} onPress={() => onChange?.(option.value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[1], paddingHorizontal: uiScale.spacing[2], backgroundColor: option.value === value ? colors.selected : colors.surface }}>
        <Text style={{ flex: 1, color: option.value === value ? colors.teal : colors.ink }}>{option.label}</Text>{option.value === value && <Check size={16} color={colors.teal} />}
      </Pressable>) : <View style={{ padding: uiScale.spacing[3] }}>{children}</View>}
    </View>}
  </View>;
}
