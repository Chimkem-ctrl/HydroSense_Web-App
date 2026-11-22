import { createContext, useContext, useRef, useState } from 'react';
import type { ComponentProps, ComponentRef, PropsWithChildren, ReactNode, RefObject } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dialog, Portal } from 'react-native-paper';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { authColors, uiScale, useTheme } from '../theme';
import type { Palette } from '../theme';
import logoImage from '../../assets/hydrosense-logo.png';
import oceanImage from '../../../web/public/assets/images/deep-blue-ocean.jpg';

export const BlurTargetContext = createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);
export const TabBarVisibleContext = createContext(false);
export const RedesignedContext = createContext(false);
const CardContext = createContext(false);
// Android's default tint is 44% of intensity; 9 / 0.45 preserves a 20px blur with about 4% tint.
const androidBlurIntensity = 9;
const androidBlurReduction = 0.45;
const webCardBlur = {
  backgroundColor: 'transparent',
  backdropFilter: 'blur(20px) saturate(120%)',
  WebkitBackdropFilter: 'blur(20px) saturate(120%)',
};
const webAuthBlur = {
  backgroundColor: 'transparent',
  backdropFilter: 'blur(8px) saturate(120%)',
  WebkitBackdropFilter: 'blur(8px) saturate(120%)',
};
const needsSolidFallback = (reduceTransparency: boolean) => reduceTransparency || (Platform.OS === 'web' && (typeof CSS === 'undefined' || !(CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))));

function glassBlur(blurTarget: RefObject<ComponentRef<typeof View> | null> | null, styles: ReturnType<typeof createStyles>, auth = false) {
  return Platform.OS === 'web'
    ? <View style={[StyleSheet.absoluteFill, styles.cardBlur, auth ? webAuthBlur : webCardBlur]} pointerEvents="none" />
    : <BlurView blurTarget={blurTarget ?? undefined} blurMethod="dimezisBlurView" tint={auth ? 'dark' : Platform.OS === 'ios' ? 'systemUltraThinMaterial' : 'default'} intensity={auth ? 8 : Platform.OS === 'android' ? androidBlurIntensity : 25} blurReductionFactor={auth ? 1 : androidBlurReduction} style={[StyleSheet.absoluteFill, styles.cardBlur]} pointerEvents="none" />;
}

export function Page({ children, auth = false, redesigned = false, bottomPadding, maxWidth }: PropsWithChildren<{ auth?: boolean; redesigned?: boolean; bottomPadding?: number; maxWidth?: number }>) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const tabBarVisible = useContext(TabBarVisibleContext);
  const authBlurTarget = useRef<ComponentRef<typeof View> | null>(null);
  const styles = createStyles(colors);
  const content = <KeyboardAvoidingView style={styles.background} behavior={auth && Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe} edges={auth ? ['top', 'left', 'right', 'bottom'] : tabBarVisible ? ['left', 'right'] : ['left', 'right', 'bottom']}>
        <ScrollView style={styles.background} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, auth && styles.authScroll]}>
          <View style={[styles.page, redesigned && { gap: uiScale.spacing[4] }, { paddingHorizontal: width >= 600 ? uiScale.spacing[6] : uiScale.spacing[4] }, bottomPadding !== undefined && { paddingBottom: bottomPadding }, auth && styles.authPage, maxWidth !== undefined && { maxWidth }]}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>;
  return auth
    ? <View style={[styles.background, styles.authBackground, { minHeight: height }]}>
      <BlurTargetView ref={authBlurTarget} style={styles.authBackdrop} pointerEvents="none">
        <Image source={oceanImage} resizeMode="cover" style={styles.authBackdropImage} accessible={false} />
        <LinearGradient colors={[authColors.scrimTop, authColors.scrimBottom]} style={StyleSheet.absoluteFill} />
      </BlurTargetView>
      <BlurTargetContext.Provider value={authBlurTarget}>{content}</BlurTargetContext.Provider>
    </View>
    : <RedesignedContext.Provider value={redesigned}><View style={styles.background}>{content}</View></RedesignedContext.Provider>;
}

export function Brand({ compact = false, showCaption = !compact, onLogoPress, logoExpanded, auth = false }: { compact?: boolean; showCaption?: boolean; onLogoPress?: () => void; logoExpanded?: boolean; auth?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const content = <>
    <Image source={logoImage} resizeMode="contain" accessibilityLabel="HydroSense logo" style={auth ? styles.authLogo : compact ? styles.logoSmall : styles.logo} />
    <View style={compact || auth ? styles.brandTextCompact : styles.brandText}>
      <Text numberOfLines={compact || auth ? 1 : undefined} style={auth ? styles.authBrandName : compact ? styles.brandNameSmall : styles.brandName}>HydroSense</Text>
      {showCaption && <Text numberOfLines={compact || auth ? 1 : undefined} style={[styles.brandCaption, compact && styles.brandCaptionCompact, auth && styles.authBrandCaption]}>WATER QUALITY MONITORING</Text>}
    </View>
  </>;
  const style = compact || auth ? styles.brandCompact : styles.brand;
  return onLogoPress
    ? <Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu" accessibilityState={{ expanded: logoExpanded }} onPress={onLogoPress} style={style}>{content}</Pressable>
    : <View style={style}>{content}</View>;
}

export function Title({ children, detail, centered = false, icon }: { children: string; detail?: string; centered?: boolean; icon?: ReactNode }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={[styles.heading, centered && styles.centered]}><View style={styles.titleRow}>{icon}<Text style={[styles.title, centered && styles.centerText]}>{children}</Text></View>{detail ? <Text style={[styles.muted, centered && styles.centerText]}>{detail}</Text> : null}</View>;
}

export function Card({ children, title, action, auth = false, toneColor }: { children: ReactNode; title?: string; action?: ReactNode; auth?: boolean; toneColor?: string }) {
  const { colors, reduceTransparency } = useTheme();
  const blurTarget = useContext(BlurTargetContext);
  const nested = useContext(CardContext);
  const redesigned = useContext(RedesignedContext);
  const styles = createStyles(colors);
  const solidFallback = needsSolidFallback(reduceTransparency) || (Platform.OS === 'android' && !blurTarget && !nested);
  return <CardContext.Provider value>
    <View style={[styles.card, redesigned && { borderColor: colors.border }, nested && styles.nestedCard, solidFallback && !nested && { backgroundColor: colors.surface }, auth && styles.authCard, auth && solidFallback && { backgroundColor: authColors.solidPanel }, toneColor && { borderColor: toneColor }]}>
      {!nested && !solidFallback && glassBlur(blurTarget, styles, auth)}
      {auth && !solidFallback && <LinearGradient colors={[authColors.panelTop, authColors.panel]} style={[StyleSheet.absoluteFill, styles.cardBlur]} pointerEvents="none" />}
      {toneColor && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cardBlur, { backgroundColor: `${toneColor}20` }]} />}
      {(title || action) && <View style={styles.cardHeading}>{title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}{action}</View>}{children}
    </View>
  </CardContext.Provider>;
}

export function GlassDialog({ children, visible, onDismiss, solid = false }: { children: ComponentProps<typeof Dialog>['children']; visible: boolean; onDismiss: () => void; solid?: boolean }) {
  const { colors, reduceTransparency } = useTheme();
  const blurTarget = useContext(BlurTargetContext);
  const styles = createStyles(colors);
  const solidFallback = solid || needsSolidFallback(reduceTransparency);
  if (Platform.OS === 'android' && !blurTarget && !solidFallback) throw new Error('GlassDialog requires a blur target.');
  return <Portal>
    <Dialog visible={visible} onDismiss={onDismiss} style={[styles.dialog, solidFallback && { backgroundColor: colors.surface }]}>
      {!solidFallback && <DialogBlur blurTarget={blurTarget} />}
      {children}
    </Dialog>
  </Portal>;
}

function DialogBlur({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> | null }) {
  const { colors } = useTheme();
  // Paper adds a first-child margin; the absolute backdrop must not inherit it.
  return glassBlur(blurTarget, createStyles(colors));
}

export function Button({ label, onPress, disabled, secondary, soft, style, icon }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; soft?: boolean; style?: StyleProp<ViewStyle>; icon?: ReactNode }) {
  const { colors, reduceMotion } = useTheme();
  const redesigned = useContext(RedesignedContext);
  const styles = createStyles(colors);
  const outlined = secondary || soft;
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, outlined && styles.secondaryButton, soft && styles.softActionButton, redesigned && outlined && { backgroundColor: colors.glassControl }, disabled && styles.disabled, pressed && !reduceMotion && styles.pressed, style]}>
    {outlined ? <View style={styles.buttonContent}>{icon}<Text style={styles.secondaryText}>{label}</Text></View> :
      <LinearGradient colors={['#1d4ed8', '#0369a1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}><View style={styles.buttonContent}>{icon}<Text style={styles.buttonText}>{label}</Text></View></LinearGradient>}
  </Pressable>;
}

export function FilterField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  const redesigned = useContext(RedesignedContext);
  const styles = createStyles(colors);
  return <View style={styles.filterField}>
    <Text style={styles.filterLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} style={[styles.filterInput, redesigned && { backgroundColor: colors.glassControl }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize="none" />
  </View>;
}

function parseCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function calendarDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function CalendarFilterField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [visible, setVisible] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const selectedDate = parseCalendarDate(value);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const leadingDays = new Date(year, month, 1).getDay();
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function openCalendar() {
    const current = selectedDate ?? new Date();
    setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setVisible(true);
  }

  function moveMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return <View style={styles.filterField}>
    <Text style={styles.filterLabel}>{label}</Text>
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.surface }}>
      <TextInput accessibilityLabel={label} style={[styles.filterInput, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]} value={value} onChangeText={onChangeText} placeholder={placeholder ?? 'YYYY-MM-DD'} placeholderTextColor={colors.muted} autoCapitalize="none" />
      <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()}`} onPress={openCalendar} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <CalendarDays size={18} color={colors.teal} />
      </Pressable>
    </View>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: uiScale.spacing[4], backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
        <View style={{ gap: uiScale.spacing[3], borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.card, padding: uiScale.spacing[4], backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={20} color={colors.ink} /></Pressable>
            <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{monthLabel}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={20} color={colors.ink} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => <Text key={weekday} accessibilityLabel={weekday} style={{ width: '14.28%', paddingVertical: 8, color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{weekday.slice(0, 1)}</Text>)}
            {Array.from({ length: leadingDays }, (_, index) => <View key={`empty-${index}`} style={{ width: '14.28%', height: 40 }} />)}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const dateKey = calendarDateKey(year, month, day);
              const selected = dateKey === value;
              const dateLabel = new Date(year, month, day).toLocaleDateString();
              return <Pressable key={dateKey} accessibilityRole="button" accessibilityLabel={dateLabel} accessibilityState={{ selected }} onPress={() => { onChangeText(dateKey); setVisible(false); }} style={{ width: '14.28%', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: uiScale.radius.pill, backgroundColor: selected ? colors.selected : 'transparent' }}>
                <Text style={{ color: selected ? colors.teal : colors.ink, fontWeight: selected ? '700' : '400' }}>{day}</Text>
              </Pressable>;
            })}
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const redesigned = useContext(RedesignedContext);
  const styles = createStyles(colors);
  const content = <Text style={[styles.chipText, selected && styles.chipSelectedText]}>{label}</Text>;
  return onPress
    ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, redesigned && { backgroundColor: colors.glassControl }, styles.selectableChip, selected && styles.chipSelected]}>{content}</Pressable>
    : <View style={[styles.chip, redesigned && { backgroundColor: colors.glassControl }]}>{content}</View>;
}

export const createRecordStyles = (colors: Palette) => StyleSheet.create({
  row: { gap: uiScale.spacing[1], paddingVertical: uiScale.spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiScale.spacing[2] },
  title: { color: colors.ink, fontWeight: '700', flexShrink: 1 },
  caption: { color: colors.muted, fontSize: uiScale.type.caption, flexShrink: 1 },
  body: { color: colors.ink },
  metrics: { flexDirection: 'row', gap: uiScale.spacing[2], marginTop: uiScale.spacing[1] },
  metric: { flex: 1, minWidth: 0, gap: uiScale.spacing[1] },
  value: { color: colors.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export function StateMessage({ message, loading, spacious = false }: { message: string; loading?: boolean; spacious?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={[styles.state, spacious && styles.spaciousState]}>{loading ? <ActivityIndicator color={colors.teal} /> : null}<Text style={[styles.muted, styles.centerText]}>{message}</Text></View>;
}

export function DataRow({ label, value, detail, valueColor }: { label: string; value: string; detail?: string; valueColor?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={styles.dataRow}><View style={{ flex: 1 }}><Text style={styles.dataLabel}>{label}</Text>{detail ? <Text style={styles.muted}>{detail}</Text> : null}</View><Text style={[styles.dataValue, valueColor ? { color: valueColor } : null]}>{value}</Text></View>;
}

export const createFormStyles = (colors: Palette) => StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[2], minHeight: 48, backgroundColor: colors.surface, color: colors.ink, fontSize: uiScale.type.body },
  label: { color: colors.ink, fontWeight: '700', marginBottom: uiScale.spacing[1], fontSize: 14 },
  formField: { gap: uiScale.spacing[2], marginBottom: uiScale.spacing[3] },
});

const createStyles = (colors: Palette) => StyleSheet.create({
  background: { flex: 1, backgroundColor: 'transparent' },
  authBackground: { width: '100%', backgroundColor: authColors.background },
  authBackdrop: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  authBackdropImage: { width: '100%', height: '100%' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, backgroundColor: 'transparent' },
  authScroll: { justifyContent: 'center' },
  page: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingTop: uiScale.spacing[5], paddingBottom: uiScale.spacing[6], gap: uiScale.spacing[3], backgroundColor: 'transparent' },
  authPage: { maxWidth: 480, paddingTop: uiScale.spacing[6], paddingBottom: uiScale.spacing[6], backgroundColor: 'transparent' },
  brand: { alignItems: 'center', gap: uiScale.spacing[2], marginBottom: uiScale.spacing[2] },
  brandCompact: { flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], minWidth: 0 },
  brandTextCompact: { flexShrink: 1, minWidth: 0 },
  brandText: { alignItems: 'center', gap: uiScale.spacing[1] },
  logo: { width: 52, height: 74 },
  logoSmall: { width: 26, height: 37, flexShrink: 0 },
  authLogo: { width: 36, height: 36, flexShrink: 0 },
  authBrandName: { color: authColors.ink, fontWeight: '700', fontSize: 20, lineHeight: 22 },
  authBrandCaption: { color: authColors.caption, fontSize: 10, letterSpacing: 1.6, marginTop: 2 },
  logoButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.ink, fontWeight: '800', fontSize: 24, letterSpacing: -0.5 },
  brandNameSmall: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  brandCaption: { color: colors.muted, fontSize: uiScale.type.caption, letterSpacing: 0.9, fontWeight: '700' },
  brandCaptionCompact: { fontSize: 10, letterSpacing: 0.2 },
  heading: { gap: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] / 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  centered: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  title: { color: colors.ink, fontSize: uiScale.type.title, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4, flexShrink: 1 },
  muted: { color: colors.muted, fontSize: uiScale.type.body, lineHeight: 24 },
  card: { backgroundColor: Platform.OS === 'android' ? 'transparent' : 'rgba(255,255,255,0.04)', borderRadius: uiScale.radius.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: uiScale.spacing[4], gap: uiScale.spacing[3], boxShadow: '0px 8px 32px rgba(0,0,0,0.25)' },
  authCard: { backgroundColor: 'transparent', borderColor: authColors.border, padding: uiScale.spacing[5], gap: uiScale.spacing[5] },
  dialog: { backgroundColor: Platform.OS === 'android' ? 'transparent' : 'rgba(255,255,255,0.04)', borderRadius: uiScale.radius.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', elevation: 0, boxShadow: '0px 8px 32px rgba(0,0,0,0.25)' },
  cardBlur: { borderRadius: uiScale.radius.card, overflow: 'hidden' },
  nestedCard: { backgroundColor: 'transparent', boxShadow: 'none' },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700', flexShrink: 1 },
  button: { minHeight: 48, borderRadius: uiScale.radius.pill, overflow: 'hidden', justifyContent: 'center' },
  buttonGradient: { flexGrow: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  buttonContent: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 14, textAlign: 'center', flexShrink: 1 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  softActionButton: { borderColor: colors.teal, backgroundColor: colors.selected, shadowColor: colors.teal, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 1 },
  secondaryText: { color: colors.ink, fontWeight: '700', fontSize: 14, textAlign: 'center', flexShrink: 1 },
  filterField: { flex: 1, minWidth: 0, gap: 6 },
  filterLabel: { color: colors.muted, fontSize: uiScale.type.caption },
  filterInput: { minHeight: 44, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[2], backgroundColor: colors.surface, color: colors.ink, fontSize: 14 },
  chip: { alignSelf: 'flex-start', flexShrink: 1, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.pill, paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[1], backgroundColor: colors.surface },
  selectableChip: { minHeight: 44, justifyContent: 'center' },
  chipSelected: { borderColor: colors.teal, backgroundColor: colors.selected },
  chipText: { color: colors.ink, fontSize: uiScale.type.caption, fontWeight: '600' },
  chipSelectedText: { color: colors.teal },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  state: { padding: 18, alignItems: 'center', gap: 10 },
  spaciousState: { padding: uiScale.spacing[5] },
  dataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: uiScale.spacing[3], gap: uiScale.spacing[2] },
  dataLabel: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  dataValue: { color: colors.ink, fontWeight: '700', fontSize: uiScale.type.body, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
