import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { Activity, AlertTriangle, ArrowLeft, Bell, ClipboardList, Database, FileText, LayoutDashboard, LogOut, MessageCircle, UserRound, Users, Wifi, WifiOff, X } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu } from 'react-native-paper';
import { formatMeasuredParameterLabel } from '@hydrosense/shared';
import { isBottomBarRoute } from '../navigation';
import type { MainTabParamList } from '../navigation';
import { canAccess } from '../access';
import { api, listPendingAccounts, liveClient } from '../services/client';
import { getConnectionLabel } from '../services/connectionStatus';
import { useSession, useTankSelection } from '../state';
import { Brand } from './ui';
import { HatcheryPicker } from './HatcheryPicker';
import { uiScale, useTheme } from '../theme';
import type { Palette } from '../theme';
import type { ThemeMode } from '../themePreference';

type Panel = 'navigation' | 'account' | 'notifications' | null;
type Destination = { name: keyof MainTabParamList; label: string; icon: typeof Activity; group: 'Monitor' | 'Records' | 'Manage' };
const headerHorizontalPadding = 16;
const headerTopPadding = 8;
const headerBottomPadding = 10;
const headerButtonSize = 48;
const headerButtonGap = 10;
const sidebarTones: Record<ThemeMode, Pick<Palette, 'surface' | 'border' | 'teal' | 'selected'>> = {
  light: { surface: '#d9e4f6', border: '#9ab4d9', teal: '#31548c', selected: '#c4d6ef' },
  dark: { surface: '#132440', border: '#6b9dff', teal: '#a6c4ff', selected: '#263d60' },
};

export function HeaderToolbar({ navigation, route }: BottomTabHeaderProps) {
  const { colors, mode, reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const { user, signOut } = useSession();
  const sidebarColors = { ...colors, ...sidebarTones[mode] };
  const sidebarStyles = createStyles(sidebarColors);
  const menuColors = sidebarColors;
  const menuStyles = sidebarStyles;
  const { tankId, isLoading: tanksLoading, error: tanksError, refetch: refetchTanks } = useTankSelection();
  const [headerLayout, setHeaderLayout] = useState({ height: headerTopPadding + headerButtonSize + headerBottomPadding + 1, rowY: headerTopPadding, rowHeight: headerButtonSize });
  const [panel, setPanel] = useState<Panel>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [connection, setConnection] = useState(liveClient?.getConnectionState() ?? 'disconnected');
  const alerts = useQuery({ queryKey: ['alerts', 'all'], queryFn: () => api.listAlerts(), enabled: Boolean(user), refetchInterval: 5000 });
  const pending = useQuery({ queryKey: ['pending-accounts', user?.id], queryFn: listPendingAccounts, enabled: user?.role === 'admin', refetchInterval: 5000 });
  const latestReading = useQuery({ queryKey: ['latest-reading', tankId], queryFn: () => api.getLatestReading(tankId), enabled: Boolean(user && tankId) });
  const [, updateClock] = useState(0);
  const openAlertItems = alerts.data?.filter((item) => item.status === 'open') ?? [];
  const openAlerts = alerts.data ? openAlertItems.length : undefined;
  const alertCount = openAlerts === undefined ? undefined : openAlerts + (pending.data?.length ?? 0);

  useEffect(() => NetInfo.addEventListener((state) => setOnline(state.isConnected)), []);
  useEffect(() => liveClient?.subscribeConnection(setConnection), []);
  useEffect(() => { setPanel(null); }, [route.key]);
  useEffect(() => {
    const timer = setInterval(() => updateClock((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const destinations: Destination[] = [
    { name: 'Home', label: 'Live monitor', icon: LayoutDashboard, group: 'Monitor' },
    { name: 'Status', label: 'System health', icon: Wifi, group: 'Monitor' },
    { name: 'Trends', label: 'Trends', icon: Activity, group: 'Monitor' },
    { name: 'Alerts', label: 'Alerts center', icon: AlertTriangle, group: 'Monitor' },
    ...(canAccess(user?.role ?? null, 'history') ? [{ name: 'History', label: 'Historical logs', icon: Database, group: 'Records' } satisfies Destination] : []),
    { name: 'Activity', label: 'Activity logs', icon: ClipboardList, group: 'Records' },
    { name: 'Reports', label: 'Reports', icon: FileText, group: 'Records' },
    ...(canAccess(user?.role ?? null, 'validation') ? [{ name: 'Review', label: 'Validation', icon: ClipboardList, group: 'Records' } satisfies Destination] : []),
    ...(canAccess(user?.role ?? null, 'users') ? [{ name: 'Users', label: 'Users & roles', icon: Users, group: 'Manage' } satisfies Destination] : []),
    ...(canAccess(user?.role ?? null, 'admin') ? [{ name: 'AuditLogs', label: 'Audit & system logs', icon: ClipboardList, group: 'Manage' } satisfies Destination] : []),
    { name: 'Chat', label: 'Chat', icon: MessageCircle, group: 'Manage' },
    { name: 'Profile', label: 'My profile', icon: UserRound, group: 'Manage' },
  ];
  const connectionLabel = getConnectionLabel(online, connection, latestReading.data?.timestamp, Date.now());
  const connectionColor = connectionLabel === 'Live' ? colors.normal : colors.critical;
  const horizontalPadding = width < 380 ? 12 : headerHorizontalPadding;
  const buttonGap = width < 380 ? 4 : headerButtonGap;
  const menuWidth = Math.max(0, width - insets.left - insets.right - 2 * horizontalPadding);
  const notificationMenuWidth = Math.min(340, Math.max(0, menuWidth - headerButtonSize - buttonGap));
  const accountMenuWidth = Math.min(340, menuWidth);
  const menuOffset = Math.max(0, headerLayout.height - headerLayout.rowY - (headerLayout.rowHeight + headerButtonSize) / 2);
  const menuMaxHeight = Math.max(0, height - insets.top - insets.bottom - (Platform.OS === 'android' ? insets.top : 0) - headerLayout.height - 32);
  function goTo(name: keyof MainTabParamList) {
    setPanel(null);
    navigation.navigate(name);
  }

  async function handleSignOut() {
    setPanel(null);
    try {
      await signOut();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Some local data could not be cleared.';
      console.error('Sign-out cleanup issue:', failure);
      Alert.alert('Sign-out cleanup issue', message);
    }
  }

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
    <View onLayout={(event) => { const { height } = event.nativeEvent.layout; setHeaderLayout((current) => ({ ...current, height })); }} style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
      <View onLayout={(event) => { const { y, height } = event.nativeEvent.layout; setHeaderLayout((current) => ({ ...current, rowY: y, rowHeight: height })); }} style={[styles.brandRow, { gap: buttonGap }]}>
        {!isBottomBarRoute(route.name) && <Pressable accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => navigation.navigate('More')} style={styles.iconButton}><ArrowLeft size={20} color={colors.ink} /></Pressable>}
        <View style={styles.brandSlot}><Brand compact showCaption={width >= 420} onLogoPress={() => setPanel('navigation')} logoExpanded={panel === 'navigation'} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open chat" accessibilityState={{ selected: route.name === 'Chat' }} onPress={() => goTo('Chat')} style={[styles.iconButton, route.name === 'Chat' && styles.activeIconButton]}>
          <MessageCircle size={20} color={route.name === 'Chat' ? colors.teal : colors.ink} />
        </Pressable>
        <Menu visible={panel === 'notifications'} onDismiss={() => setPanel(null)} anchorPosition="bottom" style={{ marginTop: menuOffset }} contentStyle={[menuStyles.popover, { width: notificationMenuWidth, backgroundColor: menuColors.surface }]} anchor={<Pressable accessibilityRole="button" accessibilityLabel={alerts.isError ? 'Alerts unavailable; open alerts' : alertCount === undefined ? 'Loading alerts; open alerts' : `${alertCount} open alerts and pending requests${pending.isError ? ', account requests unavailable' : ''}`} accessibilityState={{ expanded: panel === 'notifications' }} onPress={() => setPanel(panel === 'notifications' ? null : 'notifications')} style={styles.iconButton}>
          <Bell size={20} color={menuColors.teal} />
          {alertCount !== undefined && alertCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{alertCount > 99 ? '99+' : alertCount}</Text></View>}
        </Pressable>}>
          {panel === 'notifications' && <ScrollView style={{ maxHeight: menuMaxHeight }} contentContainerStyle={menuStyles.popoverContent}>
            <Text style={menuStyles.panelTitle}>Notifications</Text>
            {pending.data && pending.data.length > 0 && <Pressable accessibilityRole="button" onPress={() => goTo('Users')} style={menuStyles.notification}><View style={[menuStyles.dot, { backgroundColor: menuColors.teal }]} /><View style={{ flex: 1 }}><Text style={menuStyles.itemText}>{pending.data.length} pending account {pending.data.length === 1 ? 'request' : 'requests'}</Text><Text style={menuStyles.description}>Review in Users & roles</Text></View></Pressable>}
            {openAlertItems.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => goTo('Alerts')} style={menuStyles.notification}><View style={[menuStyles.dot, { backgroundColor: item.severity === 'critical' ? colors.critical : colors.warning }]} /><View style={{ flex: 1 }}><Text style={menuStyles.itemText}>{formatMeasuredParameterLabel(item.parameter)} {item.severity}</Text><Text style={menuStyles.description}>{item.value} · {item.threshold}</Text></View></Pressable>)}
            {!alertCount && <Text style={menuStyles.description}>No current notifications.</Text>}
            <Pressable accessibilityRole="button" onPress={() => goTo('Alerts')} style={menuStyles.viewAll}><Text style={menuStyles.viewAllText}>View all</Text></Pressable>
          </ScrollView>}
        </Menu>
        <Menu visible={panel === 'account'} onDismiss={() => setPanel(null)} anchorPosition="bottom" style={{ marginTop: menuOffset }} contentStyle={[menuStyles.popover, { width: accountMenuWidth, backgroundColor: menuColors.surface }]} anchor={<Pressable accessibilityRole="button" accessibilityLabel={`Account menu for ${user?.name ?? 'user'}`} accessibilityState={{ expanded: panel === 'account' }} onPress={() => setPanel(panel === 'account' ? null : 'account')} style={styles.avatar}><UserRound size={21} color={menuColors.teal} /></Pressable>}>
          {panel === 'account' && <ScrollView style={{ maxHeight: menuMaxHeight }} contentContainerStyle={menuStyles.popoverContent}>
            <View style={menuStyles.accountIdentity}><Text style={menuStyles.panelTitle}>{user?.name}</Text><Text style={menuStyles.description}>{user?.role}</Text></View>
            <View accessibilityLabel={`Connection ${connectionLabel}`} style={menuStyles.connection}>
              {connectionLabel === 'Live' ? <Wifi size={19} color={connectionColor} /> : <WifiOff size={19} color={connectionColor} />}
              <Text style={menuStyles.description}>Connection</Text><Text style={[menuStyles.connectionText, { color: connectionColor }]}>{connectionLabel}</Text>
            </View>
            {user?.role === 'admin' && (tanksLoading ? <Text style={menuStyles.description}>Loading hatcheries...</Text> : tanksError ? <View>
              <Text accessibilityRole="alert" style={menuStyles.error}>Could not load hatcheries: {tanksError.message}</Text>
              <Pressable accessibilityRole="button" onPress={refetchTanks} style={menuStyles.menuItem}><Text style={menuStyles.itemText}>Retry</Text></Pressable>
            </View> : <HatcheryPicker colors={menuColors} />)}
            <View>
              <Pressable accessibilityRole="button" onPress={() => goTo('Profile')} style={menuStyles.menuItem}><UserRound size={19} color={menuColors.teal} /><Text style={menuStyles.itemText}>My profile</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void handleSignOut()} style={menuStyles.menuItem}><LogOut size={19} color={colors.critical} /><Text style={[menuStyles.itemText, { color: colors.critical }]}>Sign out</Text></Pressable>
            </View>
          </ScrollView>}
        </Menu>
      </View>
      {alerts.isError && <Text style={styles.error}>Could not load alert count. Open alerts to retry.</Text>}
      {pending.isError && <Text style={styles.error}>Could not load account requests. Open alerts to retry.</Text>}
    </View>
    <Modal visible={panel === 'navigation'} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setPanel(null)}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setPanel(null)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['top', 'bottom']} style={[sidebarStyles.panel, { backgroundColor: sidebarColors.surface }]}>
          <View style={[sidebarStyles.panelHeader, { borderBottomColor: sidebarColors.border }]}><View style={sidebarStyles.panelBrand}><Brand compact showCaption /></View><Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setPanel(null)} style={sidebarStyles.close}><X size={20} color={sidebarColors.ink} /></Pressable></View>
          <ScrollView contentContainerStyle={sidebarStyles.panelContent} indicatorStyle={mode === 'dark' ? 'white' : 'black'}>
            {panel === 'navigation' && <>
              {(['Monitor', 'Records', 'Manage'] as const).map((group) => {
                const items = destinations.filter((item) => item.group === group);
                return items.length ? <View key={group} style={sidebarStyles.group}>
                  <Text style={sidebarStyles.groupLabel}>{group.toUpperCase()}</Text>
                  {items.map((item) => <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ selected: route.name === item.name }} onPress={() => goTo(item.name)} style={[sidebarStyles.menuItem, route.name === item.name && sidebarStyles.selected]}>
                    <item.icon size={19} color={route.name === item.name ? sidebarColors.teal : sidebarColors.muted} /><Text style={[sidebarStyles.itemText, route.name === item.name && sidebarStyles.selectedText]}>{item.label}</Text>
                  </Pressable>)}
                </View> : null;
              })}
              <View style={sidebarStyles.navigationFooter}>
                {user?.role && <Text style={sidebarStyles.copyright}>{user.role.toUpperCase()} Workspace</Text>}
                <Text style={sidebarStyles.copyright}>© 2026 HydroSense</Text>
              </View>
            </>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}

const createStyles = (colors: Palette) => StyleSheet.create({
  safe: { backgroundColor: 'transparent' },
  header: { paddingHorizontal: headerHorizontalPadding, paddingTop: headerTopPadding, paddingBottom: headerBottomPadding, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: headerButtonGap },
  brandSlot: { flex: 1, minWidth: 0, overflow: 'hidden' },
  iconButton: { width: headerButtonSize, height: headerButtonSize, flexShrink: 0, borderRadius: uiScale.radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  activeIconButton: { backgroundColor: colors.selected, borderColor: colors.teal },
  avatar: { width: headerButtonSize, height: headerButtonSize, flexShrink: 0, borderRadius: uiScale.radius.pill, backgroundColor: colors.selected, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 3, borderRadius: 10, backgroundColor: '#b51c1c', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: 'white', fontWeight: '700', fontSize: uiScale.type.caption },
  connection: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  connectionText: { color: colors.ink, fontWeight: '700', fontSize: 14, marginLeft: 'auto' },
  error: { color: colors.critical, fontSize: 14, lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: colors.overlay, flexDirection: 'row' },
  panel: { backgroundColor: colors.surface, width: '85%', maxWidth: 340 },
  popover: { borderRadius: 16, overflow: 'hidden', paddingVertical: 0, borderWidth: 1, borderColor: colors.border },
  panelHeader: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  panelBrand: { flex: 1, minWidth: 0 },
  panelTitle: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  panelContent: { padding: 20, gap: 12 },
  popoverContent: { padding: 16, gap: 8 },
  accountIdentity: { gap: 2 },
  group: { gap: 4, marginTop: 8 },
  groupLabel: { color: colors.muted, fontSize: uiScale.type.caption, letterSpacing: 1, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 8 },
  menuItem: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14 },
  selected: { backgroundColor: colors.selected },
  itemText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  selectedText: { color: colors.teal, fontWeight: '700', fontSize: 14 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  navigationFooter: { marginTop: 24, gap: 4 },
  copyright: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  notification: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  viewAll: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.teal },
  viewAllText: { color: colors.teal, fontWeight: '700', fontSize: 14 },
});
