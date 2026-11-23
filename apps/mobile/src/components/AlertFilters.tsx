import { useState } from 'react';
import { View } from 'react-native';
import { Activity, AlertTriangle, ListFilter } from 'lucide-react-native';
import type { AlertItem } from '@hydrosense/shared';
import { uiScale, useTheme } from '../theme';
import { FilterDropdown } from './FilterDropdown';

type Status = AlertItem['status'] | 'all';
type Severity = AlertItem['severity'] | 'all';
type Parameter = 'temperature' | 'do' | 'ph' | null;

const statuses = [{ value: 'all', label: 'All statuses' }, { value: 'open', label: 'New' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'resolved', label: 'Resolved' }] as const;
const severities = [{ value: 'all', label: 'All severities' }, { value: 'critical', label: 'Critical' }, { value: 'warning', label: 'Warning' }] as const;
const parameters = [{ value: 'all', label: 'All parameters' }, { value: 'temperature', label: 'Temperature' }, { value: 'do', label: 'DO' }, { value: 'ph', label: 'pH' }] as const;

export function AlertFilters({ status, severity, parameter, onStatusChange, onSeverityChange, onParameterChange }: {
  status: Status;
  severity: Severity;
  parameter: Parameter;
  onStatusChange: (value: Status) => void;
  onSeverityChange: (value: Severity) => void;
  onParameterChange: (value: Parameter) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<'status' | 'severity' | 'parameter' | null>(null);
  return <View style={{ gap: uiScale.spacing[3] }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiScale.spacing[3] }}>
      <FilterDropdown label="Status" summary={statuses.find((option) => option.value === status)?.label ?? status} icon={<ListFilter size={16} color={colors.teal} />} options={statuses} value={status} expanded={open === 'status'} onToggle={() => setOpen(open === 'status' ? null : 'status')} onChange={(value) => { const selected = statuses.find((option) => option.value === value); if (selected) { onStatusChange(selected.value); setOpen(null); } }} />
      <FilterDropdown label="Severity" summary={severities.find((option) => option.value === severity)?.label ?? severity} icon={<AlertTriangle size={16} color={colors.teal} />} options={severities} value={severity} expanded={open === 'severity'} onToggle={() => setOpen(open === 'severity' ? null : 'severity')} onChange={(value) => { const selected = severities.find((option) => option.value === value); if (selected) { onSeverityChange(selected.value); setOpen(null); } }} />
    </View>
    <FilterDropdown label="Parameter" summary={parameters.find((option) => option.value === (parameter ?? 'all'))?.label ?? 'All parameters'} icon={<Activity size={16} color={colors.teal} />} options={parameters} value={parameter ?? 'all'} expanded={open === 'parameter'} onToggle={() => setOpen(open === 'parameter' ? null : 'parameter')} onChange={(value) => { const selected = parameters.find((option) => option.value === value); if (selected) { onParameterChange(selected.value === 'all' ? null : selected.value); setOpen(null); } }} />
  </View>;
}
