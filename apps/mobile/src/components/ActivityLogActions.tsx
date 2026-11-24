import { Pressable, Text, View } from 'react-native';
import { ClipboardList, CloudSun } from 'lucide-react-native';
import type { Role } from '@hydrosense/shared';
import { uiScale, useTheme } from '../theme';

export function ActivityLogActions({ role, onOpen }: { role: Role | null; width: number; onOpen: (kind: 'OPERATION' | 'ENVIRONMENT') => void }) {
  const { colors } = useTheme();
  if (role === 'admin') return null;
  const buttonStyle = { flex: 1, minWidth: 0, height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: uiScale.spacing[1], paddingHorizontal: uiScale.spacing[2], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.glassControl };
  const labelStyle = { color: colors.ink, fontSize: uiScale.type.caption + 1, fontWeight: '600' as const, flexShrink: 1 };
  return <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: uiScale.spacing[2] }}>
    <Pressable accessibilityRole="button" style={buttonStyle} onPress={() => onOpen('OPERATION')}><ClipboardList size={16} color={colors.teal} /><Text style={labelStyle} numberOfLines={1} adjustsFontSizeToFit>Log operation</Text></Pressable>
    <Pressable accessibilityRole="button" style={buttonStyle} onPress={() => onOpen('ENVIRONMENT')}><CloudSun size={16} color={colors.teal} /><Text style={labelStyle} numberOfLines={1} adjustsFontSizeToFit>Log weather / event</Text></Pressable>
  </View>;
}
