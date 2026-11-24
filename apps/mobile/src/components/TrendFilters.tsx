import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Droplets } from 'lucide-react-native';
import { uiScale, useTheme } from '../theme';
import { FilterDropdown } from './FilterDropdown';
import { CalendarFilterField } from './ui';

type Option = { value: string; label: string };

export function TrendFilters({ tanks, tankId, onTankChange, days, onDaysChange, from, to, onFromChange, onToChange, today, action }: {
  tanks: readonly Option[];
  tankId: string;
  onTankChange: (value: string) => void;
  days: number;
  onDaysChange: (value: number) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  today: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const ranges = [{ value: 1, label: '24 hours' }, { value: 7, label: '7 days' }, { value: 21, label: 'Full cycle' }, { value: 0, label: 'Custom' }];

  return <View style={{ gap: uiScale.spacing[2] }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiScale.spacing[2] }}>
      <FilterDropdown label="Tank" summary={tanks.find((tank) => tank.value === tankId)?.label ?? 'None available'} icon={<Droplets size={14} color={colors.teal} />} expanded={open} onToggle={() => setOpen(!open)} options={tanks} value={tankId} onChange={(value) => { onTankChange(value); setOpen(false); }} />
      {action}
    </View>
    <View accessibilityLabel="Trend range" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiScale.spacing[2] }}>
      {ranges.map((range) => <Pressable key={range.value} accessibilityRole="button" accessibilityLabel={range.value === 21 ? 'Full cycle (21 days)' : range.label} accessibilityState={{ selected: days === range.value }} onPress={() => onDaysChange(range.value)} style={{ minHeight: 40, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: uiScale.spacing[2], borderWidth: 1, borderColor: days === range.value ? colors.teal : colors.border, borderRadius: uiScale.radius.control, backgroundColor: days === range.value ? colors.selected : colors.surface }}>
        <Text style={{ color: days === range.value ? colors.teal : colors.ink, fontSize: uiScale.type.caption, fontWeight: '700' }}>{range.label}</Text>
      </Pressable>)}
    </View>
    {days === 0 && <View style={{ flexDirection: width < 360 ? 'column' : 'row', gap: uiScale.spacing[2] }}>
      <CalendarFilterField label="From date (PHT)" value={from} onChangeText={onFromChange} max={to && to < today ? to : today} />
      <CalendarFilterField label="To date (PHT)" value={to} onChangeText={onToChange} min={from} max={today} />
    </View>}
  </View>;
}
