import { Switch, Text, View } from 'react-native';
import type { Role } from '@hydrosense/shared';
import { useTheme } from '../theme';
import { Button } from './ui';

export function AlertPreferenceControls() {
  const { colors } = useTheme();
  return <>
    <View style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>SMS alerts</Text>
        <View style={{ borderWidth: 1, borderColor: `${colors.border}80`, borderRadius: 999, backgroundColor: 'transparent', paddingHorizontal: 2 }}>
          <Switch accessibilityLabel="SMS alerts" accessibilityState={{ disabled: true, checked: false }} value={false} disabled />
        </View>
      </View>
    </View>
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>Email alerts</Text>
        <View style={{ borderWidth: 1, borderColor: `${colors.border}80`, borderRadius: 999, backgroundColor: 'transparent', paddingHorizontal: 2 }}>
          <Switch accessibilityLabel="Email alerts" accessibilityState={{ disabled: true, checked: false }} value={false} disabled />
        </View>
      </View>
    </View>
  </>;
}

export function SecurityControls() {
  const { colors } = useTheme();
  return <>
    <Button label="Change password" secondary disabled onPress={() => {}} />
  </>;
}

export function DeviceMaintenanceControls({ role }: { role: Role }) {
  const { colors } = useTheme();
  return <>
    {role === 'operator' ? <>
      <Button label="Request calibration" secondary disabled onPress={() => {}} />
      <Button label="Request reboot" secondary disabled onPress={() => {}} />
    </> : <Button label="Reboot device" secondary disabled onPress={() => {}} />}
  </>;
}
