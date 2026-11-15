import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uiScale, useTheme } from '../theme';
import type { Palette } from '../theme';

export function Page({ children, auth = false }: PropsWithChildren<{ auth?: boolean }>) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <LinearGradient colors={[colors.canvas, colors.backgroundVia, colors.backgroundTo]} style={styles.background}>
    <KeyboardAvoidingView style={styles.background} behavior={auth && Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe} edges={auth ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, auth && styles.authScroll]}>
          <View style={[styles.page, { paddingHorizontal: width >= 600 ? uiScale.spacing[6] : uiScale.spacing[4] }, auth && styles.authPage]}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </LinearGradient>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={compact ? styles.brandCompact : styles.brand}>
    <Image source={require('../../assets/hydrosense-logo.png')} resizeMode="contain" accessibilityLabel="HydroSense logo" style={compact ? styles.logoSmall : styles.logo} />
    <View style={compact ? styles.brandTextCompact : styles.brandText}>
      <Text numberOfLines={compact ? 1 : undefined} style={compact ? styles.brandNameSmall : styles.brandName}>HydroSense</Text>
      <Text numberOfLines={compact ? 1 : undefined} style={styles.brandCaption}>WATER QUALITY MONITORING</Text>
    </View>
  </View>;
}

export function Title({ children, detail, centered = false }: { children: string; detail?: string; centered?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={[styles.heading, centered && styles.centered]}><Text style={[styles.title, centered && styles.centerText]}>{children}</Text>{detail ? <Text style={[styles.muted, centered && styles.centerText]}>{detail}</Text> : null}</View>;
}

export function Card({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const { colors, reduceTransparency } = useTheme();
  const styles = createStyles(colors);
  return <View style={[styles.card, reduceTransparency && { backgroundColor: colors.surface }]}>{(title || action) && <View style={styles.cardHeading}>{title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}{action}</View>}{children}</View>;
}

export function Button({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const styles = createStyles(colors);
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, disabled && styles.disabled, pressed && !reduceMotion && styles.pressed]}>
    {secondary ? <Text style={styles.secondaryText}>{label}</Text> :
      <LinearGradient colors={['#1d4ed8', '#0369a1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}><Text style={styles.buttonText}>{label}</Text></LinearGradient>}
  </Pressable>;
}

export function StateMessage({ message, loading }: { message: string; loading?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={styles.state}>{loading ? <ActivityIndicator color={colors.teal} /> : null}<Text style={[styles.muted, styles.centerText]}>{message}</Text></View>;
}

export function DataRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={styles.dataRow}><View style={{ flex: 1 }}><Text style={styles.dataLabel}>{label}</Text>{detail ? <Text style={styles.muted}>{detail}</Text> : null}</View><Text style={styles.dataValue}>{value}</Text></View>;
}

export const createFormStyles = (colors: Palette) => StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, paddingHorizontal: uiScale.spacing[3], paddingVertical: uiScale.spacing[2], minHeight: 48, backgroundColor: colors.surface, color: colors.ink, fontSize: uiScale.type.body },
  label: { color: colors.ink, fontWeight: '700', marginBottom: uiScale.spacing[1], fontSize: 14 },
  formField: { gap: uiScale.spacing[2], marginBottom: uiScale.spacing[3] },
});

const createStyles = (colors: Palette) => StyleSheet.create({
  background: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  authScroll: { justifyContent: 'center' },
  page: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingTop: uiScale.spacing[5], paddingBottom: uiScale.spacing[6], gap: uiScale.spacing[3] },
  authPage: { maxWidth: 480, paddingTop: uiScale.spacing[6], paddingBottom: uiScale.spacing[6] },
  brand: { alignItems: 'center', gap: uiScale.spacing[2], marginBottom: uiScale.spacing[2] },
  brandCompact: { flexDirection: 'row', alignItems: 'center', gap: uiScale.spacing[2], minWidth: 0 },
  brandTextCompact: { flexShrink: 1, minWidth: 0 },
  brandText: { alignItems: 'center', gap: uiScale.spacing[1] },
  logo: { width: 52, height: 74 },
  logoSmall: { width: 26, height: 37, flexShrink: 0 },
  brandName: { color: colors.ink, fontWeight: '800', fontSize: 24, letterSpacing: -0.5 },
  brandNameSmall: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  brandCaption: { color: colors.muted, fontSize: uiScale.type.caption, letterSpacing: 0.9, fontWeight: '700' },
  heading: { gap: uiScale.spacing[2], paddingVertical: uiScale.spacing[1] / 2 },
  centered: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  title: { color: colors.ink, fontSize: uiScale.type.title, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  muted: { color: colors.muted, fontSize: uiScale.type.body, lineHeight: 24 },
  card: { backgroundColor: colors.card, borderRadius: uiScale.radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: uiScale.spacing[4], gap: uiScale.spacing[3], shadowColor: '#1e40af', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: colors.ink, fontSize: uiScale.type.section, fontWeight: '700', flexShrink: 1 },
  button: { minHeight: 48, borderRadius: uiScale.radius.pill, overflow: 'hidden', justifyContent: 'center' },
  buttonGradient: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  secondaryText: { color: colors.ink, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  state: { padding: 18, alignItems: 'center', gap: 10 },
  dataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: uiScale.spacing[3], gap: uiScale.spacing[2] },
  dataLabel: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  dataValue: { color: colors.ink, fontWeight: '700', fontSize: uiScale.type.body, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
