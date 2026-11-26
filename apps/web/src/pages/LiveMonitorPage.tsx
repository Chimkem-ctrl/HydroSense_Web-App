import { AlertTriangle, CheckCircle2, Clock3, Wifi, WifiOff } from 'lucide-react';
import { formatManilaDateTime, formatMeasuredParameterLabel, getReadingStatuses, isValidMeasurement, readingAge, readingFreshness, recentWifiSignal } from '@hydrosense/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../app/api';
import { DATA_MODE } from '../app/config';
import { useRole } from '../app/auth/RoleContext';
import { useDeviceStatuses, useLatestReading, useTanks } from '../app/data/hooks';
import { useSelectedTank } from '../app/tank/TankContext';
import { ReadingCard } from '../components/readings/ReadingCard';
import { StatusBadge } from '../components/readings/StatusBadge';
import { Esp32Setup } from '../components/readings/Esp32Setup';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState, StaleState } from '../components/common/States';

export default function LiveMonitorPage() {
  const { tankId, setTankId, tanks: visibleTanks } = useSelectedTank();
  const { userName } = useRole();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const tanks = useTanks();
  const tank = tanks.data?.find((item) => item.id === tankId);
  const reading = useLatestReading(tankId);
  const alerts = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId), refetchInterval: DATA_MODE === 'api' ? 5_000 : false });
  const devices = useDeviceStatuses();
  const thresholds = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const device = devices.data?.find((item) => item.deviceId === tank?.deviceId);
  const deviceOnline = device?.online === true;
  const connectionStatus = typeof device?.online === 'boolean' ? deviceOnline ? 'Online' : 'Offline' : 'Unavailable';
  const signal = recentWifiSignal(device, now);
  const wifiSignal = signal === null ? 'Unavailable' : `${signal} dBm`;
  const lastReport = device?.lastSeen && Number.isFinite(Date.parse(device.lastSeen)) ? `${formatManilaDateTime(device.lastSeen)} PHT` : 'Unavailable';
  const pendingSync = device?.reportedFields?.includes('pendingSyncCount') && Number.isFinite(device.pendingSyncCount) ? `${device.pendingSyncCount}` : device?.storageAvailable === false ? 'SD unavailable' : 'Unavailable';
  const freshness = reading.data ? readingFreshness(reading.data.timestamp, device?.online, now) : null;
  const invalidReading = reading.data && (['temperature', 'do', 'ph'] as const).some((parameter) =>
    !isValidMeasurement(parameter, parameter === 'do' ? reading.data!.doMgL : reading.data![parameter]));
  const recentAlerts = [...(alerts.data ?? [])].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 4);
  const readingStatuses = reading.data && thresholds.data ? Object.values(getReadingStatuses(reading.data, thresholds.data)) : [];
  const overallLevel = readingStatuses.some((status) => status.level === 'critical') ? 'critical'
    : readingStatuses.some((status) => status.level === 'warning') ? 'warning' : 'normal';

  return (
    <div className="stack live-screen">
      <p className="live-greeting">Welcome, {userName}</p>
      <PageHeading
        title="Live Monitor"
        description={tank ? tank.site : 'Current water quality and device status'}
        actions={reading.data ? <span className="live-update"><Clock3 size={15} aria-hidden="true" /> Last reading {formatManilaDateTime(reading.data.timestamp)} PHT</span> : undefined}
      />
      {visibleTanks.length > 0 && <div className="live-tank-switcher" role="group" aria-label="Select tank">
        {visibleTanks.map((item) => <button key={item.id} type="button" className="button live-tank-button" aria-pressed={tankId === item.id} onClick={() => setTankId(item.id)}>{item.name}</button>)}
      </div>}
      {tanks.isLoading ? <LoadingState /> :
      tanks.isError ? <ErrorState error={tanks.error} onRetry={() => void tanks.refetch()} /> :
      !tank ? <EmptyState>No tank or reading is available. Check the tank selector and device status.</EmptyState> :
      reading.isLoading || thresholds.isLoading ? <LoadingState /> :
      reading.isError ? <ErrorState error={reading.error} onRetry={() => void reading.refetch()} /> :
      thresholds.isError ? <ErrorState error={thresholds.error} onRetry={() => void thresholds.refetch()} /> :
      !reading.data ? <EmptyState>No reading is available for this tank.</EmptyState> : <>
      {reading.dataUpdatedAt && Date.now() - reading.dataUpdatedAt > 3 * 3_600_000 && <StaleState updatedAt={reading.dataUpdatedAt} />}
      <section className={`card live-status-banner live-status-${freshness?.stale ? 'offline' : invalidReading ? 'warning' : overallLevel}`} aria-label="Current reading status">
        <div className="live-status-copy">
          {!freshness?.stale && !invalidReading && overallLevel === 'normal' ? <CheckCircle2 size={24} aria-hidden="true" /> : <AlertTriangle size={24} aria-hidden="true" />}
          <div><h2>{freshness?.stale ? 'Reading status unavailable while offline' : invalidReading ? 'Check probe: invalid sensor reading' : `${tank.name} ${overallLevel === 'normal' ? 'readings are within the configured ranges' : 'has readings that need attention'}`}</h2><p>{freshness?.stale ? `Last reading ${readingAge(freshness.ageMs)}.` : invalidReading ? 'Invalid readings are excluded from analysis.' : overallLevel === 'normal' ? 'Temperature, dissolved oxygen and pH are normal.' : 'Review the measured readings and their status below.'}</p></div>
        </div>
        <div className="live-status-actions"><Link className="button button-primary button-soft-action" to="/entries">Activity Logs</Link><Link className="button" to="/trends">View trends</Link></div>
      </section>
      {freshness?.stale && <section className="offline-banner" role="status">
        <div><strong>Offline, last reading {readingAge(freshness.ageMs)}.</strong><span> Showing the last readings received {formatManilaDateTime(reading.data.timestamp)} PHT.</span></div>
        <Link to="/tanks">Tank &amp; device health</Link>
      </section>}
      <section className="live-section" aria-labelledby="live-readings-title">
        <div className="live-section-heading">
          <div><h2 id="live-readings-title">Current Water Quality</h2><p>Latest measured readings for the selected tank</p></div>
        </div>
        <div className="readings-grid" aria-label="Current measured water quality">
          <ReadingCard parameter="temperature" reading={reading.data} threshold={thresholds.data?.find((item) => item.parameter === 'temperature')} showRangeMeter showUpdatedTimestamp={false} stale={freshness?.stale} />
          <ReadingCard parameter="do" reading={reading.data} threshold={thresholds.data?.find((item) => item.parameter === 'do')} showRangeMeter showUpdatedTimestamp={false} stale={freshness?.stale} />
          <ReadingCard parameter="ph" reading={reading.data} threshold={thresholds.data?.find((item) => item.parameter === 'ph')} showRangeMeter showUpdatedTimestamp={false} stale={freshness?.stale} />
        </div>
      </section>
      </>}
      {tank && <div className="live-overview-grid">
      <section className="card live-panel" aria-labelledby="live-device-title">
        <div className="live-section-heading"><div><h2 id="live-device-title">Device Connection</h2><p>{tank.deviceId || 'Device ID unavailable'}</p></div></div>
        {devices.isLoading ? <LoadingState label="Loading device status" /> : devices.isError ? <ErrorState error={devices.error} onRetry={() => void devices.refetch()} /> : device ? (
          <div className="live-device-metrics">
            <div><span>Connection</span><strong className={connectionStatus === 'Unavailable' ? undefined : deviceOnline ? 'status-online' : 'status-offline'}>{connectionStatus === 'Unavailable' ? null : deviceOnline ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}{connectionStatus}</strong></div>
            <div><span>Wi-Fi</span><strong>{wifiSignal}</strong></div>
            <div><span>Last report</span><strong className="live-device-time">{lastReport}</strong></div>
            <div><span>Pending sync</span><strong>{pendingSync}</strong></div>
          </div>
        ) : <EmptyState>{tank.deviceId ? 'Waiting for the device to report.' : 'No device is assigned to this tank.'}</EmptyState>}
      </section>
      <section className="card live-panel" aria-labelledby="live-alerts-title">
        <div className="live-section-heading">
          <div><h2 id="live-alerts-title">Recent Alerts</h2><p>Latest events for the selected tank</p></div>
          <Link to="/alerts">View all</Link>
        </div>
        {alerts.isLoading ? <LoadingState label="Loading recent alerts" /> : alerts.isError ? <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} /> : recentAlerts.length ? (
          <div className="live-alert-list">{recentAlerts.map((alert) => (
            <article className="live-alert-row" key={alert.id}>
              <StatusBadge level={alert.severity === 'critical' ? 'critical' : 'warning'} label={alert.severity ?? 'Unknown'} />
              <span className="live-alert-summary">{alert.parameter ? formatMeasuredParameterLabel(alert.parameter) : 'Unknown parameter'} · {alert.value ?? '—'} · {alert.threshold ?? '—'}</span>
              <time className="small muted" dateTime={typeof alert.createdAt === 'string' ? alert.createdAt : undefined}>{alert.createdAt && Number.isFinite(Date.parse(alert.createdAt)) ? `${formatManilaDateTime(alert.createdAt)} PHT` : 'Unavailable time'}</time>
            </article>
          ))}</div>
        ) : <EmptyState>No alerts are recorded for this tank.</EmptyState>}
      </section>
      </div>}
      <Esp32Setup deviceId={tank?.deviceId} />
    </div>
  );
}
