import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, MapPin } from 'lucide-react-native';
import { useTankSelection } from '../state';
import { uiScale, useTheme } from '../theme';

export function HatcheryPicker() {
  const { hatchery, setHatchery, locations } = useTankSelection();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const options = [{ id: 'all', name: 'All hatcheries' }, ...locations];
  const selected = options.find((location) => location.id === hatchery);

  return <View style={{ gap: uiScale.spacing[2] }}>
    <Text style={{ color: colors.muted, fontSize: uiScale.type.caption, fontWeight: '700', letterSpacing: 0.6 }}>HATCHERY FILTER</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Hatchery filter, ${selected?.name ?? 'Select a hatchery'}`}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((value) => !value)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2], borderRadius: uiScale.radius.control, borderWidth: 1, borderColor: expanded ? colors.teal : colors.border, paddingHorizontal: uiScale.spacing[3], backgroundColor: colors.surface }}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2] }}>
        <MapPin size={17} color={colors.teal} />
        <Text numberOfLines={1} style={{ color: colors.ink, fontWeight: '700', fontSize: uiScale.type.body }}>{selected?.name ?? 'Select a hatchery'}</Text>
      </View>
      <ChevronDown size={18} color={colors.muted} />
    </Pressable>
    {expanded && <View accessibilityRole="radiogroup" accessibilityLabel="Hatchery options" style={{ overflow: 'hidden', borderRadius: uiScale.radius.control, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {options.map((location, index) => {
        const selected = hatchery === location.id;
        return <Pressable
          key={location.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          onPress={() => { setHatchery(location.id); setExpanded(false); }}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2], borderBottomWidth: index < options.length - 1 ? 1 : 0, borderBottomColor: colors.border, paddingHorizontal: uiScale.spacing[3], backgroundColor: selected ? colors.selected : colors.surface }}
        >
          <Text numberOfLines={1} style={{ flex: 1, color: selected ? colors.teal : colors.ink, fontWeight: selected ? '700' : '500', fontSize: uiScale.type.body }}>{location.name}</Text>
          {selected && <Check size={18} color={colors.teal} />}
        </Pressable>;
      })}
    </View>}
  </View>;
}
