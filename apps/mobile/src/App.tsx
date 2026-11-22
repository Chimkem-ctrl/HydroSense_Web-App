import { useContext, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { BottomTabBarHeightCallbackContext, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { defaultShouldDehydrateMutation, defaultShouldDehydrateQuery, focusManager, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { BlurTargetView } from 'expo-blur';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { Activity, AlertTriangle, LayoutDashboard, MoreHorizontal, Waves } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { isBottomBarRoute } from './navigation';
import type { BottomBarRoute, MainTabParamList, RootStackParamList } from './navigation';
import {
  ActivityLogsScreen,
  AlertDetailScreen,
  AlertsScreen,
  ConnectionNotice,
  HistoryScreen,
  HomeScreen,
  TanksScreen,
  MoreScreen,
  ManagerReviewScreen,
  ReportsScreen,
  StatusScreen,
  TrendsScreen,
} from './screens';
import { LoginScreen, SignUpScreen, PendingApprovalScreen, ForgotPasswordScreen, VerifyEmailScreen } from './authScreens';
import { useSession } from './state';
import { ThemeProvider, uiScale, useTheme } from './theme';
import { HeaderToolbar } from './components/HeaderToolbar';
import { AppProviders } from './components/AppProviders';
import { AuditLogsScreen, ProfileScreen, UsersScreen } from './managementScreens';
import { CriticalAlertModal } from './components/CriticalAlertModal';
import { BlurTargetContext, TabBarVisibleContext } from './components/ui';
import { SplashGate } from './splashScreen';
import { ChatScreen } from './ChatScreen';
import { api, liveClient } from './services/client';
import { queryClient, queryPersister } from './services/queryClient';
import { canAccess } from './access';
import type { Role } from '@hydrosense/shared';
import type { ThemeMode } from './themePreference';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const roleBackgrounds: Record<Role, Record<ThemeMode, number>> = {
  admin: {
    light: require('../../web/public/assets/images/admin bg light app.png'),
    dark: require('../../web/public/assets/images/admin bg app (1).png'),
  },
  manager: {
    light: require('../../web/public/assets/images/manager bg light app (1).png'),
    dark: require('../../web/public/assets/images/manager bg app.png'),
  },
  operator: {
    light: require('../../web/public/assets/images/operator bg light app.png'),
    dark: require('../../web/public/assets/images/operator bg app.png'),
  },
};
// Web needs screen detachment to hide inactive transparent tabs.
if (Platform.OS === 'web') enableScreens(true);
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => {
  setOnline(Boolean(state.isConnected));
}));
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => subscription.remove();
  });
}

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['hydrosense://'],
  config: { screens: { AlertDetail: 'alerts/:alertId', Login: 'signin' } },
};

function MainTabs() {
  const { user } = useSession();
  return <TabBarVisibleContext.Provider value><Tabs.Navigator tabBar={(props) => <MobileTabBar {...props} />} screenOptions={{ sceneStyle: { backgroundColor: 'transparent' }, header: (props) => <HeaderToolbar {...props} /> }}>
    <Tabs.Screen name="Home" component={HomeScreen} />
    <Tabs.Screen name="Tanks" component={TanksScreen} />
    <Tabs.Screen name="Alerts" component={AlertsScreen} />
    <Tabs.Screen name="Trends" component={TrendsScreen} />
    <Tabs.Screen name="More" component={MoreScreen} />
    <Tabs.Screen name="Chat" component={ChatScreen} />
    <Tabs.Screen name="Activity" component={ActivityLogsScreen} />
    <Tabs.Screen name="Reports" component={ReportsScreen} />
    <Tabs.Screen name="Status" component={StatusScreen} />
    {canAccess(user?.role ?? null, 'history') && <Tabs.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />}
    {canAccess(user?.role ?? null, 'validation') && <Tabs.Screen name="Review" component={ManagerReviewScreen} options={{ title: 'Validation' }} />}
    <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'My profile' }} />
    {canAccess(user?.role ?? null, 'users') && <Tabs.Screen name="Users" component={UsersScreen} options={{ title: 'Users & roles' }} />}
    {canAccess(user?.role ?? null, 'admin') && <Tabs.Screen name="AuditLogs" component={AuditLogsScreen} options={{ title: 'Audit & system logs' }} />}
  </Tabs.Navigator></TabBarVisibleContext.Provider>;
}

const tabIcons = {
  Home: LayoutDashboard,
  Tanks: Waves,
  Alerts: AlertTriangle,
  Trends: Activity,
  More: MoreHorizontal,
} satisfies Record<BottomBarRoute, typeof Activity>;

function MobileTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  return <View onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)} style={{ backgroundColor: 'transparent', borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }}>
    <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingTop: 6, gap: 2 }}>
      {state.routes.map((route, index) => {
        if (!isBottomBarRoute(route.name)) return null;
        const selected = state.index === index || (route.name === 'More' && !isBottomBarRoute(state.routes[state.index].name));
        const options = descriptors[route.key].options;
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
        const Icon = tabIcons[route.name];
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: uiScale.radius.card, gap: 3, backgroundColor: selected ? colors.selected : 'transparent' }}>
          <Icon size={20} color={selected ? colors.teal : colors.muted} strokeWidth={2} />
          <Text style={{ fontSize: uiScale.type.caption, fontWeight: selected ? '700' : '500', color: selected ? colors.teal : colors.muted }}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

function LiveSync() {
  const { user } = useSession();
  useEffect(() => {
    const client = liveClient;
    if (!user || !client) return undefined;
    client.connect();
    let active = true;
    const subscriptions: Array<() => void> = [];
    api.listTanks().then((tanks) => {
      if (!active) return;
      tanks.forEach((tank) => {
        subscriptions.push(client.subscribe(tank.id, (event) => {
          if (event.type === 'reading') {
            queryClient.setQueryData(['latest-reading', tank.id], event.reading);
            void queryClient.invalidateQueries({ queryKey: ['mobile-trends', tank.id] });
            void queryClient.invalidateQueries({ queryKey: ['history', tank.id] });
            void queryClient.invalidateQueries({ queryKey: ['alerts'] });
          } else {
            void queryClient.invalidateQueries({ queryKey: ['device-statuses'] });
          }
        }));
      });
    }).catch((error: unknown) => console.error('Could not subscribe to live tank updates.', error));
    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      client.disconnect();
    };
  }, [user]);
  return null;
}

function NotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const openAlert = (response: Notifications.NotificationResponse | null) => {
      const alertId = response?.notification.request.content.data?.alertId;
      if (typeof alertId !== 'string') return;
      if (navigationRef.isReady()) navigationRef.navigate('AlertDetail', { alertId });
    };
    void Notifications.getLastNotificationResponseAsync().then(openAlert).catch((error: unknown) => {
      console.error('Could not read the initial notification response.', error);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(openAlert);
    return () => subscription.remove();
  }, []);
  return null;
}

function AppNavigation() {
  const { colors, mode } = useTheme();
  const { user, ready } = useSession();
  const blurTarget = useRef<ComponentRef<typeof View> | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))), []);
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    void Notifications.requestPermissionsAsync().catch((error: unknown) => {
      console.error('Could not request notification permission.', error);
    });
  }, [user]);
  return <SplashGate ready={ready}><View style={{ flex: 1, width: '100%', height: '100%', backgroundColor: colors.canvas }}>
    <BlurTargetView ref={blurTarget} style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]} pointerEvents="none">
      {user && <Image source={roleBackgrounds[user.role][mode]} resizeMode="cover" style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.15 }] }]} accessible={false} />}
    </BlurTargetView>
    <BlurTargetContext.Provider value={blurTarget}>
    <NavigationContainer ref={navigationRef} linking={linking} theme={{ ...(mode === 'dark' ? NavigationDarkTheme : NavigationLightTheme), colors: { ...(mode === 'dark' ? NavigationDarkTheme : NavigationLightTheme).colors, primary: colors.teal, background: user ? 'transparent' : colors.canvas, card: colors.surface, text: colors.ink, border: colors.border } }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <LiveSync />
      <NotificationNavigation />
      <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: user ? 'transparent' : colors.canvas }, headerStyle: { backgroundColor: user ? 'transparent' : colors.canvas }, headerTintColor: colors.ink, headerShadowVisible: false, headerTitleStyle: { fontWeight: '700' } }}>
        {!user ? <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
          <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} options={{ headerShown: false }} />
        </> : <>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: 'Alert detail' }} />
          {canAccess(user.role, 'validation') && <Stack.Screen name="ValidationReview" component={ManagerReviewScreen} options={{ title: 'Validation review' }} />}
        </>}
      </Stack.Navigator>
    </NavigationContainer>
    <ConnectionNotice online={online} />
    {user && <CriticalAlertModal />}
    </BlurTargetContext.Provider>
  </View></SplashGate>;
}

export default function App() {
  return <ThemeProvider><ThemedApp /></ThemeProvider>;
}

function ThemedApp() {
  const { colors, mode } = useTheme();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SystemUI.setBackgroundColorAsync(colors.canvas).catch((error: unknown) => {
      console.error('Could not update the system background color.', error);
    });
  }, [colors.canvas]);
  const paperTheme = mode === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000, dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.queryKey[0] !== 'mobile-chat' && defaultShouldDehydrateQuery(query),
    shouldDehydrateMutation: (mutation) => mutation.options.mutationKey?.[0] !== 'mobile-chat' && defaultShouldDehydrateMutation(mutation),
  } }}>
    <AppProviders theme={{ ...paperTheme, colors: { ...paperTheme.colors, primary: colors.teal, background: colors.canvas, surface: colors.surface, onSurface: colors.ink, onSurfaceVariant: colors.muted } }}>
      <AppNavigation />
    </AppProviders>
  </PersistQueryClientProvider>;
}
