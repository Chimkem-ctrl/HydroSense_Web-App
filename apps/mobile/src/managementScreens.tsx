import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Dialog } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatManilaDateTime } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';
import { Check, X } from 'lucide-react-native';
import { canAccess } from './access';
import { Button, Card, GlassDialog, Page, StateMessage, Title } from './components/ui';
import { AlertPreferenceControls, DeviceMaintenanceControls, SecurityControls } from './components/ProfileControls';
import { AppearanceOptions } from './components/AppearanceOptions';
import { groupByHatchery, hatcheryLabel } from './management';
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
  return text?.trim() || 'N/A';
}

function isTankOne(name: string) {
  return /^tank\s+0?1\b/i.test(name.trim());
}

function sameHatchery(left: string, right: string) {
  return hatcheryLabel(left).trim().toLowerCase() === hatcheryLabel(right).trim().toLowerCase();
}

function ProfileRow({ label, text, detail }: { label: string; text: string; detail?: string }) {
  const { colors } = useTheme();
  return <View style={{ paddingVertical: 6, gap: 3 }}>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>{label}</Text>
    <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>{text}</Text>
    {detail && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{detail}</Text>}
  </View>;
}

export function ProfileScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const styles = createManagementStyles(colors);
  const { tanks, tankId, isLoading, error, refetch } = useTankSelection();
  const profile = useProfile();
  const [maintenanceHatchery, setMaintenanceHatchery] = useState('');
  const [maintenanceTankId, setMaintenanceTankId] = useState('');
  const hatcheries = [...new Set(tanks.map((item) => item.site.trim()).filter(Boolean))];
  const assignedHatchery = profile.data?.site || tanks.find((item) => item.id === tankId)?.site || '';
  const selectedHatchery = user?.role === 'admin' ? maintenanceHatchery : assignedHatchery;
  const maintenanceTanks = selectedHatchery
    ? tanks.filter((item) => isTankOne(item.name) && sameHatchery(item.site, selectedHatchery))
    : [];
  return <Page maxWidth={680}>
    <Title detail="View your account, role, hatchery, and alert preferences.">My profile</Title>
    {DATA_MODE === 'api' && profile.isLoading ? <Card><StateMessage message="Loading profile..." loading /></Card> :
      DATA_MODE === 'api' && profile.isError ? <Card><StateMessage message={`Could not load profile: ${profile.error.message}`} /><Button label="Retry profile" secondary onPress={() => void profile.refetch()} /></Card> : <>
        <Card title="Contact details">
          <ProfileRow label="Email" text={value(profile.data?.email)} />
          <ProfileRow label="Phone" text={value(profile.data?.phone)} />
          <ProfileRow label="Address" text={value(profile.data?.address)} />
        </Card>
        <Card title="Role & assignment">
          <ProfileRow label="Name" text={value(profile.data?.name ?? user?.name)} />
          <ProfileRow label="Role" text={value(profile.data?.role ?? user?.role)} />
          <ProfileRow label="Requested role" text={value(profile.data?.requestedRole)} />
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
    <Card title="Alert notifications"><AlertPreferenceControls /></Card>
    <Card title="Appearance"><AppearanceOptions /></Card>
    <Card title="Security"><SecurityControls /></Card>
    <Card title="Device maintenance">
      {isLoading ? <StateMessage message="Loading selected tank..." loading /> : error ? <><StateMessage message={`Could not load tank: ${error.message}`} /><Button label="Retry" secondary onPress={refetch} /></> : <>
        {user?.role === 'admin' && <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Hatchery</Text>
          {hatcheries.length ? hatcheries.map((site) => <Pressable key={site} accessibilityRole="radio" accessibilityState={{ checked: maintenanceHatchery === site }} onPress={() => {
            setMaintenanceHatchery(site);
            setMaintenanceTankId('');
          }} style={[styles.roleOption, maintenanceHatchery === site && styles.roleSelected]}>
            <Text style={[styles.roleText, maintenanceHatchery === site && styles.roleTextSelected]}>{hatcheryLabel(site)}</Text>
          </Pressable>) : <Text style={styles.detail}>N/A</Text>}
        </View>}
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Tank</Text>
          {user?.role === 'admin' && !maintenanceHatchery ? <Text style={styles.detail}>Select a hatchery first.</Text> :
            maintenanceTanks.length ? maintenanceTanks.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: maintenanceTankId === item.id }} onPress={() => setMaintenanceTankId(item.id)} style={[styles.roleOption, maintenanceTankId === item.id && styles.roleSelected]}>
              <Text style={[styles.roleText, maintenanceTankId === item.id && styles.roleTextSelected]}>{item.name}</Text>
            </Pressable>) : <Text style={styles.detail}>{selectedHatchery ? 'Tank 01 is not available for this hatchery.' : 'Hatchery assignment is not available.'}</Text>}
        </View>
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
  const [confirmation, setConfirmation] = useState<UserConfirmation | null>(null);
  const users = useQuery({ queryKey: ['admin-users', user?.id], queryFn: () => api.listUsers(), enabled: allowed && (admin || DATA_MODE === 'mock' || Boolean(profile.data?.site?.trim())) });
  const pending = useQuery({ queryKey: ['pending-accounts', user?.id], queryFn: listPendingAccounts, enabled: admin && DATA_MODE === 'api', refetchInterval: 5000 });
  const invalidate = async () => {
    await Promise.all(['pending-accounts', 'admin-users', 'audit-logs'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const review = useMutation({ mutationFn: ({ id, role }: { id: string; role: Role | null }) => reviewPendingAccount(id, role), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: removeAccount, onSuccess: invalidate });
  function confirmUserAction() {
    if (!confirmation) return;
    const current = confirmation;
    setConfirmation(null);
    if (current.action === 'approve') review.mutate({ id: current.id, role: current.role });
    else if (current.action === 'reject') review.mutate({ id: current.id, role: null });
    else remove.mutate(current.id);
  }
  if (!allowed) return <Page><StateMessage message="You do not have access to users and roles." /></Page>;
  const visibleUsers = (users.data ?? []).filter((item) => item.role !== 'admin' && (admin || hatcheryLabel(item.site) === hatcheryLabel(profile.data?.site)));
  const visibleAdminUsers = (users.data ?? []).filter((item) => admin && item.role === 'admin');
  const accountsByHatchery = [...groupByHatchery(visibleUsers, (item) => item.site)];
  const confirmationDetails = confirmation && {
    title: confirmation.action === 'approve' ? 'Approve account request?' : confirmation.action === 'reject' ? 'Reject account request?' : 'Remove account?',
    message: confirmation.action === 'approve'
      ? `Approve ${confirmation.name} as ${confirmation.role}?`
      : confirmation.action === 'reject'
        ? `Are you sure you want to reject "${confirmation.name}"?`
        : `Are you sure you want to remove "${confirmation.name}"?`,
    buttonLabel: confirmation.action === 'approve' ? 'Approve request' : confirmation.action === 'reject' ? 'Reject request' : 'Remove account',
  };
  const confirmationBusy = review.isPending || remove.isPending;
  return <Page maxWidth={680}>
    <Title detail={admin ? 'Manage team accounts and review requests.' : 'Review accounts for your hatchery.'}>Users & roles</Title>
    {!admin && DATA_MODE === 'api' && profile.isLoading ? <StateMessage message="Loading hatchery assignment..." loading /> :
      !admin && DATA_MODE === 'api' && profile.isError ? <Card><StateMessage message={`Could not load hatchery: ${profile.error.message}`} /><Button label="Retry" secondary onPress={() => void profile.refetch()} /></Card> :
      !admin && DATA_MODE === 'api' && !profile.data?.site?.trim() ? <StateMessage message="No hatchery is assigned to your account. Contact an administrator." /> : <>
      {admin && <Card title="Pending requests" action={pending.data && <Text style={styles.pendingCount}>{pending.data.length} pending</Text>}>
        <Text style={styles.intro}>Review new account requests and assign a role.</Text>
        {DATA_MODE === 'mock' ? <StateMessage message="Account review is unavailable in demo mode." /> : pending.isLoading ? <StateMessage message="Loading requests..." loading /> :
          pending.isError ? <><StateMessage message={`Could not load requests: ${pending.error.message}`} /><Button label="Retry requests" secondary onPress={() => void pending.refetch()} /></> :
          !pending.data?.length ? <StateMessage message="No account requests are awaiting review." /> :
          [...groupByHatchery(pending.data, (item) => item.site)].map(([site, accounts]) => <View key={site} style={styles.group}>
            <Text style={styles.site}>{site}</Text>
            {accounts.map((account) => <View key={account.id} style={styles.account}>
              <View style={styles.requestHeader}><Text style={styles.name}>{account.firstName} {account.lastName}</Text><Text style={styles.pendingBadge}>Status: Pending</Text></View>
              <Text style={styles.detail}>{account.email}</Text>
              <Text style={styles.detail}>Phone: {value(account.phone)}</Text>
              <Text style={styles.detail}>Requested role: {account.requestedRole ? account.requestedRole[0].toUpperCase() + account.requestedRole.slice(1) : 'Not specified'}</Text>
              <Text style={styles.label}>Review Role</Text>
              <View accessibilityRole="radiogroup" style={styles.roleChoices}>
                {(['operator', 'manager', 'admin'] as const).map((role) => {
                  const selected = (selectedRoles[account.id] ?? account.requestedRole) === role;
                  return <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setSelectedRoles((current) => ({ ...current, [account.id]: role }))} style={[styles.roleOption, selected && styles.roleSelected]}><Text style={[styles.roleText, selected && styles.roleTextSelected]}>{role[0].toUpperCase() + role.slice(1)}</Text></Pressable>;
                })}
              </View>
              <Text style={styles.label}>Action</Text>
              <View style={styles.requestActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Approve ${account.firstName} ${account.lastName}`} disabled={review.isPending || !(selectedRoles[account.id] ?? account.requestedRole)} onPress={() => {
                  const role = selectedRoles[account.id] ?? account.requestedRole;
                  if (role) setConfirmation({ action: 'approve', id: account.id, name: `${account.firstName} ${account.lastName}`, role });
                }} style={[styles.requestActionButton, styles.approveAction]}><Check size={19} color={colors.normal} /></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Reject ${account.firstName} ${account.lastName}`} disabled={review.isPending} onPress={() => setConfirmation({ action: 'reject', id: account.id, name: `${account.firstName} ${account.lastName}` })} style={[styles.requestActionButton, styles.rejectAction]}><X size={19} color={colors.critical} /></Pressable>
              </View>
            </View>)}
          </View>)}
        {review.isError && <StateMessage message={`Could not review request: ${review.error.message}`} />}
      </Card>}
      {admin && <Card title="Admin accounts">
        <Text style={styles.intro}>Administrator accounts with system-wide access.</Text>
        {users.isLoading ? <StateMessage message="Loading accounts..." loading /> : users.isError ? <StateMessage message={`Could not load accounts: ${users.error.message}`} /> :
          !visibleAdminUsers.length ? <StateMessage message="No administrator accounts are registered." /> :
          visibleAdminUsers.map((account) => <View key={account.id} style={styles.account}>
            <View style={styles.accountHeading}><Text style={styles.name}>{account.name || account.email}</Text><View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{account.role}</Text></View></View>
            <Text style={styles.detail}>{account.email}</Text>
            <Text style={styles.detail}>ID: {value(account.employeeId)}</Text>
            <Text style={styles.detail}>Phone number: {value(account.phone)}</Text>
          </View>)}
      </Card>}
      <Card title="Team accounts">
        <Text style={styles.intro}>View team accounts grouped by hatchery.</Text>
        {users.isLoading ? <StateMessage message="Loading accounts..." loading /> : users.isError ? <><StateMessage message={`Could not load accounts: ${users.error.message}`} /><Button label="Retry accounts" secondary onPress={() => void users.refetch()} /></> :
          !visibleUsers.length ? <StateMessage message="No team users are registered." /> :
          accountsByHatchery.map(([site, accounts]) => <View key={site} style={styles.group}>
            <View style={styles.siteHeader}><Text style={styles.site}>{site}</Text><Text style={styles.accountCount}>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</Text></View>
            {accounts.map((account) => <View key={account.id} style={styles.account}>
              <View style={styles.accountHeading}><Text style={styles.name}>{account.name || account.email}</Text><View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{account.role}</Text></View></View>
              <Text style={styles.detail}>{account.email}</Text>
              <Text style={styles.detail}>Phone: {value(account.phone)}</Text>
              <Text style={styles.detail}>Employee ID: {value(account.employeeId)}</Text>
              {account.lastActive && <Text style={styles.detail}>Last active: {formatManilaDateTime(account.lastActive)} PHT</Text>}
              {admin && account.role !== 'admin' && DATA_MODE === 'api' && <Pressable accessibilityRole="button" disabled={remove.isPending} onPress={() => setConfirmation({ action: 'remove', id: account.id, name: account.name || account.email })} style={styles.removeButton}><Text style={styles.removeButtonText}>Remove account</Text></Pressable>}
            </View>)}
          </View>)}
        {remove.isError && <StateMessage message={`Could not remove account: ${remove.error.message}`} />}
      </Card>
    </>}
    <GlassDialog visible={Boolean(confirmation)} onDismiss={() => { if (!confirmationBusy) setConfirmation(null); }}>
      <Dialog.Title style={{ marginTop: 24 }}>{confirmationDetails?.title}</Dialog.Title>
      <Dialog.Content><Text style={{ color: colors.ink, fontSize: 15, lineHeight: 22 }}>{confirmationDetails?.message}</Text></Dialog.Content>
      <Dialog.Actions style={{ justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Pressable accessibilityRole="button" disabled={confirmationBusy} onPress={() => setConfirmation(null)} style={styles.confirmationButton}><Text style={styles.confirmationCancelText}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={confirmationBusy} onPress={confirmUserAction} style={[styles.confirmationButton, confirmation?.action === 'approve' ? styles.confirmationApprove : styles.confirmationDanger]}>
          <Text style={styles.confirmationActionText}>{confirmationDetails?.buttonLabel}</Text>
        </Pressable>
      </Dialog.Actions>
    </GlassDialog>
  </Page>;
}

type UserConfirmation =
  | { action: 'approve'; id: string; name: string; role: Role }
  | { action: 'reject' | 'remove'; id: string; name: string };

const createManagementStyles = (colors: Palette) => StyleSheet.create({
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  group: { gap: 10, marginTop: 4 },
  site: { color: colors.teal, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  siteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  accountCount: { color: colors.normal, fontSize: 12, fontWeight: '700' },
  account: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 8, backgroundColor: 'transparent' },
  requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  pendingBadge: { color: colors.critical, fontSize: 12, fontWeight: '700' },
  pendingCount: { color: colors.critical, fontSize: 12, fontWeight: '700' },
  requestActions: { flexDirection: 'row', gap: 10 },
  requestActionButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: uiScale.radius.pill },
  approveAction: { borderColor: colors.normal, backgroundColor: `${colors.normal}12` },
  rejectAction: { borderColor: colors.critical, backgroundColor: `${colors.critical}12` },
  removeButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.critical, backgroundColor: 'transparent' },
  removeButtonText: { color: colors.critical, fontWeight: '700' },
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
  confirmationButton: { minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: uiScale.radius.pill },
  confirmationCancelText: { color: colors.ink, fontWeight: '700' },
  confirmationApprove: { backgroundColor: colors.normal },
  confirmationDanger: { backgroundColor: colors.critical },
  confirmationActionText: { color: '#fff', fontWeight: '700' },
});

export function AuditLogsScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const allowed = canAccess(user?.role ?? null, 'admin');
  const logs = useQuery({ queryKey: ['audit-logs', user?.id], queryFn: () => api.listAuditLogs(), enabled: allowed });
  if (!allowed) return <Page><StateMessage message="You do not have access to audit logs." /></Page>;
  return <Page maxWidth={680}><Title detail="Review admin actions and operational events.">Audit & system logs</Title><Card>
    {logs.isLoading ? <StateMessage message="Loading audit events..." loading /> : logs.isError ? <><StateMessage message={`Could not load audit events: ${logs.error.message}`} /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></> :
      !logs.data?.length ? <StateMessage message="No audit or system logs are available." /> : logs.data.map((log) => <View key={log.id} style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{log.action} · {log.user}</Text><Text style={{ color: colors.muted }}>{formatManilaDateTime(log.timestamp)} PHT · {log.detail}</Text></View>)}
  </Card></Page>;
}
