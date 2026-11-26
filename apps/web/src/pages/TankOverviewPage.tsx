import { Plus, Signal, Wifi, WifiOff, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { can, formatManilaDateTime, getRaisingDay, isValidMeasurement, recentWifiSignal } from '@hydrosense/shared';
import type { AlertItem, Reading, Tank } from '@hydrosense/shared';
import { useNavigate } from 'react-router-dom';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { DATA_MODE, tierConfig } from '../app/config';
import { useSelectedTank } from '../app/tank/TankContext';
import { useDeviceStatuses } from '../app/data/hooks';
import { PageHeading } from '../components/common/PageHeading';
import { ConfirmActionDialog } from '../components/common/ConfirmActionDialog';
import { Select } from '../components/common/Select';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import { calculateTrendStatistics, countMissingSamples, prepareTrendRows, threeHourTicks } from '@hydrosense/shared';
import type { TrendParameter } from '@hydrosense/shared';

interface TankSummary {
  tank: Tank;
  reading: Reading | null;
  alerts: AlertItem[];
}

const dataQualityParameters: TrendParameter[] = [
  { key: 'temperature', title: 'Temperature', unit: '°C', safeMin: 26, safeMax: 30 },
  { key: 'do', title: 'DO', unit: 'mg/L', safeMin: 4 },
  { key: 'ph', title: 'pH', unit: 'pH', safeMin: 6, safeMax: 8 },
];

function wifiLabel(rssi: number) {
  if (rssi >= -55) return 'Strong';
  if (rssi >= -70) return 'Fair';
  return 'Weak';
}

function TankDataQuality({ tankId, tankName }: { tankId: string; tankName: string }) {
  const days = Math.min(21, tierConfig.retentionDays);
  const [period] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  const readingsQuery = useQuery({
    queryKey: ['tank-data-quality', tankId, period.from],
    queryFn: () => api.listReadings({ tankId, ...period }),
  });
  const { rows } = prepareTrendRows(readingsQuery.data ?? []);
  const qualityTicks = threeHourTicks(Date.parse(period.from), Date.parse(period.to));
  const qualitySlots = qualityTicks.map((tick) => {
    const reading = rows.reduce<Reading | undefined>((closest, row) => {
      const distance = Math.abs(Date.parse(row.timestamp) - tick);
      if (distance > 45 * 60 * 1000) return closest;
      return !closest || distance < Math.abs(Date.parse(closest.timestamp) - tick) ? row : closest;
    }, undefined);
    if (!reading) return { tick, status: 'missing' as const };
    if (!isValidMeasurement('temperature', reading.temperature) || !isValidMeasurement('do', reading.doMgL) || !isValidMeasurement('ph', reading.ph)) {
      return { tick, status: 'quality' as const };
    }
    return { tick, status: 'received' as const };
  });
  const expectedSamples = qualityTicks.length;
  const receivedSamples = qualitySlots.filter((slot) => slot.status !== 'missing').length;
  const receivedPercent = expectedSamples ? Math.round(receivedSamples / expectedSamples * 100) : 0;
  const statistics = dataQualityParameters.map((parameter) => calculateTrendStatistics(rows, parameter));
  const invalidReadings = statistics.reduce((total, stat) => total + stat.invalidReadings, 0);
  const missingSamples = countMissingSamples(rows);
  const latestReading = rows[rows.length - 1];

  return (
    <section className="card glass trends-quality-panel" aria-label="Data quality">
      <header className="trends-section-heading"><div><h2 className="card-title">Data Quality · {tankName}</h2><p>Last {days} days</p></div><span className="trends-quality-coverage">{receivedSamples} of {expectedSamples} sample slots · {receivedPercent}% coverage</span></header>
      {readingsQuery.isLoading ? <LoadingState /> : readingsQuery.isError ? <ErrorState error={readingsQuery.error} onRetry={() => void readingsQuery.refetch()} /> : <>
        <div className="trends-quality-slots" role="img" aria-label={`${receivedSamples} of ${expectedSamples} expected sample slots received`}>
          {qualitySlots.map((slot) => <span className={`trends-quality-slot is-${slot.status}`} key={slot.tick} title={`${formatManilaDateTime(new Date(slot.tick))}: ${slot.status}`} />)}
        </div>
        <div className="trends-quality-times"><span>{qualityTicks.length ? formatManilaDateTime(new Date(qualityTicks[0])) : '—'}</span><span>{qualityTicks.length ? formatManilaDateTime(new Date(qualityTicks[Math.floor(qualityTicks.length / 2)])) : '—'}</span><span>{qualityTicks.length ? formatManilaDateTime(new Date(qualityTicks[qualityTicks.length - 1])) : '—'}</span></div>
        <div className="trends-quality-metrics">
          <article><span>Readings received</span><strong>{receivedSamples} of {expectedSamples}</strong><small>{receivedPercent}% of expected sample windows</small></article>
          <article><span>Sensor / cell gaps</span><strong>{missingSamples}</strong><small>Missing sample windows</small></article>
          <article><span>Invalid readings excluded</span><strong>{invalidReadings}</strong><small>Measurements outside sensor limits</small></article>
          <article><span>Latest sample</span><strong>{latestReading ? formatManilaDateTime(new Date(latestReading.timestamp)) : '—'}</strong><small>Asia/Manila time</small></article>
        </div>
        <div className="trends-quality-legend"><span><i className="is-received" />Reading received</span><span><i className="is-quality" />Sensor / data quality gap</span><span><i className="is-missing" />No reading</span></div>
      </>}
    </section>
  );
}

export default function TankOverviewPage() {
  const { role, userName } = useRole();
  const { tankId, setTankId, tanks: visibleTanks } = useSelectedTank();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const devices = useDeviceStatuses();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [tankToRemove, setTankToRemove] = useState<Tank | null>(null);
  const query = useQuery({
    queryKey: ['tank-overview'],
    queryFn: async (): Promise<TankSummary[]> => {
      const tanks = await api.listTanks();
      return Promise.all(tanks.map(async (tank) => {
        const [reading, alerts] = await Promise.all([api.getLatestReading(tank.id), api.listAlerts(tank.id)]);
        return { tank, reading, alerts: alerts.filter((alert) => alert.status === 'open') };
      }));
    },
    refetchInterval: DATA_MODE === 'api' ? 30_000 : false,
  });
  const createTank = useMutation({
    mutationFn: ({ tank, changedBy }: { tank: Omit<Tank, 'id'>; changedBy: string }) => api.createTank(tank, changedBy),
    onSuccess: async (tank) => {
      setFormError('');
      setFormMessage(`${tank.name} registered and hardware ${tank.deviceId} linked. ${DATA_MODE === 'mock' ? 'Mock monitoring data is active.' : 'The device will appear online after its first heartbeat.'}`);
      setTankId(tank.id);
      setShowRegisterForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tank-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['tanks'] }),
        queryClient.invalidateQueries({ queryKey: ['device-status'] }),
        queryClient.invalidateQueries({ queryKey: ['latest-reading', tank.id] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
      ]);
    },
  });
  const deleteTank = useMutation({
    mutationFn: ({ tankId, changedBy }: { tankId: string; changedBy: string }) => api.deleteTank(tankId, changedBy),
    onSuccess: async () => {
      setFormError('');
      setFormMessage('Tank and its hardware association were removed.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tank-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['tanks'] }),
        queryClient.invalidateQueries({ queryKey: ['device-status'] }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
      ]);
    },
  });
  const canManageTanks = can(role, 'registerTank');
  const visibleDevices = (devices.data ?? []).filter((device) => visibleTanks.some((tank) => tank.deviceId === device.deviceId));
  const onlineCount = visibleDevices.filter((device) => device.online).length;
  const offlineCount = visibleDevices.length - onlineCount;
  const selectedTank = query.data?.find(({ tank }) => tank.id === tankId)?.tank;
  const filteredRows = (query.data ?? []).filter(({ tank, reading }) => {
    const searchText = `${tank.name} ${tank.deviceId} ${tank.site}`.toLocaleLowerCase();
    const device = devices.data?.find((item) => item.deviceId === tank.deviceId);
    const hasRecentReading = Boolean(reading && Date.now() - new Date(reading.timestamp).getTime() <= 15 * 60 * 1000);
    const online = Boolean(device?.online || hasRecentReading);
    return visibleTanks.some((item) => item.id === tank.id) && searchText.includes(search.trim().toLocaleLowerCase()) &&
      (statusFilter === 'all' || (statusFilter === 'online' ? online : Boolean(device && !device.online && !hasRecentReading)));
  });
  const submitTank = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFormMessage('');
    setFormError('');
    createTank.mutate({
      tank: {
        name: String(data.get('name')).trim(),
        site: String(data.get('site')).trim(),
        rearingStartDate: String(data.get('rearingStartDate')),
        deviceId: String(data.get('deviceId')).trim(),
      },
      changedBy: userName,
    }, { onError: (error) => setFormError(error.message) });
    event.currentTarget.reset();
  };
  const removeTank = () => {
    if (!tankToRemove) return;
    setFormMessage('');
    deleteTank.mutate({ tankId: tankToRemove.id, changedBy: userName }, {
      onError: (error) => setFormError(error.message),
      onSettled: () => setTankToRemove(null),
    });
  };

  return (
    <div className="stack">
      <PageHeading
        title="Tank Overview & System Health"
        description={`${visibleTanks.length} tanks in the selected hatchery · ${query.data?.length ?? 0} / ${tierConfig.nodeLimit} registered`}
        actions={<div className="tank-overview-heading-actions">
          {!devices.isLoading && !devices.isError && <span className="health-summary">{onlineCount} online · {offlineCount} offline</span>}
          {canManageTanks && <button type="button" className="button button-primary" aria-expanded={showRegisterForm} onClick={() => setShowRegisterForm((open) => !open)}>{showRegisterForm ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{showRegisterForm ? 'Cancel' : 'Register tank'}</button>}
        </div>}
      />
      <StaleQueryState updatedAt={query.dataUpdatedAt} />
      {devices.isError && <ErrorState error={devices.error} onRetry={() => void devices.refetch()} />}
      {canManageTanks && showRegisterForm && (
        <section className="card stack">
          <form className="stack tank-management-form" onSubmit={submitTank}>
            <div className="tank-management-header">
              <div className="tank-management-heading">
                <h2 className="card-title">Tank and Hardware Management</h2>
                <span className="small muted">{query.data?.length ?? 0} / {tierConfig.nodeLimit} tanks</span>
              </div>
              <button type="submit" className="button button-primary tank-submit" disabled={createTank.isPending || (query.data?.length ?? 0) >= tierConfig.nodeLimit}><Plus size={18} aria-hidden="true" />Register tank and link hardware</button>
            </div>
            <div className="grid tank-management-fields">
              <label className="field">Tank name<input name="name" required maxLength={80} placeholder="Larval Tank C" /></label>
              <label className="field">Hatchery / site<input name="site" required maxLength={120} placeholder="Hatchery name and location" /></label>
              <label className="field">Rearing start date<input name="rearingStartDate" type="date" required /></label>
              <label className="field">Monitoring hardware ID<input name="deviceId" required maxLength={80} placeholder="HS-MF-003" /></label>
            </div>
          </form>
          {(query.data?.length ?? 0) >= tierConfig.nodeLimit && <p className="small muted">The configured tier node limit has been reached.</p>}
          {formError && <p className="state-error" role="alert">{formError}</p>}
          {formMessage && <p role="status">{formMessage}</p>}
        </section>
      )}
      {query.isLoading || devices.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <EmptyState>No tanks are registered.</EmptyState> : (
        <>
          <div className="tank-overview-tools">
            <label className="field"><span className="sr-only">Search tanks</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tank or hardware ID" /></label>
            <label className="field"><span className="sr-only">Filter by connection status</span><Select value={statusFilter === 'all' ? '' : statusFilter} clearable placeholder="Status" onChange={(event) => setStatusFilter((event.target.value || 'all') as typeof statusFilter)}><option value="online">Online</option><option value="offline">Offline</option></Select></label>
          </div>
          <section className="card tank-overview-table-card" aria-label="Tank overview table">
            <div className="table-wrap">
              <table className="tank-overview-table">
                <thead><tr><th scope="col">Tank</th><th scope="col">Rearing day</th><th scope="col" className="table-numeric">Temp (°C)</th><th scope="col" className="table-numeric">Oxygen (mg/L)</th><th scope="col" className="table-numeric">pH</th><th scope="col" className="table-numeric">Open alerts</th><th scope="col">Last reading</th><th scope="col">Connection</th><th scope="col" title="Time the device most recently reported to the system">Last report</th><th scope="col">Wi-Fi</th><th scope="col" className="table-numeric">Pending sync</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {filteredRows.map(({ tank, reading, alerts }) => {
                    const device = devices.data?.find((item) => item.deviceId === tank.deviceId);
                    const signal = recentWifiSignal(device, now);
                    const hasRecentReading = Boolean(reading && Date.now() - new Date(reading.timestamp).getTime() <= 15 * 60 * 1000);
                    const online = Boolean(device?.online || hasRecentReading);
                    const deviceStatus = online ? 'Online' : device ? 'Offline' : 'Status unavailable';
                    const validStartDate = /^\d{4}-\d{2}-\d{2}$/.test(tank.rearingStartDate) && !Number.isNaN(Date.parse(`${tank.rearingStartDate}T00:00:00+08:00`));
                    const raisingDay = validStartDate ? getRaisingDay(tank.rearingStartDate) : null;
                    return <tr key={tank.id}>
                      <td><strong>{tank.name}</strong><span className="tank-overview-subtext">{tank.deviceId}</span></td>
                      <td>{raisingDay === null ? <span>Invalid rearing start date</span> : <span className="tank-day-progress"><i aria-hidden="true"><b style={{ width: `${raisingDay / 21 * 100}%` }} /></i>{raisingDay} / 21</span>}</td>
                      <td className="table-numeric">{reading ? isValidMeasurement('temperature', reading.temperature) ? reading.temperature.toFixed(1) : 'Check probe' : '—'}</td>
                      <td className="table-numeric">{reading ? isValidMeasurement('do', reading.doMgL) ? reading.doMgL.toFixed(1) : 'Check probe' : '—'}</td>
                      <td className="table-numeric">{reading ? isValidMeasurement('ph', reading.ph) ? reading.ph.toFixed(2) : 'Check probe' : '—'}</td>
                      <td className="table-numeric">{alerts.length}</td>
                      <td>{reading ? <><time dateTime={reading.timestamp}>{formatManilaDateTime(reading.timestamp)} PHT</time></> : '—'}</td>
                      <td><span className={`connection-pill ${online ? 'connection-online' : 'connection-offline'}`}>{online ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}{deviceStatus}</span></td>
                      <td>{device ? <time dateTime={device.lastSeen}>{formatManilaDateTime(device.lastSeen)} PHT</time> : '—'}</td>
                      <td>{signal !== null ? <span className="health-signal"><Signal size={16} aria-hidden="true" />{wifiLabel(signal)}, {signal} dBm</span> : 'Unavailable'}</td>
                      <td className="table-numeric">{device?.pendingSyncCount ?? '—'}</td>
                      <td><div className="tank-table-actions">
                        <button type="button" className="button" onClick={() => { setTankId(tank.id); navigate('/'); }}>Open</button>
                        {can(role, 'removeTank') && <button className="button button-danger" type="button" disabled={deleteTank.isPending || query.data.length <= 1} title={query.data.length <= 1 ? 'At least one tank must remain registered.' : undefined} onClick={() => setTankToRemove(tank)}>Remove</button>}
                      </div></td>
                    </tr>;
                  })}
                  {filteredRows.length === 0 && <tr><td colSpan={12} className="tank-overview-empty">No tanks match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          {selectedTank && <TankDataQuality tankId={selectedTank.id} tankName={selectedTank.name} />}
        </>
      )}
      {tankToRemove && <ConfirmActionDialog
        title="Remove tank?"
        message={`Are you sure you want to remove ${tankToRemove.name} and unlink hardware ${tankToRemove.deviceId}? This cannot be undone.`}
        confirmLabel="Remove tank"
        disabled={deleteTank.isPending}
        onCancel={() => setTankToRemove(null)}
        onConfirm={removeTank}
      />}
    </div>
  );
}
