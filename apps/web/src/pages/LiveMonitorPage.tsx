import { AlertTriangle, CheckCircle2, Clock3, Wifi, WifiOff } from 'lucide-react';
import { formatManilaDateTime, getReadingStatuses, isValidMeasurement, readingAge, readingFreshness } from '@hydrosense/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useDeviceStatuses, useLatestReading, useTanks } from '../app/data/hooks';
import { useSelectedTank } from '../app/tank/TankContext';
import { ReadingCard } from '../components/readings/ReadingCard';
import { StatusBadge } from '../components/readings/StatusBadge';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState, StaleState } from '../components/common/States';

export default function LiveMonitorPage() {
  const { tankId, setTankId, tanks: visibleTanks } = useSelectedTank();
  const { userName } = useRole();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const tanks = useTanks();
  const tank = tanks.data?.find((item) => item.id === tankId);
  const reading = useLatestReading(tankId);
  const alerts = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const devices = useDeviceStatuses();
  const thresholds = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const device = devices.data?.find((item) => item.deviceId === tank?.deviceId);
  const deviceOnline = Boolean(device?.online);
  const freshness = reading.data ? readingFreshness(reading.data.timestamp, device?.online, now) : null;
  const invalidReading = reading.data && (['temperature', 'do', 'ph'] as const).some((parameter) =>
    !isValidMeasurement(parameter, parameter === 'do' ? reading.data!.doMgL : reading.data![parameter]));
  const recentAlerts = [...(alerts.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
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
      {tanks.isLoading || reading.isLoading || thresholds.isLoading ? <LoadingState /> :
      tanks.isError ? <ErrorState error={tanks.error} onRetry={() => void tanks.refetch()} /> :
      reading.isError ? <ErrorState error={reading.error} onRetry={() => void reading.refetch()} /> :
      thresholds.isError ? <ErrorState error={thresholds.error} onRetry={() => void thresholds.refetch()} /> :
      !tank || !reading.data ? <EmptyState>No tank or reading is available. Check the tank selector and device status.</EmptyState> : <>
      {reading.dataUpdatedAt && Date.now() - reading.dataUpdatedAt > 3 * 3_600_000 && <StaleState updatedAt={reading.dataUpdatedAt} />}
      {freshness?.stale && <section className="offline-banner" role="status">
        <div><strong>Offline, last reading {readingAge(freshness.ageMs)}.</strong><span> Showing the last readings received {formatManilaDateTime(reading.data.timestamp)} PHT.</span></div>
        <Link to="/tanks">Tank &amp; device health</Link>
      </section>}
      <section className={`card live-status-banner live-status-${freshness?.stale ? 'offline' : invalidReading ? 'warning' : overallLevel}`} aria-label="Current reading status">
        {!freshness?.stale && !invalidReading && overallLevel === 'normal' ? <CheckCircle2 size={24} aria-hidden="true" /> : <AlertTriangle size={24} aria-hidden="true" />}
        <div><h2>{freshness?.stale ? 'Reading status unavailable while offline' : invalidReading ? 'Check probe: invalid sensor reading' : `${tank.name} ${overallLevel === 'normal' ? 'readings are within the configured ranges' : 'has readings that need attention'}`}</h2><p>{freshness?.stale ? `Last reading ${readingAge(freshness.ageMs)}.` : invalidReading ? 'Invalid readings are excluded from analysis.' : overallLevel === 'normal' ? 'Temperature, dissolved oxygen and pH are normal.' : 'Review the measured readings and their status below.'}</p></div>
        <div className="live-status-actions"><Link className="button button-primary" to="/entries">Activity Logs</Link><Link className="button" to="/trends">View trends</Link></div>
      </section>
      <section className="live-section" aria-labelledby="live-readings-title">
        <div className="live-section-heading">
          <div><h2 id="live-readings-title">Current water quality</h2><p>Latest measured readings for the selected tank</p></div>
        </div>
        <div className="readings-grid" aria-label="Current measured water quality">
          <ReadingCard parameter="temperature" reading={reading.data} threshold={thresholds.data?.find((item) => item.parameter === 'temperature')} showRangeMeter showUpdatedTimestamp={false} stale={freshness?.stale} />
          <ReadingCard parameter="do" reading={reading.data} threshold={thresholds.data?.find((item) => item.parameter === 'do')} showRangeMeter showUpdatedTimestamp={false} stale={freshness?.stale} />
          <ReadingCard parameter="ph" reading={reading.data} threshold={thresholds.data?.find((item) => item.parameter === 'ph')} showRangeMeter showUpdatedTimestamp={false} stale={freshness?.stale} />
        </div>
      </section>
      <div className="live-overview-grid">
      <section className="card live-panel" aria-labelledby="live-device-title">
        <div className="live-section-heading"><div><h2 id="live-device-title">Device connection</h2><p>{tank.deviceId} · sampled every 3 hours</p></div></div>
        {devices.isLoading ? <LoadingState label="Loading device status" /> : devices.isError ? <ErrorState error={devices.error} onRetry={() => void devices.refetch()} /> : device ? (
          <div className="live-device-metrics">
            <div><span>Connection</span><strong className={deviceOnline ? 'status-online' : 'status-offline'}>{deviceOnline ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}{deviceOnline ? 'Online' : 'Offline'}</strong></div>
            <div><span>Wi-Fi</span><strong>{device.wifiRssi} dBm</strong></div>
            <div><span>Last report</span><strong className="live-device-time">{formatManilaDateTime(device.lastSeen)} PHT</strong></div>
            <div><span>Pending sync</span><strong>{device.pendingSyncCount}</strong></div>
          </div>
        ) : <EmptyState>No device is assigned to this tank.</EmptyState>}
      </section>
      <section className="card live-panel" aria-labelledby="live-alerts-title">
        <div className="live-section-heading">
          <div><h2 id="live-alerts-title">Recent alerts</h2><p>Latest events for the selected tank</p></div>
          <Link to="/alerts">View all</Link>
        </div>
        {alerts.isLoading ? <LoadingState label="Loading recent alerts" /> : alerts.isError ? <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} /> : recentAlerts.length ? (
          <div className="live-alert-list">{recentAlerts.map((alert) => (
            <article className="live-alert-row" key={alert.id}>
              <StatusBadge level={alert.severity === 'critical' ? 'critical' : 'warning'} label={alert.severity} />
              <span className="live-alert-summary">{alert.parameter} · {alert.value} · {alert.threshold}</span>
              <time className="small muted" dateTime={alert.createdAt}>{formatManilaDateTime(alert.createdAt)} PHT</time>
            </article>
          ))}</div>
        ) : <EmptyState>No alerts are recorded for this tank.</EmptyState>}
      </section>
      </div>
      </>}
    </div>
  );
}
