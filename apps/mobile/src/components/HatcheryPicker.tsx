import { Pressable, Text, View } from 'react-native';
import { useTankSelection } from '../state';
import { uiScale, useTheme } from '../theme';

export function HatcheryPicker() {
  const { hatchery, setHatchery, locations } = useTankSelection();
  const { colors } = useTheme();
  return <View style={{ gap: uiScale.spacing[2] }}>
    <Text style={{ color: colors.muted, fontWeight: '700' }}>Hatchery</Text>
    <View accessibilityRole="radiogroup" accessibilityLabel="Hatchery" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
      {[{ id: 'all', name: 'All hatcheries' }, ...locations].map((location) => {
        const selected = hatchery === location.id;
        return <Pressable key={location.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setHatchery(location.id)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: uiScale.radius.pill, borderWidth: 1, borderColor: selected ? colors.teal : colors.border, paddingHorizontal: uiScale.spacing[4], backgroundColor: selected ? colors.selected : colors.surface }}>
          <Text style={{ color: selected ? colors.teal : colors.ink, fontWeight: '700' }}>{location.name}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
