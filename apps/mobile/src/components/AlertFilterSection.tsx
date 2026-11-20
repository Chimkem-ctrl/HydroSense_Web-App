import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { uiScale, useTheme } from '../theme';

type FilterOption<T extends string | null> = { value: T; label: string; color?: string };

export function AlertFilterSection<T extends string | null>({ title, options, value, expanded, onToggle, onChange }: {
  title: string;
  options: readonly FilterOption<T>[];
  value: T;
  expanded: boolean;
  onToggle: () => void;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const selectedLabel = options.find((option) => option.value === value)?.label;
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${selectedLabel}`} accessibilityState={{ expanded }} onPress={onToggle} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: uiScale.spacing[2] }}>
      <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{title}</Text><Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{selectedLabel}</Text></View>
      <Chevron size={18} color={colors.ink} />
    </Pressable>
    {expanded && <View accessibilityRole="radiogroup" accessibilityLabel={`Filter alerts by ${title.toLowerCase()}`} style={{ paddingLeft: uiScale.spacing[3] }}>
      {options.map((option) => {
        const selected = option.value === value;
        return <Pressable key={option.value === null ? '__all__' : option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onChange(option.value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2] }}>
          {option.color && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: option.color }} />}
          <Text style={{ color: colors.ink, flex: 1 }}>{option.label}</Text>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: selected ? colors.ink : colors.muted, alignItems: 'center', justifyContent: 'center' }}>{selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} />}</View>
        </Pressable>;
      })}
    </View>}
  </View>;
}
