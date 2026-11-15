import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { formatManilaDateTime } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';
import { canAccess } from './access';
import { Button, Card, DataRow, Page, StateMessage, Title } from './components/ui';
import { AlertPreferenceControls, DeviceMaintenanceControls, SecurityControls } from './components/ProfileControls';
import { groupByHatchery, hatcheryLabel } from './management';
import type { MainTabParamList } from './navigation';
import { api, DATA_MODE, getAccountProfile, listPendingAccounts, removeAccount, reviewPendingAccount } from './services/client';
import { useSession, useTankSelection } from './state';
import { uiScale, useTheme } from './theme';
import type { Palette } from './theme';

function useProfile() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => {
      if (!user) throw new Error('Sign in to load your profile.');
      return getAccountProfile(user.id);
    },
    enabled: Boolean(user) && DATA_MODE === 'api',
  });
}

function value(text?: string | null) {
  return text?.trim() || 'Not provided';
}

function ProfileRow({ label, text, detail }: { label: string; text: string; detail?: string }) {
  const { colors } = useTheme();
  return <View style={{ paddingVertical: 6, gap: 3 }}>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>{label}</Text>
    <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>{text}</Text>
    {detail && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{detail}</Text>}
  </View>;
}

function confirmAction(title: string, message: string, action: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) action();
    return;
  }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: title, style: destructive ? 'destructive' : 'default', onPress: action }]);
}

export function ProfileScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'Profile'>) {
  const { user } = useSession();
  const { tanks, tankId, isLoading, error, refetch } = useTankSelection();
  const profile = useProfile();
  const tank = tanks.find((item) => item.id === tankId);
  return <Page maxWidth={680}>
    <Title detail="View your account, role, hatchery, and alert preferences.">My profile</Title>
    {DATA_MODE === 'api' && profile.isLoading ? <Card><StateMessage message="Loading profile..." loading /></Card> :
      DATA_MODE === 'api' && profile.isError ? <Card><StateMessage message={`Could not load profile: ${profile.error.message}`} /><Button label="Retry profile" secondary onPress={() => void profile.refetch()} /></Card> : <>
        <Card title="Contact details">
          <ProfileRow label="Email" text={value(profile.data?.email)} detail="Cannot be changed" />
          <ProfileRow label="Phone" text={value(profile.data?.phone)} />
          <ProfileRow label="Address" text={value(profile.data?.address)} />
        </Card>
        <Card title="Role & assignment">
          <ProfileRow label="Name" text={value(profile.data?.name ?? user?.name)} />
          <ProfileRow label="Role" text={value(profile.data?.role ?? user?.role)} />
          <ProfileRow label="Position" text={value(profile.data?.position)} />
          <ProfileRow label="Hatchery / site" text={profile.data?.site?.trim() ? hatcheryLabel(profile.data.site) : 'Not provided'} />
          <ProfileRow label="Employee ID" text={value(profile.data?.employeeId)} />
        </Card>
        <Card title="Emergency contact">
          <ProfileRow label="Name" text={value(profile.data?.emergencyContactName)} />
          <ProfileRow label="Phone" text={value(profile.data?.emergencyContactPhone)} />
        </Card>
        <Card title="Account">
          <ProfileRow label="Account status" text={value(profile.data?.status)} />
          <ProfileRow label="Account created" text={profile.data?.createdAt ? `${formatManilaDateTime(profile.data.createdAt)} PHT` : 'Not provided'} />
        </Card>
      </>}
    <Card title="Alert notifications"><AlertPreferenceControls phone={profile.data?.phone} email={profile.data?.email} /></Card>
    <Card title="Appearance"><Button label="Choose theme" secondary onPress={() => navigation.getParent()?.navigate('Appearance')} /></Card>
    <Card title="Security"><SecurityControls email={profile.data?.email} /></Card>
    <Card title="Device maintenance">
      {isLoading ? <StateMessage message="Loading selected tank..." loading /> : error ? <><StateMessage message={`Could not load tank: ${error.message}`} /><Button label="Retry" secondary onPress={refetch} /></> : <>
        <DataRow label="Selected tank" value={value(tank?.name)} />
        <DataRow label="Device ID" value={value(tank?.deviceId)} />
      </>}
      {user && <DeviceMaintenanceControls role={user.role} />}
    </Card>
  </Page>;
}

export function UsersScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createManagementStyles(colors);
  const queryClient = useQueryClient();
  const allowed = canAccess(user?.role ?? null, 'users');
  const admin = user?.role === 'admin';
  const profile = useProfile();
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role | undefined>>({});
  const users = useQuery({ queryKey: ['admin-users', user?.id], queryFn: () => api.listUsers(), enabled: allowed && (admin || DATA_MODE === 'mock' || Boolean(profile.data?.site?.trim())) });
  const pending = useQuery({ queryKey: ['pending-accounts', user?.id], queryFn: listPendingAccounts, enabled: admin && DATA_MODE === 'api', refetchInterval: 5000 });
  const invalidate = async () => {
    await Promise.all(['pending-accounts', 'admin-users', 'audit-logs'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const review = useMutation({ mutationFn: ({ id, role }: { id: string; role: Role | null }) => reviewPendingAccount(id, role), onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, role }: { id: string; role: 'operator' | 'manager' }) => api.updateUserRole(id, role, user?.name ?? ''), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: removeAccount, onSuccess: invalidate });
  if (!allowed) return <Page><StateMessage message="You do not have access to users and roles." /></Page>;
  const visibleUsers = (users.data ?? []).filter((item) => admin || (DATA_MODE === 'mock' ? item.role !== 'admin' : item.role !== 'admin' && hatcheryLabel(item.site) === hatcheryLabel(profile.data?.site)));
  return <Page maxWidth={680}>
    <Title detail={admin ? 'Manage team accounts and review requests.' : 'Review accounts for your hatchery.'}>Users & roles</Title>
    {!admin && DATA_MODE === 'api' && profile.isLoading ? <StateMessage message="Loading hatchery assignment..." loading /> :
      !admin && DATA_MODE === 'api' && profile.isError ? <Card><StateMessage message={`Could not load hatchery: ${profile.error.message}`} /><Button label="Retry" secondary onPress={() => void profile.refetch()} /></Card> :
      !admin && DATA_MODE === 'api' && !profile.data?.site?.trim() ? <StateMessage message="No hatchery is assigned to your account. Contact an administrator." /> : <>
      {admin && <Card title="Pending requests">
        <Text style={styles.intro}>Review new account requests and assign a role.</Text>
        {DATA_MODE === 'mock' ? <StateMessage message="Account review is unavailable in demo mode." /> : pending.isLoading ? <StateMessage message="Loading requests..." loading /> :
          pending.isError ? <><StateMessage message={`Could not load requests: ${pending.error.message}`} /><Button label="Retry requests" secondary onPress={() => void pending.refetch()} /></> :
          !pending.data?.length ? <StateMessage message="No account requests are awaiting review." /> :
          [...groupByHatchery(pending.data, (item) => item.site)].map(([site, accounts]) => <View key={site} style={styles.group}>
            <Text style={styles.site}>{site}</Text>
            {accounts.map((account) => <View key={account.id} style={styles.account}>
              <Text style={styles.name}>{account.firstName} {account.lastName}</Text>
              <Text style={styles.detail}>{account.email}</Text>
              <Text style={styles.detail}>Phone: {value(account.phone)}</Text>
              <Text style={styles.detail}>Employee ID: {value(account.employeeId)}</Text>
              <Text style={styles.label}>Approval role</Text>
              <View accessibilityRole="radiogroup" style={styles.roleChoices}>
                {(['operator', 'manager', 'admin'] as const).map((role) => <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: selectedRoles[account.id] === role }} onPress={() => setSelectedRoles((current) => ({ ...current, [account.id]: role }))} style={[styles.roleOption, selectedRoles[account.id] === role && styles.roleSelected]}><Text style={[styles.roleText, selectedRoles[account.id] === role && styles.roleTextSelected]}>{role[0].toUpperCase() + role.slice(1)}</Text></Pressable>)}
              </View>
              <Button label="Approve" disabled={!selectedRoles[account.id] || review.isPending} onPress={() => { const role = selectedRoles[account.id]; if (role) review.mutate({ id: account.id, role }); }} />
              <Button label="Reject" secondary disabled={review.isPending} onPress={() => confirmAction('Reject request', `Reject the request for ${account.firstName} ${account.lastName}?`, () => review.mutate({ id: account.id, role: null }), true)} />
            </View>)}
          </View>)}
        {review.isError && <StateMessage message={`Could not review request: ${review.error.message}`} />}
      </Card>}
      <Card title="Team accounts">
        <Text style={styles.intro}>View team members grouped by hatchery{admin ? ' and manage their roles.' : '.'}</Text>
        {users.isLoading ? <StateMessage message="Loading accounts..." loading /> : users.isError ? <><StateMessage message={`Could not load accounts: ${users.error.message}`} /><Button label="Retry accounts" secondary onPress={() => void users.refetch()} /></> :
          !visibleUsers.length ? <StateMessage message="No team users are registered." /> :
          [...groupByHatchery(visibleUsers, (item) => item.site)].map(([site, accounts]) => <View key={site} style={styles.group}>
            <Text style={styles.site}>{site}</Text>
            {accounts.map((account) => <View key={account.id} style={styles.account}>
              <View style={styles.accountHeading}><Text style={styles.name}>{account.name || account.email}</Text><View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{account.role}</Text></View></View>
              <Text style={styles.detail}>{account.email}</Text>
              <Text style={styles.detail}>Phone: {value(account.phone)}</Text>
              {account.lastActive && <Text style={styles.detail}>Last active: {formatManilaDateTime(account.lastActive)} PHT</Text>}
              {admin && account.role !== 'admin' && <>
                <Button label={`Change to ${account.role === 'manager' ? 'operator' : 'manager'}`} secondary disabled={update.isPending} onPress={() => {
                  const role = account.role === 'manager' ? 'operator' : 'manager';
                  confirmAction('Change role', `Change ${account.name} to ${role}?`, () => update.mutate({ id: account.id, role }));
                }} />
                {DATA_MODE === 'api' && <Button label="Remove account" secondary disabled={remove.isPending} onPress={() => confirmAction('Remove account', `Remove ${account.name}? This cannot be undone.`, () => remove.mutate(account.id), true)} />}
              </>}
            </View>)}
          </View>)}
        {update.isError && <StateMessage message={`Could not change role: ${update.error.message}`} />}
        {remove.isError && <StateMessage message={`Could not remove account: ${remove.error.message}`} />}
      </Card>
    </>}
  </Page>;
}

const createManagementStyles = (colors: Palette) => StyleSheet.create({
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  group: { gap: 10, marginTop: 4 },
  site: { color: colors.teal, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  account: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 8, backgroundColor: 'transparent' },
  accountHeading: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 },
  name: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: uiScale.radius.pill, borderColor: colors.border },
  roleSelected: { borderColor: colors.teal, backgroundColor: colors.selected },
  roleText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  roleTextSelected: { color: colors.teal },
  roleBadge: { backgroundColor: colors.selected, borderRadius: uiScale.radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  roleBadgeText: { color: colors.teal, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
});

export function AuditLogsScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const allowed = canAccess(user?.role ?? null, 'admin');
  const logs = useQuery({ queryKey: ['audit-logs', user?.id], queryFn: () => api.listAuditLogs(), enabled: allowed });
  if (!allowed) return <Page><StateMessage message="You do not have access to audit logs." /></Page>;
  return <Page maxWidth={680}><Title detail="Review admin actions and operational events (Asia/Manila).">Audit & system logs</Title><Card>
    {logs.isLoading ? <StateMessage message="Loading audit events..." loading /> : logs.isError ? <><StateMessage message={`Could not load audit events: ${logs.error.message}`} /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></> :
      !logs.data?.length ? <StateMessage message="No audit or system logs are available." /> : logs.data.map((log) => <View key={log.id} style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{log.action} · {log.user}</Text><Text style={{ color: colors.muted }}>{formatManilaDateTime(log.timestamp)} PHT · {log.detail}</Text></View>)}
  </Card></Page>;
}
