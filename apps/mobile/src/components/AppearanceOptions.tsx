import { Pressable, Text, View } from 'react-native';
import { uiScale, useTheme } from '../theme';
import type { ThemeChoice } from '../theme';

const themeOptions: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Match your device setting' },
  { value: 'light', label: 'Light', hint: 'Light background' },
  { value: 'dark', label: 'Dark', hint: 'Dark background, easier to read at night' },
];

export function AppearanceOptions() {
  const { choice, setChoice, colors, error } = useTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={{ gap: uiScale.spacing[2] }}>
    {themeOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: choice === option.value }} onPress={() => void setChoice(option.value)}
      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: choice === option.value ? colors.selected : colors.surface, borderWidth: 1, borderColor: choice === option.value ? colors.teal : colors.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: choice === option.value ? colors.teal : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
        {choice === option.value && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal }} />}
      </View>
      <View style={{ flex: 1, gap: uiScale.spacing[1] }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{option.label}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>{option.hint}</Text></View>
    </Pressable>)}
    {error && <Text accessibilityRole="alert" style={{ color: colors.critical }}>{error}</Text>}
  </View>;
}
