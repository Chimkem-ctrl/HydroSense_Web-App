import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Animated, Easing, Image, ImageBackground, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from './theme';

const SPLASH_OVERLAY_TOP = 'rgba(0,0,0,0.15)';
const SPLASH_OVERLAY_BOTTOM = 'rgba(0,0,0,0.45)';
const SPLASH_SCRIM_COLOR = '#000000';
const SPLASH_SCRIM_OPACITY = 0.45;

export default function SplashScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const { width } = useWindowDimensions();
  const { reduceMotion } = useTheme();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const styles = createStyles(width);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  return (
    <ImageBackground
      source={require('../../web/public/assets/images/deep-blue-ocean.jpg')}
      resizeMode="cover"
      style={styles.container}
      imageStyle={styles.backgroundImage}
    >
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[SPLASH_OVERLAY_TOP, SPLASH_OVERLAY_BOTTOM]}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={styles.overlay}
      />
      <Svg pointerEvents="none" style={styles.scrim} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="splash-text-scrim" cx="50%" cy="50%" rx="62%" ry="62%">
            <Stop offset="0%" stopColor={SPLASH_SCRIM_COLOR} stopOpacity={SPLASH_SCRIM_OPACITY} />
            <Stop offset="65%" stopColor={SPLASH_SCRIM_COLOR} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#splash-text-scrim)" />
      </Svg>
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <Animated.View style={[styles.content, { opacity }]}>
          <Image
            source={require('../assets/hydrosense-logo.png')}
            resizeMode="contain"
            accessibilityLabel="HydroSense logo"
            style={styles.logo}
          />
          <Text style={styles.title}>HYDROSENSE</Text>
          <View style={styles.divider} />
          <Text style={styles.tagline}>REAL-TIME WATER QUALITY MONITORING</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onGetStarted}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaPressed,
              focused && styles.ctaFocused,
            ]}
          >
            <Text style={styles.ctaText}>Get Started</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

export function SplashGate({ ready, children }: PropsWithChildren<{ ready: boolean }>) {
  const [requested, setRequested] = useState(false);
  if (ready && requested) return children;
  return <SplashScreen onGetStarted={() => setRequested(true)} />;
}

const createStyles = (width: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1118' },
  backgroundImage: { width: '100%', height: '100%', alignSelf: 'center' },
  overlay: StyleSheet.absoluteFill,
  scrim: StyleSheet.absoluteFill,
  safeArea: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: width < 400 ? 22 : 28, paddingHorizontal: 24 },
  logo: { width: 72, height: 96 },
  title: {
    color: '#f5f7fb',
    fontSize: width < 400 ? 30 : 42,
    fontWeight: '500',
    letterSpacing: width < 400 ? 7 : 12,
    lineHeight: width < 400 ? 38 : 52,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.18)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  divider: { width: 96, height: 1, backgroundColor: 'rgba(245,247,251,0.55)' },
  tagline: { maxWidth: width < 400 ? 280 : 360, color: '#b6c4d2', fontSize: 11, letterSpacing: 2, lineHeight: 19, textAlign: 'center' },
  cta: { borderWidth: 1, borderColor: 'rgba(245,247,251,0.7)', borderRadius: 999, paddingVertical: 13, paddingHorizontal: 34 },
  ctaPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  ctaFocused: {
    borderColor: '#fff',
    borderWidth: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaText: { color: '#f5f7fb', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
});
