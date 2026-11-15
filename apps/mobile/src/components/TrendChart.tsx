import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { MeasuredParameter, Reading } from '@hydrosense/shared';
import { useTheme } from '../theme';
import { trendSegments } from '../services/trendData';

export function TrendChart({ readings, parameter, expanded = false }: { readings: Reading[]; parameter: MeasuredParameter; expanded?: boolean }) {
  const { colors } = useTheme();
  const segments = trendSegments(readings, parameter);
  const points = segments.flat();
  if (!points.length) return <Text style={{ color: colors.muted }}>No valid readings in this range.</Text>;
  const times = points.map((point) => point.timestamp);
  const values = points.map((point) => point.value);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.1, 0.5);
  const x = (time: number) => 12 + (time - first) / Math.max(last - first, 1) * 296;
  const y = (value: number) => 190 - (value - (low - padding)) / (high - low + padding * 2) * 180;
  return <View accessible accessibilityLabel={`Trend chart. ${points.length} valid readings. Minimum ${low.toFixed(2)}, maximum ${high.toFixed(2)}.`}>
    <Text style={{ color: colors.muted }}>Max {high.toFixed(2)}</Text>
    <Svg width="100%" height={expanded ? 320 : 200} viewBox="0 0 320 200" preserveAspectRatio="none">
      {segments.map((segment, index) => <Path key={`line-${index}`} d={segment.map((point, i) => `${i ? 'L' : 'M'} ${x(point.timestamp)} ${y(point.value)}`).join(' ')} fill="none" stroke={colors.teal} strokeWidth={2} />)}
      {points.map((point, index) => <Circle key={`${point.timestamp}-${index}`} cx={x(point.timestamp)} cy={y(point.value)} r={2.5} fill={colors.teal} />)}
    </Svg>
    <Text style={{ color: colors.muted }}>Min {low.toFixed(2)}</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.muted, flexShrink: 1 }}>{new Date(first).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text><Text style={{ color: colors.muted, flexShrink: 1, textAlign: 'right' }}>{new Date(last).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text></View>
  </View>;
}
