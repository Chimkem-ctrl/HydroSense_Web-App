import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { chartTimeDomain, gapRanges, nightRanges, prepareParameterRows, prepareTrendRows, sampleParameterReadings, trendYAxisDomain } from '@hydrosense/shared';
import type { Reading, TrendParameter } from '@hydrosense/shared';
import { uiScale, useTheme } from '../theme';

export function TrendChart({ readings, parameter, expanded = false }: { readings: Reading[]; parameter: TrendParameter; expanded?: boolean }) {
  const { colors } = useTheme();
  const rows = prepareTrendRows(readings).rows;
  const plotted = prepareParameterRows(sampleParameterReadings(rows, parameter.key), parameter.key);
  const points = plotted.flatMap((row) => {
    const value = parameter.key === 'do' ? row.doMgL : row[parameter.key];
    return typeof value === 'number' && Number.isFinite(value) ? [{ timestamp: row.timestamp, value }] : [];
  });
  if (!points.length) return <Text style={{ color: colors.muted }}>No valid readings in this range.</Text>;

  const first = Date.parse(rows[0].timestamp);
  const last = Date.parse(rows[rows.length - 1].timestamp);
  const [from, to] = chartTimeDomain(rows, first - 60_000, last + 60_000);
  const [low, high] = trendYAxisDomain(parameter, rows);
  const x = (time: number) => 40 + (Math.max(from, Math.min(to, time)) - from) / (to - from) * 272;
  const y = (value: number) => 166 - (Math.max(low, Math.min(high, value)) - low) / (high - low) * 150;
  const safeTop = y(parameter.safeMax ?? high);
  const safeBottom = y(parameter.safeMin ?? low);
  const paths: string[] = [];
  let path = '';
  plotted.forEach((row) => {
    const value = parameter.key === 'do' ? row.doMgL : row[parameter.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      if (path) paths.push(path);
      path = '';
    } else {
      path += `${path ? ' L' : 'M'} ${x(row.timestamp)} ${y(value)}`;
    }
  });
  if (path) paths.push(path);
  const formatTick = (time: number) => new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
    ...(to - from <= 2 * 86_400_000 ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(time));
  return <View accessible accessibilityLabel={`${parameter.title} trend chart. ${points.length} plotted readings. Safe range, overnight periods and gaps highlighted.`} style={{ gap: uiScale.spacing[1] }}>
    <Svg width="100%" height={expanded ? 300 : 220} viewBox="0 0 320 190" preserveAspectRatio="none">
      {nightRanges(rows).filter((range) => range.x2 >= from && range.x1 <= to).map((range) => <Rect key={`night-${range.x1}`} x={x(range.x1)} y={16} width={Math.max(0, x(range.x2) - x(range.x1))} height={150} fill={colors.teal} fillOpacity={0.08} />)}
      {(parameter.safeMin !== undefined || parameter.safeMax !== undefined) && <Rect x={40} y={safeTop} width={272} height={Math.max(0, safeBottom - safeTop)} fill={colors.normal} fillOpacity={0.14} />}
      {gapRanges(rows, parameter.key).map((gap) => <Rect key={`gap-${gap.x1}`} x={x(gap.x1)} y={16} width={Math.max(0, x(gap.x2) - x(gap.x1))} height={150} fill={colors.muted} fillOpacity={0.12} />)}
      {Array.from({ length: 5 }, (_, index) => {
        const position = 16 + index * 37.5;
        return <Line key={`grid-${index}`} x1={40} x2={312} y1={position} y2={position} stroke={colors.border} strokeDasharray="4 4" />;
      })}
      {Array.from({ length: 5 }, (_, index) => <SvgText key={`label-${index}`} x={35} y={20 + index * 37.5} textAnchor="end" fill={colors.muted} fontSize={9}>{(high - (high - low) * index / 4).toFixed(1)}</SvgText>)}
      {paths.map((value, index) => <Path key={`line-${index}`} d={value} fill="none" stroke={colors.teal} strokeWidth={2} />)}
      {points.map((point, index) => <Circle key={`${point.timestamp}-${index}`} cx={x(point.timestamp)} cy={y(point.value)} r={3} fill={(parameter.safeMin !== undefined && point.value < parameter.safeMin) || (parameter.safeMax !== undefined && point.value > parameter.safeMax) ? colors.critical : colors.teal} />)}
    </Svg>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: uiScale.spacing[2] }}><Text style={{ color: colors.muted, fontSize: uiScale.type.caption, flexShrink: 1 }}>{formatTick(first)}</Text><Text style={{ color: colors.muted, fontSize: uiScale.type.caption, flexShrink: 1, textAlign: 'right' }}>{formatTick(last)} PHT</Text></View>
  </View>;
}
