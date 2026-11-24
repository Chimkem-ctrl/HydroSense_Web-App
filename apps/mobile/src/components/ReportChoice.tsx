import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { uiScale, useTheme } from '../theme';

export function ReportChoice({ label, selected, onPress, kind, icon }: { label: string; selected: boolean; onPress: () => void; kind: 'checkbox' | 'radio'; icon?: ReactNode }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole={kind} accessibilityLabel={label} accessibilityState={{ checked: selected }} onPress={onPress} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[2], borderWidth: 1, borderColor: selected ? colors.teal : colors.border, borderRadius: uiScale.radius.control, backgroundColor: selected ? colors.selected : colors.surface }}>
    <View style={{ width: 20, height: 20, borderRadius: kind === 'radio' ? 10 : 5, borderWidth: 1.5, borderColor: selected ? colors.teal : colors.muted, backgroundColor: selected ? colors.teal : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{selected && <Check size={14} color="white" />}</View>
    {icon}<Text style={{ color: selected ? colors.teal : colors.ink, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}
