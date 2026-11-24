import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Dialog } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { fromByteArray } from 'base64-js';
import { formatManilaDateTime, getManilaDateString, hatcheryId, tankInHatchery, toCsv, validatePasswordChange } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';
import { Camera, Check, ClipboardList, Droplets, Eye, EyeOff, FileDown, ListFilter, MapPin, Search, Trash2, UserRound, Users, X } from 'lucide-react-native';
import { canAccess } from './access';
import { Button, CalendarFilterField, Card, Chip, GlassDialog, Page, RecordRow, StateMessage, Title } from './components/ui';
import { FilterDropdown } from './components/FilterDropdown';
import { AlertPreferenceControls, DeviceMaintenanceControls } from './components/ProfileControls';
import { AppearanceOptions } from './components/AppearanceOptions';
import { groupByHatchery, hatcheryLabel } from './management';
import { api, changePassword, getAccountProfile, getProfileAvatarUrl, listPendingAccounts, removeAccount, reviewPendingAccount, saveProfileAvatar } from './services/client';
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
    enabled: Boolean(user),
  });
}

function value(text?: string | null) {
  return text?.trim() || 'N/A';
}
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ChangePasswordRow({ userId, email }: { userId: string; email: string }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const mutation = useMutation({
    mutationFn: () => changePassword(userId, email, current, next, confirmation),
    onSuccess: () => { setOpen(false); setCurrent(''); setNext(''); setConfirmation(''); setShowCurrent(false); setShowNext(false); setShowConfirmation(false); setError(''); setSuccess(true); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not change your password. Please try again.'),
  });
  const close = () => {
    if (mutation.isPending) return;
    setOpen(false); setCurrent(''); setNext(''); setConfirmation(''); setShowCurrent(false); setShowNext(false); setShowConfirmation(false); setError('');
  };
  const submit = () => {
    const issue = validatePasswordChange(current, next, confirmation);
    if (issue) { setError(issue); return; }
    setError('');
    mutation.mutate();
  };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 44, color: colors.ink, backgroundColor: colors.surface };
  return <View style={{ paddingVertical: 6, gap: 3 }}>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>Change Password</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Change password" onPress={() => { setShowCurrent(false); setShowNext(false); setShowConfirmation(false); setSuccess(false); setOpen(true); }} style={{ minHeight: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#c84d55', backgroundColor: 'rgba(200, 77, 85, 0.12)' }}>
      <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>Change password</Text>
    </Pressable>
    {success && <Text accessibilityLiveRegion="polite" style={{ color: colors.ink }}>Password changed successfully.</Text>}
    <GlassDialog solid visible={open} onDismiss={close}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Dialog.Title style={{ color: colors.ink, flex: 1 }}>Change Password</Dialog.Title>
        <Pressable accessibilityRole="button" accessibilityLabel="Close change password dialog" accessibilityState={{ disabled: mutation.isPending }} onPress={close} disabled={mutation.isPending} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <X size={20} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: height * 0.8 }} contentContainerStyle={{ paddingBottom: 16 }}>
        <Dialog.Content>
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.ink }}>Current password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }}>
              <TextInput accessibilityLabel="Current password" value={current} onChangeText={(text) => { setCurrent(text); setError(''); }} secureTextEntry={!showCurrent} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!mutation.isPending} style={[inputStyle, { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' }]} />
              <Pressable accessibilityRole="button" accessibilityLabel={`${showCurrent ? 'Hide' : 'Show'} current password`} accessibilityState={{ disabled: mutation.isPending, selected: showCurrent }} onPress={() => setShowCurrent((visible) => !visible)} disabled={mutation.isPending} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                {showCurrent ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
              </Pressable>
            </View>
            <Text style={{ color: colors.ink }}>New password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }}>
              <TextInput accessibilityLabel="New password" value={next} onChangeText={(text) => { setNext(text); setError(''); }} secureTextEntry={!showNext} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!mutation.isPending} style={[inputStyle, { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' }]} />
              <Pressable accessibilityRole="button" accessibilityLabel={`${showNext ? 'Hide' : 'Show'} new password`} accessibilityState={{ disabled: mutation.isPending, selected: showNext }} onPress={() => setShowNext((visible) => !visible)} disabled={mutation.isPending} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                {showNext ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
              </Pressable>
            </View>
            <Text style={{ color: colors.ink }}>Confirm new password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }}>
              <TextInput accessibilityLabel="Confirm new password" value={confirmation} onChangeText={(text) => { setConfirmation(text); setError(''); }} secureTextEntry={!showConfirmation} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!mutation.isPending} style={[inputStyle, { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' }]} />
              <Pressable accessibilityRole="button" accessibilityLabel={`${showConfirmation ? 'Hide' : 'Show'} confirm new password`} accessibilityState={{ disabled: mutation.isPending, selected: showConfirmation }} onPress={() => setShowConfirmation((visible) => !visible)} disabled={mutation.isPending} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                {showConfirmation ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
              </Pressable>
            </View>
            <Text style={{ color: colors.muted }}>Use at least 8 characters.</Text>
            {error ? <Text accessibilityRole="alert" style={{ color: colors.critical }}>{error}</Text> : null}
          </View>
        </Dialog.Content>
        <Dialog.Actions style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingHorizontal: 24 }}>
          <Button label={mutation.isPending ? 'Changing...' : 'Confirm change'} disabled={mutation.isPending} onPress={submit} />
        </Dialog.Actions>
      </ScrollView>
    </GlassDialog>
  </View>;
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
  const queryClient = useQueryClient();
  const { allTanks, tankId, isLoading, error, refetch } = useTankSelection();
  const profile = useProfile();
  const [maintenanceHatchery, setMaintenanceHatchery] = useState('');
  const [maintenanceTankId, setMaintenanceTankId] = useState('');
  const [expandedMaintenanceFilter, setExpandedMaintenanceFilter] = useState<'hatchery' | 'tank' | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [avatarPickerError, setAvatarPickerError] = useState('');
  const avatar = useQuery({
    queryKey: ['profile-avatar', user?.id],
    queryFn: async () => (await getProfileAvatarUrl()) ?? null,
    enabled: Boolean(user),
  });
  const saveAvatar = useMutation({
    mutationFn: ({ uri, mimeType }: { uri: string; mimeType: string }) => saveProfileAvatar(uri, mimeType),
    onSuccess: (url) => {
      setAvatarUrl(url);
      queryClient.setQueryData(['profile-avatar', user?.id], url);
      setAvatarPickerError('');
    },
  });
  const hatcheries = [...new Map(allTanks.filter((item) => item.site.trim()).map((item) => [hatcheryId(item.site), item.site])).values()];
  const assignedHatchery = profile.data?.site || allTanks.find((item) => item.id === tankId)?.site || '';
  const selectedHatchery = user?.role === 'admin' ? maintenanceHatchery : assignedHatchery;
  const maintenanceTanks = selectedHatchery
    ? allTanks.filter((item) => tankInHatchery(item, hatcheryId(selectedHatchery)))
    : [];
  const hatcheryOptions = hatcheries.map((site) => ({ value: site, label: hatcheryLabel(site) }));
  const tankOptions = maintenanceTanks.map((item) => ({ value: item.id, label: item.name }));
  const displayedAvatar = avatarUrl ?? avatar.data;
  const profileName = value(profile.data?.name ?? user?.name);
  const profileRole = value(profile.data?.role ?? user?.role);
  async function chooseAvatar() {
    setAvatarPickerError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAvatarPickerError('Allow photo library access to choose a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      const image = result.assets[0];
      if (!image) throw new Error('No profile picture was selected.');
      const mimeType = image.mimeType ?? ({
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      }[image.uri.split('.').pop()?.toLowerCase() ?? '']);
      if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        throw new Error('Choose a JPG, PNG, or WebP image.');
      }
      if (image.fileSize !== undefined && image.fileSize > 10 * 1024 * 1024) {
        throw new Error('Choose an image no larger than 10 MB.');
      }
      const resized = await ImageManipulator.ImageManipulator.manipulate(image.uri, { maxWidth: 512, maxHeight: 512 }).renderAsync();
      const optimized = await resized.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
      saveAvatar.mutate({ uri: optimized.uri, mimeType: 'image/jpeg' });
    } catch (failure) {
      setAvatarPickerError(failure instanceof Error ? failure.message : 'Could not open the photo library.');
    }
  }
  return <Page maxWidth={680}>
    <Title icon={<UserRound size={23} color={colors.teal} />} detail="View your account, role, hatchery, and alert preferences.">My Profile</Title>
    {profile.isLoading ? <Card><StateMessage message="Loading profile..." loading /></Card> :
      profile.isError ? <Card><StateMessage message={`Could not load profile: ${profile.error.message}`} /><Button label="Retry profile" secondary onPress={() => void profile.refetch()} /></Card> : <>
        <Card>
          <View style={styles.profileHero}>
            <View style={styles.profileAvatarWrap}>
              {displayedAvatar
                ? <Image accessibilityLabel={`${profileName} profile picture`} source={{ uri: displayedAvatar }} style={styles.profileAvatar} />
                : <View accessibilityLabel={`${profileName} profile picture`} style={[styles.profileAvatar, styles.profileAvatarFallback]}><Text style={styles.profileInitials}>{profileName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</Text></View>}
              <Pressable accessibilityRole="button" accessibilityLabel="Upload profile picture" accessibilityState={{ disabled: saveAvatar.isPending }} disabled={saveAvatar.isPending} onPress={() => void chooseAvatar()} style={styles.profileAvatarUpload}>
                {saveAvatar.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={17} color="#fff" />}
              </Pressable>
            </View>
            <View style={styles.profileIdentity}>
              <Text style={styles.profileName}>{profileName}</Text>
              <Text style={styles.profileRole}>{profileRole}</Text>
            </View>
            {avatarPickerError ? <Text accessibilityRole="alert" style={styles.profileAvatarError}>{avatarPickerError}</Text> : null}
            {avatar.isError ? <Text accessibilityRole="alert" style={styles.profileAvatarError}>Could not load profile picture: {avatar.error.message}</Text> : null}
            {saveAvatar.isError ? <Text accessibilityRole="alert" style={styles.profileAvatarError}>{saveAvatar.error.message}</Text> : null}
            {saveAvatar.isSuccess ? <Text accessibilityLiveRegion="polite" style={styles.profileAvatarSuccess}>Profile picture updated.</Text> : null}
          </View>
        </Card>
        <Card title="Contact Details & Assignment">
          <View style={styles.profilePair}>
            <View style={styles.profileColumn}><ProfileRow label="Employee ID" text={value(profile.data?.employeeId)} /></View>
            <View style={styles.profileColumn}><ProfileRow label="Position" text={value(profile.data?.position)} /></View>
          </View>
          {user?.role !== 'admin' && <ProfileRow label="Hatchery / site" text={profile.data?.site?.trim() ? hatcheryLabel(profile.data.site) : 'Not provided'} />}
          <View style={styles.profilePair}>
            <View style={[styles.profileColumn, styles.profileEmail]}><ProfileRow label="Email" text={value(profile.data?.email)} /></View>
            <View style={styles.profileColumn}><ProfileRow label="Phone" text={value(profile.data?.phone)} /></View>
          </View>
          <ProfileRow label="Address" text={value(profile.data?.address)} />
          {user && profile.data && <ChangePasswordRow userId={user.id} email={profile.data.email} />}
        </Card>
        <Card title="Emergency Contact">
          <ProfileRow label="Name" text={value(profile.data?.emergencyContactName)} />
          <ProfileRow label="Phone" text={value(profile.data?.emergencyContactPhone)} />
        </Card>
        <Card title="Account">
          <ProfileRow label="Account status" text={capitalize(value(profile.data?.status))} />
          <ProfileRow label="Account created" text={profile.data?.createdAt ? `${formatManilaDateTime(profile.data.createdAt)} PHT` : 'Not provided'} />
        </Card>
      </>}
    <Card title="Alert Notifications"><AlertPreferenceControls /></Card>
    <Card title="Appearance"><AppearanceOptions /></Card>
    <Card title="Device Maintenance">
      {isLoading ? <StateMessage message="Loading selected tank..." loading /> : error ? <><StateMessage message={`Could not load tank: ${error.message}`} /><Button label="Retry" secondary onPress={refetch} /></> : <>
        {user?.role === 'admin' && <View style={{ gap: 8 }}>
          <FilterDropdown label="Hatchery" summary={hatcheryOptions.find((option) => option.value === maintenanceHatchery)?.label ?? 'Select a hatchery'} icon={<MapPin size={14} color={colors.teal} />} options={hatcheryOptions} value={maintenanceHatchery} expanded={expandedMaintenanceFilter === 'hatchery'} onToggle={() => setExpandedMaintenanceFilter((current) => current === 'hatchery' ? null : 'hatchery')} onChange={(site) => {
            setMaintenanceHatchery(site);
            setMaintenanceTankId('');
            setExpandedMaintenanceFilter(null);
          }} />
        </View>}
        <View style={{ gap: 8 }}>
          {user?.role === 'admin' && !maintenanceHatchery
            ? <Text style={styles.detail}>Select a hatchery first.</Text>
            : maintenanceTanks.length
              ? <FilterDropdown label="Tank" summary={tankOptions.find((option) => option.value === maintenanceTankId)?.label ?? 'Select a tank'} icon={<Droplets size={14} color={colors.teal} />} options={tankOptions} value={maintenanceTankId} expanded={expandedMaintenanceFilter === 'tank'} onToggle={() => setExpandedMaintenanceFilter((current) => current === 'tank' ? null : 'tank')} onChange={(id) => {
                setMaintenanceTankId(id);
                setExpandedMaintenanceFilter(null);
              }} />
              : <Text style={styles.detail}>{selectedHatchery ? 'No tanks are available for this hatchery.' : 'Hatchery assignment is not available.'}</Text>}
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
  const [requestSearch, setRequestSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState<Record<string, string>>({});
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role | undefined>>({});
  const [confirmation, setConfirmation] = useState<UserConfirmation | null>(null);
  const users = useQuery({ queryKey: ['admin-users', user?.id], queryFn: () => api.listUsers(), enabled: allowed && (admin || Boolean(profile.data?.site?.trim())) });
  const pending = useQuery({ queryKey: ['pending-accounts', user?.id], queryFn: listPendingAccounts, enabled: admin, refetchInterval: 5000 });
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
      ? `Are you sure you want to approve ${confirmation.name} as ${confirmation.role}?`
      : confirmation.action === 'reject'
        ? `Are you sure you want to reject "${confirmation.name}"?`
        : `Are you sure you want to remove "${confirmation.name}"?`,
    buttonLabel: confirmation.action === 'approve' ? 'Approve request' : confirmation.action === 'reject' ? 'Reject request' : 'Remove account',
  };
  const confirmationBusy = review.isPending || remove.isPending;
  const matches = (query: string, fields: Array<string | null | undefined>) => {
    const needle = query.trim().toLowerCase();
    return !needle || fields.some((field) => field?.toLowerCase().includes(needle));
  };
  const filteredPending = (pending.data ?? []).filter((account) => matches(requestSearch, [account.firstName, account.lastName, ` ${account.lastName}`, account.email, account.phone, account.requestedRole, account.site, account.createdAt ? formatManilaDateTime(account.createdAt) : '']));
  return <Page maxWidth={680}>
    <Title icon={<Users size={23} color={colors.teal} />} detail={admin ? 'Manage team accounts and review requests.' : 'Review accounts for your hatchery.'}>Users & Roles</Title>
    {!admin && profile.isLoading ? <StateMessage message="Loading hatchery assignment..." loading /> :
      !admin && profile.isError ? <Card><StateMessage message={`Could not load hatchery: ${profile.error.message}`} /><Button label="Retry" secondary onPress={() => void profile.refetch()} /></Card> :
      !admin && !profile.data?.site?.trim() ? <StateMessage message="No hatchery is assigned to your account. Contact an administrator." /> : <>
      {admin && <Card title="Pending Requests" style={{ gap: uiScale.spacing[3] }}>
        <Text style={styles.intro}>Review new account requests and assign a role.</Text>
        {Boolean(pending.data?.length) && <SearchBox label="Search pending requests" value={requestSearch} onChange={setRequestSearch} colors={colors} />}
        {pending.data && <Text style={styles.pendingCount}>{filteredPending.length} pending</Text>}
        {pending.isLoading ? <StateMessage message="Loading requests..." loading /> :
          pending.isError ? <><StateMessage message={`Could not load requests: ${pending.error.message}`} /><Button label="Retry requests" secondary onPress={() => void pending.refetch()} /></> :
          !pending.data?.length ? <StateMessage message="No account requests are awaiting review." /> : [...groupByHatchery(pending.data, (item) => item.site)].map(([site, allRequests]) => { const accounts = allRequests.filter((account) => filteredPending.includes(account)); return <View key={site} style={styles.group}>
            <Text style={styles.site}>{site}</Text>
            {!accounts.length && <StateMessage message="No pending requests match your search." />}
            {accounts.map((account) => {
              const reviewRole = selectedRoles[account.id] ?? account.requestedRole;
              return <View key={account.id} style={styles.account}>
              <View style={styles.accountRow}>
                <View style={styles.accountAvatar}><UserRound size={20} color={colors.teal} /></View>
                <View style={styles.accountIdentity}><Text numberOfLines={1} style={styles.name}>{account.firstName} {account.lastName}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={styles.detail}>{account.email}</Text><Chip label={reviewRole ? capitalize(reviewRole) : 'Role not specified'} compact /></View>
                <View style={styles.requestActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Approve ${account.firstName} ${account.lastName}`} disabled={review.isPending || !reviewRole} onPress={() => {
                    if (reviewRole) setConfirmation({ action: 'approve', id: account.id, name: `${account.firstName} ${account.lastName}`, role: reviewRole });
                  }} style={[styles.requestActionButton, styles.approveAction]}><Check size={19} color={colors.normal} /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Reject ${account.firstName} ${account.lastName}`} disabled={review.isPending} onPress={() => setConfirmation({ action: 'reject', id: account.id, name: `${account.firstName} ${account.lastName}` })} style={[styles.requestActionButton, styles.rejectAction]}><X size={19} color={colors.critical} /></Pressable>
                </View>
              </View>
              <Text style={styles.label}>Review Role</Text>
              <View accessibilityRole="radiogroup" style={styles.roleChoices}>
                {(['operator', 'manager', 'admin'] as const).map((role) => {
                  const selected = reviewRole === role;
                  return <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setSelectedRoles((current) => ({ ...current, [account.id]: role }))} style={[styles.roleOption, selected && styles.roleSelected]}><Text style={[styles.roleText, selected && styles.roleTextSelected]}>{role[0].toUpperCase() + role.slice(1)}</Text></Pressable>;
                })}
              </View>
            </View>; })}
          </View>; })}
        {review.isError && <StateMessage message={`Could not review request: ${review.error.message}`} />}
      </Card>}
      {admin && <Card title="Admin Accounts" style={{ gap: uiScale.spacing[3] }}>
        <Text style={styles.intro}>Administrator accounts with system-wide access.</Text>
        {users.isLoading ? <StateMessage message="Loading accounts..." loading /> : users.isError ? <StateMessage message={`Could not load accounts: ${users.error.message}`} /> :
          !visibleAdminUsers.length ? <StateMessage message="No administrator accounts are registered." /> :
          visibleAdminUsers.map((account) => <View key={account.id} style={[styles.account, styles.accountRow]}>
            <View style={styles.accountAvatar}><UserRound size={20} color={colors.teal} /></View>
            <View style={styles.accountIdentity}><Text numberOfLines={1} style={styles.name}>{account.name || account.email}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={styles.detail}>{account.email}</Text></View>
            <Chip label={capitalize(account.role)} compact />
          </View>)}
      </Card>}
      <Card title="Team Accounts" style={{ gap: uiScale.spacing[3] }}>
        <Text style={styles.intro}>View team accounts grouped by hatchery.</Text>
        {users.isLoading ? <StateMessage message="Loading accounts..." loading /> : users.isError ? <><StateMessage message={`Could not load accounts: ${users.error.message}`} /><Button label="Retry accounts" secondary onPress={() => void users.refetch()} /></> :
          !visibleUsers.length ? <StateMessage message="No team users are registered." /> :
          accountsByHatchery.map(([site, allAccounts]) => { const query = teamSearch[site] ?? ''; const accounts = allAccounts.filter((account) => matches(query, [account.name, account.email, account.phone, account.employeeId, account.role, account.lastActive ? formatManilaDateTime(account.lastActive) : ''])); return <View key={site} style={styles.group}>
            <View style={styles.siteHeader}><Text style={styles.site}>{site}</Text>
              <View style={{ flexGrow: 1, minWidth: 180 }}><SearchBox label={`Search accounts in ${site}`} value={query} onChange={(next) => setTeamSearch((current) => ({ ...current, [site]: next }))} colors={colors} /></View>
              <Text style={styles.accountCount}>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</Text>
            </View>
            {!accounts.length && <StateMessage message="No accounts match your search." />}
            {accounts.map((account) => <View key={account.id} style={[styles.account, styles.accountRow]}>
              <View style={styles.accountAvatar}><UserRound size={20} color={colors.teal} /></View>
              <View style={styles.accountIdentity}><Text numberOfLines={1} style={styles.name}>{account.name || account.email}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={styles.detail}>{account.email}</Text></View>
              <Chip label={capitalize(account.role)} compact />
              {admin && account.role !== 'admin' && <Pressable accessibilityRole="button" accessibilityLabel={`Remove account ${account.name || account.email}`} disabled={remove.isPending} onPress={() => setConfirmation({ action: 'remove', id: account.id, name: account.name || account.email })} style={styles.removeButton}><Trash2 size={20} color={colors.critical} /></Pressable>}
            </View>)}
          </View>; })}
        {remove.isError && <StateMessage message={`Could not remove account: ${remove.error.message}`} />}
      </Card>
    </>}
    <GlassDialog solid visible={Boolean(confirmation)} onDismiss={() => { if (!confirmationBusy) setConfirmation(null); }}>
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

function SearchBox({ label, value, onChange, colors, placeholder = 'Search name, email, ID, role or date' }: { label: string; value: string; onChange: (text: string) => void; colors: Palette; placeholder?: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], height: 40, paddingHorizontal: uiScale.spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.glassControl }}>
    <Search size={17} color={colors.muted} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.muted} value={value} onChangeText={onChange} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: uiScale.type.caption, paddingVertical: uiScale.spacing[1] }} />
  </View>;
}

type UserConfirmation =
  | { action: 'approve'; id: string; name: string; role: Role }
  | { action: 'reject' | 'remove'; id: string; name: string };

const createManagementStyles = (colors: Palette) => StyleSheet.create({
  profileHero: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  profileAvatarWrap: { width: 112, height: 112, position: 'relative' },
  profileAvatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 2, borderColor: colors.border },
  profileAvatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  profileInitials: { color: colors.teal, fontSize: 30, fontWeight: '800' },
  profileAvatarUpload: { position: 'absolute', right: 0, bottom: 0, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.teal },
  profileIdentity: { alignItems: 'center', gap: 4 },
  profileName: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center' },
  profileRole: { color: colors.teal, fontSize: 13, lineHeight: 20, fontWeight: '700', textTransform: 'capitalize', textAlign: 'center' },
  profileAvatarError: { color: colors.critical, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  profileAvatarSuccess: { color: colors.normal, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  profilePair: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  profileColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  profileEmail: { flexBasis: 190 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  group: { gap: uiScale.spacing[3] },
  site: { color: colors.teal, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  siteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  accountCount: { color: colors.normal, fontSize: uiScale.type.caption, fontWeight: '700' },
  account: { borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, padding: uiScale.spacing[2], gap: uiScale.spacing[2], backgroundColor: colors.glassControl },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], minWidth: 0 },
  accountAvatar: { width: 36, height: 36, borderRadius: uiScale.radius.pill, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  accountIdentity: { flex: 1, minWidth: 0, gap: uiScale.spacing[1] },
  pendingCount: { color: colors.critical, fontSize: uiScale.type.caption, fontWeight: '700' },
  requestActions: { flexDirection: 'row', gap: uiScale.spacing[1] },
  requestActionButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: uiScale.radius.pill },
  approveAction: { borderColor: colors.normal, backgroundColor: `${colors.normal}12` },
  rejectAction: { borderColor: colors.critical, backgroundColor: `${colors.critical}12` },
  removeButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  name: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 },
  roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: uiScale.radius.pill, borderColor: colors.border },
  roleSelected: { borderColor: colors.teal, backgroundColor: colors.selected },
  roleText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  roleTextSelected: { color: colors.teal },
  confirmationButton: { minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: uiScale.radius.pill },
  confirmationCancelText: { color: colors.ink, fontWeight: '700' },
  confirmationApprove: { backgroundColor: colors.normal },
  confirmationDanger: { backgroundColor: colors.critical },
  confirmationActionText: { color: '#fff', fontWeight: '700' },
});

export function AuditLogsScreen() {
  const { user } = useSession();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<'user' | 'action' | null>(null);
  const [exporting, setExporting] = useState(false);
  const allowed = canAccess(user?.role ?? null, 'admin');
  const logs = useQuery({ queryKey: ['audit-logs', user?.id], queryFn: () => api.listAuditLogs(), enabled: allowed });
  const validDate = (date: string) => !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00+08:00`)) && getManilaDateString(new Date(`${date}T00:00:00+08:00`)) === date);
  const validRange = validDate(from) && validDate(to) && (!from || !to || from <= to);
  const allLogs = logs.data ?? [];
  const userOptions = [{ value: '', label: 'All users' }, ...Array.from(new Set(allLogs.map((log) => log.user))).sort().map((name) => ({ value: name, label: name }))];
  const actionOptions = [{ value: '', label: 'All actions' }, ...Array.from(new Set(allLogs.map((log) => log.action))).sort().map((name) => ({ value: name, label: name }))];
  const filtered = validRange ? allLogs.filter((log) => {
    const timestamp = Date.parse(log.timestamp);
    const date = Number.isFinite(timestamp) ? getManilaDateString(new Date(timestamp)) : null;
    return ((!from && !to) || (date !== null && (!from || date >= from) && (!to || date <= to))) &&
      (!selectedUser || log.user === selectedUser) && (!action || log.action === action) &&
      log.detail.toLowerCase().includes(search.trim().toLowerCase());
  }) : [];
  const hasFilters = Boolean(search || from || to || selectedUser || action);
  const exportDisabled = exporting || logs.isLoading || logs.isError || !validRange || !filtered.length;
  async function shareLogs() {
    setExporting(true);
    try {
      if (!user || !canAccess(user.role, 'canExport')) throw new Error('You do not have permission to export audit logs.');
      if (!FileSystem.documentDirectory || !(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      const csv = toCsv([['Time (PHT)', 'User', 'Action', 'Detail'], ...filtered.map((log) => [formatManilaDateTime(log.timestamp), log.user, log.action, log.detail])]);
      const encoded = encodeURIComponent(csv).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const uri = `${FileSystem.documentDirectory}hydrosense-audit-logs-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(uri, fromByteArray(Uint8Array.from(encoded, (character) => character.charCodeAt(0))), { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Share audit logs' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not share audit logs.');
    } finally {
      setExporting(false);
    }
  }
  const iconButton = { width: 40, height: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface };
  if (!allowed) return <Page><StateMessage message="You do not have access to audit logs." /></Page>;
  return <Page maxWidth={680}><Title icon={<ClipboardList size={23} color={colors.teal} />} detail="Review admin actions and operational events.">Audit & System Logs</Title><Card>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2] }}>
      <View style={{ flex: 1, minWidth: 0 }}><SearchBox label="Search detail" placeholder="Search detail" value={search} onChange={setSearch} colors={colors} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" accessibilityState={{ disabled: !hasFilters }} disabled={!hasFilters} onPress={() => { setSearch(''); setFrom(''); setTo(''); setSelectedUser(''); setAction(''); setOpen(null); }} style={[iconButton, { opacity: hasFilters ? 1 : 0.5 }]}><X size={18} color={colors.teal} /></Pressable>
      {user && canAccess(user.role, 'canExport') && <Pressable accessibilityRole="button" accessibilityLabel="Export CSV" accessibilityState={{ disabled: exportDisabled }} disabled={exportDisabled} onPress={() => void shareLogs()} style={[iconButton, { opacity: exportDisabled ? 0.5 : 1 }]}><FileDown size={18} color={colors.teal} /></Pressable>}
    </View>
    <View style={{ flexDirection: width < 360 ? 'column' : 'row', gap: uiScale.spacing[2] }}>
      <CalendarFilterField label="From date (PHT)" value={from} onChangeText={setFrom} max={to || undefined} />
      <CalendarFilterField label="To date (PHT)" value={to} onChangeText={setTo} min={from || undefined} />
    </View>
    <View style={{ flexDirection: width < 360 ? 'column' : 'row', gap: uiScale.spacing[2] }}>
      <FilterDropdown label="User" summary={selectedUser || 'All users'} icon={<UserRound size={14} color={colors.teal} />} options={userOptions} value={selectedUser} expanded={open === 'user'} onToggle={() => setOpen(open === 'user' ? null : 'user')} onChange={(value) => { setSelectedUser(value); setOpen(null); }} />
      <FilterDropdown label="Action" summary={action || 'All actions'} icon={<ListFilter size={14} color={colors.teal} />} options={actionOptions} value={action} expanded={open === 'action'} onToggle={() => setOpen(open === 'action' ? null : 'action')} onChange={(value) => { setAction(value); setOpen(null); }} />
    </View>
    {logs.isLoading ? <StateMessage message="Loading audit events..." loading /> : logs.isError ? <><StateMessage message={`Could not load audit events: ${logs.error.message}`} /><Button label="Retry" secondary onPress={() => void logs.refetch()} /></> :
      !validRange ? <StateMessage message="Enter valid dates in YYYY-MM-DD format, with From no later than To." /> : <>
        <Text style={{ color: colors.muted, fontSize: uiScale.type.caption }}>{filtered.length} events</Text>
        {filtered.length === 0 ? <StateMessage message="No audit events match the filters." /> : filtered.map((log) => <RecordRow key={log.id} icon={<ClipboardList size={20} color={colors.teal} />} title={log.action} caption={`${log.user} · ${log.detail}`} right={Number.isFinite(Date.parse(log.timestamp)) ? `${formatManilaDateTime(log.timestamp)} PHT` : 'Unavailable'} />)}
      </>}
  </Card></Page>;
}
