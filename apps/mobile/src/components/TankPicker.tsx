import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTankSelection } from '../state';
import { uiScale, useTheme } from '../theme';
import { Button, Card, StateMessage } from './ui';
import { HatcheryPicker } from './HatcheryPicker';

export function TankPicker({ horizontal = false }: { horizontal?: boolean }) {
  const { colors } = useTheme();
  const { tanks, tankId, setTankId, isLoading, error, refetch } = useTankSelection();
  if (isLoading) return <StateMessage message="Loading tanks…" loading />;
  if (error) return <Card><StateMessage message={`Could not load tanks: ${error.message}`} /><Button label="Retry tank list" onPress={refetch} secondary /></Card>;
  const chips = tanks.map((tank) => {
    const selected = tank.id === tankId;
    return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={tank.id} onPress={() => setTankId(tank.id)} style={{ minHeight: horizontal ? 44 : 48, justifyContent: 'center', borderRadius: uiScale.radius.pill, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.teal : colors.border, paddingVertical: uiScale.spacing[2], paddingHorizontal: uiScale.spacing[4], backgroundColor: selected ? colors.selected : colors.surface }}><Text style={{ color: selected ? colors.teal : colors.ink, fontWeight: '700', fontSize: uiScale.type.body }}>{tank.name}</Text></Pressable>;
  });
  const picker = horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Select tank" contentContainerStyle={{ gap: uiScale.spacing[2], alignItems: 'stretch' }}>{chips}</ScrollView>
    : <View accessibilityLabel="Select tank" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>{chips}</View>;
  return <View style={{ gap: uiScale.spacing[2] }}>
    <HatcheryPicker />
    {tanks.length ? picker : <StateMessage message="No tanks are available for the selected hatchery." />}
  </View>;
}
