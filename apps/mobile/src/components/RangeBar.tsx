import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { safeRangeGauge } from '@hydrosense/shared';
import { useTheme } from '../theme';

type Gauge = NonNullable<ReturnType<typeof safeRangeGauge>>;

export function RangeBar({ gauge, min, max, accessibilityLabel }: {
  gauge: Gauge;
  min?: number;
  max?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return <View accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: 8, marginTop: 4 }}>
    <View style={{ height: 8, marginHorizontal: 7 }}>
      <View style={{ height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#304c6c' }}>
        <LinearGradient
          colors={['#22c55e', '#eab308', '#f97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', left: `${gauge.safeStart}%`, width: `${gauge.safeEnd - gauge.safeStart}%`, height: 8 }}
        />
        <View style={{ position: 'absolute', left: `${gauge.safeEnd}%`, right: 0, height: 8, backgroundColor: '#66384a' }} />
      </View>
      <View style={{ position: 'absolute', left: `${gauge.position}%`, top: -3, marginLeft: -7, height: 14, width: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.canvas }} />
    </View>
    <View style={{ height: 18, marginHorizontal: 7 }}>
      {min !== undefined && <Text style={{ position: 'absolute', left: `${gauge.safeStart}%`, width: 48, marginLeft: gauge.safeStart === 0 ? 0 : -24, textAlign: gauge.safeStart === 0 ? 'left' : 'center', color: colors.ink, fontSize: 12 }}>{min}</Text>}
      {max !== undefined && <Text style={{ position: 'absolute', left: `${gauge.safeEnd}%`, width: 48, marginLeft: gauge.safeEnd === 100 ? -48 : -24, textAlign: gauge.safeEnd === 100 ? 'right' : 'center', color: colors.ink, fontSize: 12 }}>{max}</Text>}
    </View>
  </View>;
}
