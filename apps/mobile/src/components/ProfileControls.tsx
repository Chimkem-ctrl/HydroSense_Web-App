import { Switch, Text, View } from 'react-native';
import type { Role } from '@hydrosense/shared';
import { useTheme } from '../theme';
import { Button } from './ui';

export function AlertPreferenceControls({ phone, email }: { phone?: string | null; email?: string | null }) {
  const { colors } = useTheme();
  return <>
    <View style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>SMS alerts</Text>
        <View style={{ borderWidth: 1, borderColor: `${colors.border}80`, borderRadius: 999, backgroundColor: 'transparent', paddingHorizontal: 2 }}>
          <Switch accessibilityLabel="SMS alerts" accessibilityState={{ disabled: true, checked: false }} value={false} disabled />
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>Phone on file: {phone?.trim() || 'Not provided'}</Text>
    </View>
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }}>Email alerts</Text>
        <View style={{ borderWidth: 1, borderColor: `${colors.border}80`, borderRadius: 999, backgroundColor: 'transparent', paddingHorizontal: 2 }}>
          <Switch accessibilityLabel="Email alerts" accessibilityState={{ disabled: true, checked: false }} value={false} disabled />
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>Email on file: {email?.trim() || 'Not provided'}</Text>
    </View>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>Coming soon: delivery preferences. Critical alerts always appear in the Alerts center.</Text>
  </>;
}

export function SecurityControls({ email }: { email?: string | null }) {
  const { colors } = useTheme();
  return <>
    <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>Signed-in email: {email?.trim() || 'Not provided'}</Text>
    <Button label="Change password" secondary disabled onPress={() => {}} />
    <Button label="Sign out other devices" secondary disabled onPress={() => {}} />
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>Coming soon: password changes and signing out other devices.</Text>
  </>;
}

export function DeviceMaintenanceControls({ role }: { role: Role }) {
  const { colors } = useTheme();
  return <>
    {role === 'operator' ? <>
      <Button label="Request calibration" secondary disabled onPress={() => {}} />
      <Button label="Request reboot" secondary disabled onPress={() => {}} />
    </> : <Button label="Reboot device" secondary disabled onPress={() => {}} />}
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>Coming soon: device actions. Nothing is sent to hardware yet.</Text>
  </>;
}
