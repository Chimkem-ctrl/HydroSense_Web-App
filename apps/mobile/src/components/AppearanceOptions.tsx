import { Pressable, Text, View } from 'react-native';
import { uiScale, useTheme } from '../theme';
import type { ThemeChoice } from '../theme';

const themeOptions: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceOptions() {
  const { choice, mode, setChoice, colors, error } = useTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={{ gap: uiScale.spacing[2] }}>
    {themeOptions.map((option) => {
      const selected = choice === option.value || (choice === 'system' && mode === option.value);
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => void setChoice(option.value)}
      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: selected ? colors.selected : colors.surface, borderWidth: 1, borderColor: selected ? colors.teal : colors.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? colors.teal : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
        {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal }} />}
      </View>
      <View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{option.label}</Text></View>
    </Pressable>;
    })}
    {error && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{error}</Text>}
  </View>;
}
