import { Switch, Text, View } from 'react-native';
import type { Role } from '@hydrosense/shared';
import { RotateCcw } from 'lucide-react-native';
import { useTheme } from '../theme';
import { Button } from './ui';

export function AlertPreferenceControls() {
  const { colors } = useTheme();
  return <>
    <View style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>SMS alerts</Text>
        <Switch accessibilityLabel="SMS alerts" accessibilityState={{ disabled: true, checked: false }} value={false} disabled />
      </View>
    </View>
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>Email alerts</Text>
        <Switch accessibilityLabel="Email alerts" accessibilityState={{ disabled: true, checked: false }} value={false} disabled />
      </View>
    </View>
  </>;
}

export function DeviceMaintenanceControls({ role }: { role: Role }) {
  const { colors } = useTheme();
  return <>
    {role === 'operator' ? <>
      <Button label="Request calibration" secondary disabled onPress={() => {}} />
      <Button label="Request reboot" secondary disabled icon={<RotateCcw size={18} color={colors.ink} />} onPress={() => {}} />
    </> : <Button label="Reboot device" secondary disabled icon={<RotateCcw size={18} color={colors.ink} />} onPress={() => {}} />}
  </>;
}
