import { View } from 'react-native';
import { ClipboardList, CloudSun } from 'lucide-react-native';
import type { Role } from '@hydrosense/shared';
import { uiScale } from '../theme';
import { Button } from './ui';

export function ActivityLogActions({ role, width, onOpen }: { role: Role | null; width: number; onOpen: (kind: 'OPERATION' | 'ENVIRONMENT') => void }) {
  if (role === 'admin') return null;
  const stacked = width < 360;
  return <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: 'stretch', gap: uiScale.spacing[3] }}>
    <Button style={{ flex: stacked ? 0 : 1, minHeight: 48 }} label="Log operation" icon={<ClipboardList size={18} color="white" />} onPress={() => onOpen('OPERATION')} />
    <Button style={{ flex: stacked ? 0 : 1, minHeight: 48 }} label="Log weather / event" icon={<CloudSun size={18} color="white" />} onPress={() => onOpen('ENVIRONMENT')} />
  </View>;
}
