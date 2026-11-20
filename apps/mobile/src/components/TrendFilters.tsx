import { useState } from 'react';
import { View } from 'react-native';
import { CalendarDays, Droplets } from 'lucide-react-native';
import { uiScale, useTheme } from '../theme';
import { FilterDropdown } from './FilterDropdown';

type Option = { value: string; label: string };

export function TrendFilters({ tanks, tankId, onTankChange, days, onDaysChange }: {
  tanks: readonly Option[];
  tankId: string;
  onTankChange: (value: string) => void;
  days: number;
  onDaysChange: (value: number) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<'tank' | 'range' | null>(null);
  const ranges = [{ value: '1', label: '24 hours' }, { value: '7', label: '7 days' }, { value: '21', label: '21 days' }];

  function filter(kind: 'tank' | 'range', label: string, value: string, options: readonly Option[], onChange: (value: string) => void) {
    const Icon = kind === 'tank' ? Droplets : CalendarDays;
    const selected = options.find((option) => option.value === value)?.label ?? 'None available';
    return <FilterDropdown label={label} summary={selected} icon={<Icon size={16} color={colors.teal} />} expanded={open === kind} onToggle={() => setOpen(open === kind ? null : kind)} options={options} value={value} onChange={(next) => { onChange(next); setOpen(null); }} />;
  }

  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiScale.spacing[3] }}>
    {filter('tank', 'Tank', tankId, tanks, onTankChange)}
    {filter('range', 'Date range', String(days), ranges, (value) => onDaysChange(Number(value)))}
  </View>;
}
