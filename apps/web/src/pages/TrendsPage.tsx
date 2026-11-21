import { useMemo, useState } from 'react';
import { FileDown, FileImage, FileSpreadsheet } from 'lucide-react';
import { Brush, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { can, DEFAULT_THRESHOLDS, formatManilaDateTime, getManilaDateString, getRaisingDay, isValidMeasurement, toCsv } from '@hydrosense/shared';
import type { AlertItem, MeasuredParameter, Reading, Tank } from '@hydrosense/shared';
import { useQuery } from '@tanstack/react-query';
import { tierConfig } from '../app/config';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useSelectedTank } from '../app/tank/TankContext';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import { calculateTrendStatistics, dailyTicks, gapRanges, nightRanges, parameterValue, prepareParameterRows, prepareTrendRows, threeHourTicks, trendYAxisDomain } from './trendData';
import type { TrendParameter } from './trendData';

type Range = '24h' | '7d' | 'cycle' | 'custom';

interface ChartParameter extends TrendParameter {
  color: string;
}

interface ChartZoomSelection {
  startIndex: number;
  endIndex: number;
}

const defaultParameters: ChartParameter[] = [
  { key: 'temperature', title: 'Temperature', unit: '°C', color: 'var(--accent)', safeMin: 26, safeMax: 30 },
  { key: 'do', title: 'Dissolved oxygen', unit: 'mg/L', color: 'var(--chart-do)', safeMin: 4 },
  { key: 'ph', title: 'pH', unit: 'pH', color: 'var(--chart-ph)', safeMin: 6, safeMax: 8 },
] as const;

function isInRange(value: number, parameter: ChartParameter) {
  return value >= parameter.safeMin && (parameter.safeMax === undefined || value <= parameter.safeMax);
}

function metricValue(reading: Reading, parameter: MeasuredParameter) {
  return parameterValue(reading, parameter);
}

function inOvernightWindow(timestamp: string) {
  const hour = Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(new Date(timestamp)));
  return hour >= 22 || hour < 6;
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validReadings(rows: Reading[], parameter: MeasuredParameter) {
  return rows.filter((row) => {
    const value = metricValue(row, parameter);
    return isValidMeasurement(parameter, value);
  });
}

function renderNumber(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function adjustChartZoom(selection: ChartZoomSelection | undefined, rowCount: number, direction: 'in' | 'out'): ChartZoomSelection | undefined {
  if (rowCount < 2) return undefined;
  const lastIndex = rowCount - 1;
  const current = selection ?? { startIndex: 0, endIndex: lastIndex };
  const currentSpan = current.endIndex - current.startIndex;
  if (direction === 'in' && currentSpan <= 2) return current;
  if (direction === 'out' && currentSpan >= lastIndex) return undefined;

  const nextSpan = direction === 'in'
    ? Math.max(2, Math.floor(currentSpan / 2))
    : Math.min(lastIndex, currentSpan * 2);
  const center = (current.startIndex + current.endIndex) / 2;
  const startIndex = Math.max(0, Math.min(lastIndex - nextSpan, Math.round(center - nextSpan / 2)));
  return { startIndex, endIndex: startIndex + nextSpan };
}

export default function TrendsPage() {
  const { tankId } = useSelectedTank();
  const { role } = useRole();
  const canExport = can(role, 'exportReports');
  const [range, setRange] = useState<Range>('24h');
  const [customFrom, setCustomFrom] = useState(() => getManilaDateString(new Date(Date.now() - 6 * 86_400_000)));
  const [customTo, setCustomTo] = useState(() => getManilaDateString());
  const [exportMessage, setExportMessage] = useState('');
  const [chartZoom, setChartZoom] = useState<{
    key: string;
    ranges: Partial<Record<MeasuredParameter, ChartZoomSelection>>;
  }>({ key: '', ranges: {} });
  const dates = useMemo(() => {
    const to = new Date();
    if (range === 'custom') {
      return {
        from: new Date(`${customFrom}T00:00:00+08:00`),
        to: new Date(`${customTo}T23:59:59.999+08:00`),
      };
    }
    const days = range === '24h' ? 1 : range === '7d' ? Math.min(7, tierConfig.retentionDays) : Math.min(21, tierConfig.retentionDays);
    return { from: new Date(to.getTime() - days * 86_400_000), to };
  }, [customFrom, customTo, range]);
  const queryDates = useMemo(() => ({ from: dates.from.toISOString(), to: dates.to.toISOString() }), [dates]);
  const readingsQuery = useQuery({
    queryKey: ['trend-readings', tankId, queryDates.from, queryDates.to],
    queryFn: () => api.listReadings({ tankId, ...queryDates }),
    enabled: Boolean(tankId) && tierConfig.analytics,
  });
  const alertsQuery = useQuery({ queryKey: ['trend-alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) && tierConfig.analytics });
  const tanksQuery = useQuery({ queryKey: ['tanks'], queryFn: () => api.listTanks(), enabled: Boolean(tankId) && tierConfig.analytics });
  const manualEntriesQuery = useQuery({ queryKey: ['trend-manual-entries', tankId], queryFn: () => api.listManualEntries(tankId), enabled: Boolean(tankId) && tierConfig.analytics });
  const thresholdsQuery = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const parameters = defaultParameters.map((parameter) => {
    const threshold = thresholdsQuery.data?.find((item) => item.parameter === parameter.key)
      ?? DEFAULT_THRESHOLDS.find((item) => item.parameter === parameter.key);
    return { ...parameter, safeMin: threshold?.min ?? parameter.safeMin, safeMax: threshold?.max };
  });

  const readings = readingsQuery.data ?? [];
  const { rows } = useMemo(() => prepareTrendRows(readings), [readings]);
  const alerts = (alertsQuery.data ?? []).filter((alert) => {
    const timestamp = Date.parse(alert.createdAt);
    return timestamp >= dates.from.getTime() && timestamp <= dates.to.getTime();
  }).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const nightWindows = useMemo(() => nightRanges(rows), [rows]);
  const statistics = parameters.map((parameter) => calculateTrendStatistics(rows, parameter));
  const invalidReadings = statistics.reduce((total, stat) => total + stat.invalidReadings, 0);
  const alertCounts = alerts.reduce<Record<string, { warning: number; critical: number }>>((counts, alert) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(alert.createdAt));
    counts[day] ??= { warning: 0, critical: 0 };
    counts[day][alert.severity] += 1;
    return counts;
  }, {});
  const alertFrequency = Object.entries(alertCounts).sort(([left], [right]) => left.localeCompare(right)).map(([day, counts]) => ({
    date: day,
    day: new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00+08:00`)),
    ...counts,
  }));
  const selectedTank = (tanksQuery.data ?? []).find((tank: Tank) => tank.id === tankId);
  const from = dates.from.getTime();
  const to = dates.to.getTime();
  const chartZoomKey = `${tankId ?? ''}:${queryDates.from}:${queryDates.to}`;
  const xTicks = range === '24h' || (range === 'custom' && to - from <= 2 * 86_400_000)
    ? threeHourTicks(from, to)
    : dailyTicks(from, to);
  const loading = readingsQuery.isLoading || alertsQuery.isLoading || tanksQuery.isLoading || manualEntriesQuery.isLoading || thresholdsQuery.isLoading;
  const errorQuery = [readingsQuery, alertsQuery, tanksQuery, manualEntriesQuery, thresholdsQuery].find((item) => item.isError);
  const dateFormatter = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false });

  async function exportChart(parameter: MeasuredParameter | 'alert-frequency') {
    try {
      const container = document.getElementById(`trend-chart-${parameter}`);
      const svg = container?.querySelector('svg');
      if (!container || !svg) throw new Error('Chart is not available for export.');
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const styles = getComputedStyle(container);
      [
        '--text-primary', '--text-secondary', '--control-border', '--ok', '--chart-night',
        '--critical-text', '--warn-text', '--glass-bg-strong', '--accent', '--chart-do', '--chart-ph',
      ].forEach((name) => clone.style.setProperty(name, styles.getPropertyValue(name)));
      clone.style.backgroundColor = styles.backgroundColor;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const dimensions = svg.getBoundingClientRect();
      const width = Math.max(1, Math.round(dimensions.width));
      const height = Math.max(1, Math.round(dimensions.height));
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      const image = new Image();
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('The chart image could not be rendered.'));
          image.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PNG export is not supported by this browser.');
        context.scale(2, 2);
        context.drawImage(image, 0, 0, width, height);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error('The browser could not create a PNG file.')), 'image/png');
        });
        downloadBlob(`hydrosense-${parameter}-${range}.png`, blob);
        setExportMessage(`${parameter === 'alert-frequency' ? 'Alert frequency' : parameter.toUpperCase()} PNG downloaded.`);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setExportMessage(`PNG export failed: ${error instanceof Error ? error.message : 'Unexpected export error.'}`);
    }
  }

  function exportCsv(parameter: MeasuredParameter) {
    try {
      const config = parameters.find((item) => item.key === parameter);
      if (!config) throw new Error(`Unknown chart parameter: ${parameter}`);
      const csvRows = [
        ['Hatchery', 'Timestamp (PHT)', 'Tank', `${config.title} (${config.unit})`, 'Quality note'],
        ...rows.map((row) => {
          const value = metricValue(row, parameter);
          const invalid = parameter === 'ph' && (!Number.isFinite(value) || value < 0 || value > 14);
          const gap = parameter === 'do' && value === 0;
          const quality = gap ? 'Sensor/offline gap; excluded from statistics and chart line' : invalid ? 'Invalid pH; excluded from statistics and chart line' : !Number.isFinite(value) ? 'Invalid sensor value; excluded from statistics and chart line' : '';
          return [selectedTank?.site ?? '', formatManilaDateTime(new Date(row.timestamp)), selectedTank?.name ?? tankId ?? '', value, quality];
        }),
      ];
      downloadBlob(`hydrosense-${parameter}-trends-${range}.csv`, new Blob([toCsv(csvRows)], { type: 'text/csv;charset=utf-8' }));
      setExportMessage(`${config.title} CSV downloaded.`);
    } catch (error) {
      setExportMessage(`CSV export failed: ${error instanceof Error ? error.message : 'Unexpected export error.'}`);
    }
  }

  function exportAlertCsv() {
    try {
      const csvRows = [
        ['Hatchery', 'Tank', 'Date (PHT)', 'Warnings', 'Critical'],
        ...Object.entries(alertCounts).sort(([left], [right]) => left.localeCompare(right)).map(([day, counts]) => [selectedTank?.site ?? '', selectedTank?.name ?? tankId ?? '', day, counts.warning, counts.critical]),
      ];
      downloadBlob(`hydrosense-alert-frequency-${range}.csv`, new Blob([toCsv(csvRows)], { type: 'text/csv;charset=utf-8' }));
      setExportMessage('Alert frequency CSV downloaded.');
    } catch (error) {
      setExportMessage(`CSV export failed: ${error instanceof Error ? error.message : 'Unexpected export error.'}`);
    }
  }

  const latestReading = rows[rows.length - 1];
  return (
    <div className="stack trends-screen">
      <PageHeading
        title="Trends"
        description={`${selectedTank?.site ?? 'Selected hatchery'} · ${selectedTank?.name ?? 'Selected tank'}${latestReading ? ` · Last reading ${formatManilaDateTime(new Date(latestReading.timestamp))} PHT` : ''}`}
      />
      <div className="trends-toolbar">
        <div className="tabs" role="group" aria-label="Trend range">
          {([['24h', '24 hours', 1], ['7d', '7 days', 7], ['cycle', 'Full cycle', 21], ['custom', 'Custom', 0]] as const).map(([value, label, days]) => (
            <button type="button" className="tab" aria-pressed={range === value} disabled={days > tierConfig.retentionDays} key={value} onClick={() => setRange(value)}>{label}</button>
          ))}
        </div>
        {canExport && <button className="button button-primary button-soft-action trends-export-button" type="button" onClick={() => window.print()}><FileDown size={18} aria-hidden="true" />Export report</button>}
      </div>
      {range === 'custom' && <div className="trends-custom-range">
        <label className="field">From<input type="date" value={customFrom} min={getManilaDateString(new Date(Date.now() - Math.max(0, tierConfig.retentionDays - 1) * 86_400_000))} max={customTo} onChange={(event) => { if (event.target.value) setCustomFrom(event.target.value); }} /></label>
        <label className="field">To<input type="date" value={customTo} min={customFrom} max={getManilaDateString()} onChange={(event) => { if (event.target.value) setCustomTo(event.target.value); }} /></label>
      </div>}
      <StaleQueryState updatedAt={readingsQuery.dataUpdatedAt} />
      {exportMessage && <p className="trends-export-message" role="status">{exportMessage}</p>}
      {!tierConfig.analytics ? <section className="card glass"><h2 className="card-title">Analytics requires an upgrade</h2><p className="muted">Trend charts are available on premium and enterprise tiers.</p></section> :
        loading ? <LoadingState /> : errorQuery ? <ErrorState error={errorQuery.error} onRetry={() => {
          void Promise.all([readingsQuery.refetch(), alertsQuery.refetch(), tanksQuery.refetch(), manualEntriesQuery.refetch(), thresholdsQuery.refetch()]);
        }} /> : !tankId ? <EmptyState>No tanks are available for the selected hatchery.</EmptyState> : (
          <>
            <section className="trends-kpis" aria-label="Latest sensor readings and advisory status">
              {parameters.map((parameter, index) => {
                const statistic = statistics[index];
                const validRows = validReadings(rows, parameter.key);
                const latestRow = validRows[validRows.length - 1];
                return <article className="card glass trends-kpi-card" key={parameter.key}>
                  <p className="trends-kpi-label">{parameter.title}</p>
                  <p className="trends-kpi-value">{renderNumber(statistic.latest)} <span>{parameter.unit}</span></p>
                  <p className="trends-kpi-detail">{latestRow ? `Latest valid · ${formatManilaDateTime(new Date(latestRow.timestamp))} PHT` : 'No valid sensor reading in this period'}</p>
                </article>;
              })}
            </section>

            <section className="trends-context" aria-label="Trend chart context">
              <span>Safe bands use the configured thresholds.</span>
              <span>Overnight window 22:00–06:00 PHT</span>
              <span>Retention {tierConfig.retentionDays} days</span>
            </section>

            <section className="card glass trends-statistics-card">
              <div className="trends-section-heading"><h2 className="card-title">Range statistics</h2><p>Last {range === '24h' ? '24 hours' : range === '7d' ? '7 days' : range === 'cycle' ? 'full cycle' : 'custom range'} · {invalidReadings} invalid readings excluded</p></div>
              <div className="table-wrap"><table className="trends-statistics-table"><thead><tr>
                <th scope="col">Parameter</th><th scope="col">Latest</th><th scope="col">Min</th><th scope="col">Max</th><th scope="col">Mean</th><th scope="col">Std dev</th><th scope="col">Time in range</th><th scope="col">Excursions</th><th scope="col">Longest (h)</th><th scope="col">Safe range</th>
              </tr></thead><tbody>
                {parameters.map((parameter) => {
                  const stat = statistics.find((item) => item.parameter === parameter.key)!;
                  return <tr key={parameter.key}>
                    <th scope="row">{parameter.title} ({parameter.unit})</th><td className="table-numeric">{renderNumber(stat.latest)}</td><td className="table-numeric">{renderNumber(stat.minimum)}</td><td className="table-numeric">{renderNumber(stat.maximum)}</td><td className="table-numeric">{renderNumber(stat.mean)}</td><td className="table-numeric">{renderNumber(stat.standardDeviation)}</td><td className="table-numeric">{stat.percentInRange === null ? '—' : `${stat.percentInRange.toFixed(1)}%`}</td><td className="table-numeric">{stat.excursions}</td><td className="table-numeric">{stat.longestExcursionHours.toFixed(1)}</td><td>{parameter.safeMax === undefined ? `≥${parameter.safeMin} ${parameter.unit}` : `${parameter.safeMin}–${parameter.safeMax} ${parameter.unit}`}</td>
                  </tr>;
                })}
              </tbody></table></div>
            </section>

            <section className="trend-charts" aria-label="Water-quality charts">
              {parameters.map((parameter) => {
                const stat = statistics.find((item) => item.parameter === parameter.key)!;
                const plottedRows = prepareParameterRows(rows, parameter.key);
                const gaps = gapRanges(rows, parameter.key, from, to);
                const zoomSelection = chartZoom.key === chartZoomKey ? chartZoom.ranges[parameter.key] : undefined;
                const zoomStartIndex = zoomSelection ? Math.max(0, Math.min(zoomSelection.startIndex, plottedRows.length - 1)) : 0;
                const zoomEndIndex = zoomSelection ? Math.max(zoomStartIndex + 1, Math.min(zoomSelection.endIndex, plottedRows.length - 1)) : plottedRows.length - 1;
                const isZoomed = Boolean(zoomSelection && (zoomStartIndex > 0 || zoomEndIndex < plottedRows.length - 1));
                const canZoomIn = plottedRows.length > 2 && zoomEndIndex - zoomStartIndex > 2;
                const zoomFrom = isZoomed ? plottedRows[zoomStartIndex].timestamp : from;
                const zoomTo = isZoomed ? plottedRows[zoomEndIndex].timestamp : to;
                const zoomedRows = isZoomed
                  ? rows.filter((row) => Date.parse(row.timestamp) >= zoomFrom && Date.parse(row.timestamp) <= zoomTo)
                  : rows;
                const domain = trendYAxisDomain(parameter, zoomedRows);
                const bandMax = parameter.safeMax ?? domain[1];
                const outOfRange = validReadings(rows, parameter.key).filter((row) => !isInRange(metricValue(row, parameter.key), parameter));
                const parameterAlerts = alerts.filter((alert) => {
                  const name = alert.parameter.toLowerCase();
                  const matchesParameter = parameter.key === 'do'
                    ? name === 'do' || name.includes('oxygen')
                    : parameter.key === 'ph' ? name === 'ph' : name.includes('temperature');
                  const validValue = Number.isFinite(alert.value) &&
                    (parameter.key !== 'do' || alert.value > 0) &&
                    (parameter.key !== 'ph' || (alert.value >= 0 && alert.value <= 14));
                  return matchesParameter && validValue;
                });
                return <article className="card glass trend-chart-card" key={parameter.key}>
                  <header className="trend-chart-heading">
                    <div><h2 className="card-title">{parameter.title}</h2><p className="small muted">Safe range: {parameter.safeMax === undefined ? `≥${parameter.safeMin} ${parameter.unit}` : `${parameter.safeMin}–${parameter.safeMax} ${parameter.unit}`}</p></div>
                    <div className="trend-chart-actions">
                      <button type="button" className="button trends-chart-zoom-control" disabled={!canZoomIn} onClick={() => {
                        const nextSelection = adjustChartZoom(zoomSelection, plottedRows.length, 'in');
                        if (!nextSelection) return;
                        setChartZoom((current) => ({
                          key: chartZoomKey,
                          ranges: {
                            ...(current.key === chartZoomKey ? current.ranges : {}),
                            [parameter.key]: nextSelection,
                          },
                        }));
                      }}>Zoom in</button>
                      <button type="button" className="button trends-chart-zoom-control" disabled={!isZoomed} onClick={() => setChartZoom((current) => {
                        const nextSelection = adjustChartZoom(zoomSelection, plottedRows.length, 'out');
                        const ranges = { ...(current.key === chartZoomKey ? current.ranges : {}) };
                        if (nextSelection) ranges[parameter.key] = nextSelection;
                        else delete ranges[parameter.key];
                        return { key: chartZoomKey, ranges };
                      })}>Zoom out</button>
                      <button type="button" className="button trends-chart-zoom-reset" disabled={!isZoomed} onClick={() => setChartZoom((current) => ({
                        key: chartZoomKey,
                        ranges: current.key === chartZoomKey
                          ? Object.fromEntries(Object.entries(current.ranges).filter(([key]) => key !== parameter.key))
                          : {},
                      }))}>Reset zoom</button>
                    </div>
                  </header>
                  <div className="trend-chart-frame" id={`trend-chart-${parameter.key}`} role="img" aria-label={`${parameter.title} trend chart. Configured safe range ${parameter.safeMin}${parameter.safeMax === undefined ? ' and above' : ` to ${parameter.safeMax}`} ${parameter.unit}; overnight windows and sensor gaps highlighted.`}>
                    {rows.length === 0 ? <EmptyState>No readings are available for this range.</EmptyState> : <ResponsiveContainer>
                      <LineChart data={plottedRows} margin={{ top: 10, right: 12, bottom: 10, left: 0 }}>
                        <defs><pattern id={`gap-pattern-${parameter.key}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--glass-bg-strong)" fillOpacity="0.16" /><line x1="0" y1="0" x2="0" y2="7" stroke="var(--text-secondary)" strokeOpacity="0.65" strokeWidth="2" /></pattern></defs>
                        <CartesianGrid stroke="var(--control-border)" strokeDasharray="4 4" />
                        {nightWindows.map((item) => <ReferenceArea key={`night-${item.x1}`} x1={item.x1} x2={item.x2} fill="var(--chart-night)" fillOpacity={0.12} ifOverflow="hidden" />)}
                        <ReferenceArea y1={parameter.safeMin} y2={bandMax} ifOverflow="hidden" fill="var(--ok)" fillOpacity={0.09} />
                        {gaps.map((gap, index) => <ReferenceArea key={`gap-${index}`} x1={gap.x1} x2={gap.x2} fill={`url(#gap-pattern-${parameter.key})`} ifOverflow="hidden" />)}
                        <XAxis
                          dataKey="timestamp"
                          type="number"
                          scale="time"
                          domain={[zoomFrom, zoomTo]}
                          ticks={xTicks}
                          allowDataOverflow
                          stroke="var(--text-secondary)"
                          tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                          tickFormatter={(value: number) => range === '24h'
                            ? dateFormatter.format(new Date(value))
                            : new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(value))}
                        />
                        <YAxis domain={domain} allowDataOverflow width={48} stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'var(--glass-bg-strong)', border: '1px solid var(--control-border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }} labelStyle={{ color: 'var(--text-primary)' }} labelFormatter={(value) => `${formatManilaDateTime(new Date(Number(value)))} PHT`} formatter={(value) => [`${Number(value).toFixed(2)} ${parameter.unit}`, parameter.title]} />
                        <Line dataKey={parameter.key === 'do' ? 'doMgL' : parameter.key} name={parameter.title} stroke={parameter.color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                        {outOfRange.filter((row) => {
                          const value = metricValue(row, parameter.key);
                          return value >= domain[0] && value <= domain[1];
                        }).map((row) => <ReferenceDot key={`excursion-${row.id}`} x={Date.parse(row.timestamp)} y={metricValue(row, parameter.key)} r={4} fill="var(--warn-text)" stroke="var(--glass-bg-strong)" />)}
                        {parameterAlerts.map((alert: AlertItem) => <ReferenceDot key={alert.id} x={Date.parse(alert.createdAt)} y={alert.value} r={5} fill={alert.severity === 'critical' ? 'var(--critical-text)' : 'var(--warn-text)'} stroke="var(--glass-bg-strong)" />)}
                        <Brush
                          dataKey="timestamp"
                          height={20}
                          startIndex={zoomStartIndex}
                          endIndex={zoomEndIndex}
                          stroke="var(--accent)"
                          fill="var(--glass-bg-strong)"
                          travellerWidth={8}
                          onChange={(selection) => {
                            if (selection?.startIndex === undefined || selection.endIndex === undefined) return;
                            setChartZoom((current) => ({
                              key: chartZoomKey,
                              ranges: {
                                ...(current.key === chartZoomKey ? current.ranges : {}),
                                [parameter.key]: { startIndex: selection.startIndex, endIndex: selection.endIndex },
                              },
                            }));
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>}
                  </div>
                  <div className="trend-chart-stats" aria-label={`${parameter.title} chart statistics`}>
                    <div><span>Latest</span><strong>{renderNumber(stat.latest)} {parameter.unit}</strong></div>
                    <div><span>Min / max</span><strong>{renderNumber(stat.minimum)} / {renderNumber(stat.maximum)}</strong></div>
                    <div><span>Mean</span><strong>{renderNumber(stat.mean)}</strong></div>
                    <div><span>In range</span><strong>{stat.percentInRange === null ? '—' : `${stat.percentInRange.toFixed(1)}%`}</strong></div>
                  </div>
                  <div className="trend-card-legend"><span><i className="trend-line-key" style={{ background: parameter.color }} />{selectedTank?.name ?? 'Reading'}</span><span><i className="trend-safe-key" />Safe range</span><span><i className="trend-night-key" />Overnight</span><span><i className="trend-gap-key" />Offline gap</span><span><i className="trend-excursion-key" />Out of range</span></div>
                  <p className="trend-chart-caption">Use Zoom in/out for quick adjustments or drag the handles below for a specific time range. Safe bands use configured thresholds; missing readings are shown as gaps.</p>
                  {canExport && <div className="trends-inline-actions trends-download-actions">
                    <button type="button" className="icon-button trends-chart-export" aria-label={`Download ${parameter.title} PNG`} title={`Download ${parameter.title} PNG`} disabled={!rows.length} onClick={() => void exportChart(parameter.key)}><FileImage size={18} aria-hidden="true" /></button>
                    <button type="button" className="icon-button trends-csv-button" aria-label={`Download ${parameter.title} CSV`} title={`Download ${parameter.title} CSV`} disabled={!rows.length} onClick={() => exportCsv(parameter.key)}><FileSpreadsheet size={18} aria-hidden="true" /></button>
                  </div>}
                </article>;
              })}
              <article className="card glass trends-overnight-panel">
                <h2 className="card-title">Overnight vs daytime</h2>
                <p className="small muted">Mean valid readings · overnight 22:00–06:00 PHT</p>
                <div className="table-wrap"><table className="trends-overnight-table"><thead><tr><th scope="col">Parameter</th><th scope="col">Day mean</th><th scope="col">Night mean</th><th scope="col">Min</th><th scope="col">Change</th></tr></thead><tbody>
                  {parameters.map((parameter) => {
                    const values = validReadings(rows, parameter.key);
                    const dayValues = values.filter((row) => !inOvernightWindow(row.timestamp)).map((row) => metricValue(row, parameter.key));
                    const nightValues = values.filter((row) => inOvernightWindow(row.timestamp)).map((row) => metricValue(row, parameter.key));
                    const dayMean = average(dayValues);
                    const nightMean = average(nightValues);
                    return <tr key={parameter.key}><th scope="row">{parameter.title} ({parameter.unit})</th>
                      <td className="table-numeric">{renderNumber(dayMean)}</td>
                      <td className="table-numeric">{renderNumber(nightMean)}</td>
                      <td className="table-numeric">{renderNumber(values.length ? Math.min(...values.map((row) => metricValue(row, parameter.key))) : null)}</td>
                      <td className="table-numeric">{dayMean === null || nightMean === null ? '—' : renderNumber(nightMean - dayMean)}</td>
                    </tr>;
                  })}
                </tbody></table></div>
                <div className="trends-rearing">
                  <div className="trends-rearing-heading"><h3>Rearing day view</h3><span>Day {selectedTank ? getRaisingDay(selectedTank.rearingStartDate) : '—'} of 21</span></div>
                  <div className="trends-rearing-track" aria-label={`Rearing day ${selectedTank ? getRaisingDay(selectedTank.rearingStartDate) : 0} of 21`}>
                    {Array.from({ length: 21 }, (_, index) => <i key={index} className={selectedTank && index < getRaisingDay(selectedTank.rearingStartDate) ? 'is-complete' : ''} />)}
                  </div>
                  <div className="trends-rearing-labels"><span>Day 0</span><span>Day {selectedTank ? getRaisingDay(selectedTank.rearingStartDate) : '—'} today</span><span>Day 21 harvest window</span></div>
                  <p className="small muted">Switch the selected tank to compare its cycle against another rearing cycle.</p>
                </div>
              </article>
            </section>

            <section className="trends-secondary-grid">
              <article className="card glass trends-alert-frequency-card">
                <header className="trends-section-heading">
                  <div><h2 className="card-title">Alert frequency</h2><p>Alerts per day · selected range</p></div>
                  {canExport && <div className="trends-inline-actions"><button type="button" className="icon-button trends-chart-export" aria-label="Download alert frequency PNG" title="Download alert frequency PNG" disabled={!alertFrequency.length} onClick={() => void exportChart('alert-frequency')}><FileImage size={18} aria-hidden="true" /></button><button type="button" className="icon-button trends-chart-export" aria-label="Download alert frequency CSV" title="Download alert frequency CSV" disabled={!alertFrequency.length} onClick={exportAlertCsv}><FileSpreadsheet size={18} aria-hidden="true" /></button></div>}
                </header>
                {!alertFrequency.length ? <EmptyState>No alerts occurred in this range.</EmptyState> :
                  <><div className="trend-chart-frame trends-alert-frequency-chart" id="trend-chart-alert-frequency" role="img" aria-label="Daily warning and critical alert frequency chart">
                    <svg viewBox="0 0 400 180" preserveAspectRatio="none" aria-hidden="true">
                      {[30, 70, 110, 150].map((y) => <line key={y} x1="20" x2="396" y1={y} y2={y} stroke="var(--control-border)" strokeDasharray="4 4" />)}
                      {(() => {
                        const maximum = Math.max(1, ...alertFrequency.map((item) => item.warning + item.critical));
                        const slotWidth = 376 / alertFrequency.length;
                        const barWidth = Math.min(22, slotWidth * 0.55);
                        return alertFrequency.map((item, index) => {
                          const x = 20 + slotWidth * index + (slotWidth - barWidth) / 2;
                          const warningHeight = item.warning / maximum * 120;
                          const criticalHeight = item.critical / maximum * 120;
                          return <g key={item.date}>
                            <rect x={x} y={150 - warningHeight} width={barWidth} height={warningHeight} rx="2" fill="var(--warn-text)" />
                            <rect x={x} y={150 - warningHeight - criticalHeight} width={barWidth} height={criticalHeight} rx="2" fill="var(--critical-text)" />
                            <text x={x + barWidth / 2} y="169" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">{item.day}</text>
                          </g>;
                        });
                      })()}
                    </svg>
                  </div><div className="trend-card-legend"><span><i className="trend-warning-key" />Warnings</span><span><i className="trend-critical-key" />Critical</span></div></>}
              </article>
            </section>

            <p className="trends-footer-note">Temperature, dissolved oxygen and pH are sensor measurements.</p>
          </>
        )}
    </div>
  );
}
