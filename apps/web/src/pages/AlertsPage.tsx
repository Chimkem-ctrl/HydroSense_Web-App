import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { can, formatManilaDateTime, resolveAlertWithActivityLog, validateAcknowledgeNote } from '@hydrosense/shared';
import type { AlertItem } from '@hydrosense/shared';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useSelectedTank } from '../app/tank/TankContext';
import { usePendingRequests, useTanks } from '../app/data/hooks';
import { PageHeading } from '../components/common/PageHeading';
import { Select } from '../components/common/Select';
import { StatusBadge } from '../components/readings/StatusBadge';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';

type AlertTab = AlertItem['status'];
type AlertPeriod = '7d' | '30d' | 'all';
const tabs: Array<{ key: AlertTab; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'resolved', label: 'Resolved' },
];

function parameterName(parameter: string) {
  const normalized = parameter.toLowerCase();
  if (normalized === 'do' || normalized.includes('oxygen')) return 'Dissolved oxygen';
  if (normalized === 'ph') return 'pH';
  if (normalized.includes('temperature')) return 'Temperature';
  return parameter;
}

function parameterUnit(parameter: string) {
  const name = parameterName(parameter);
  return name === 'Temperature' ? '°C' : name === 'Dissolved oxygen' ? 'mg/L' : name === 'pH' ? 'pH' : '';
}

function getPaginationItems(pageCount: number, currentPage: number): Array<number | 'ellipsis'> {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index);
  if (currentPage <= 2) return [0, 1, 2, 3, 'ellipsis', pageCount - 1];
  if (currentPage >= pageCount - 3) return [0, 'ellipsis', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1];
  return [0, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', pageCount - 1];
}

export default function AlertsPage() {
  const { role, userName } = useRole();
  const { tankId } = useSelectedTank();
  const tanks = useTanks();
  const pendingRequests = usePendingRequests();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AlertTab>('open');
  const [severity, setSeverity] = useState<'all' | AlertItem['severity']>('all');
  const [period, setPeriod] = useState<AlertPeriod>('7d');
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [resolveDialog, setResolveDialog] = useState(false);
  const [alertsPage, setAlertsPage] = useState(0);
  const [alertsPageSize, setAlertsPageSize] = useState(10);
  const query = useQuery({ queryKey: ['alerts', tankId], queryFn: () => api.listAlerts(tankId), enabled: Boolean(tankId) });
  const responses = useQuery({
    queryKey: ['alert-responses', selected?.id],
    queryFn: () => api.listAlertResponses(selected!.id),
    enabled: Boolean(selected),
  });
  const mutation = useMutation({
    mutationFn: async ({ alertId, resolve }: { alertId: string; resolve: boolean }) => {
      const input = { note: note.trim(), user: userName };
      if (!resolve) return { alert: await api.acknowledgeAlert(alertId, input), activityError: null };
      return resolveAlertWithActivityLog(api, alertId, input);
    },
    onSuccess: async (result) => {
      setActivityError(result.activityError ?? '');
      setSelected(null);
      setNote('');
      setResolveDialog(false);
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      await queryClient.invalidateQueries({ queryKey: ['alert-responses'] });
      await queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: async (_error, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      await queryClient.invalidateQueries({ queryKey: ['alert-responses'] });
      const current = queryClient.getQueryData<AlertItem[]>(['alerts', tankId])?.find((alert) => alert.id === variables.alertId);
      if (current) setSelected(current);
    },
  });
  const rangeStart = period === 'all' ? Number.NEGATIVE_INFINITY : Date.now() - (period === '7d' ? 7 : 30) * 86_400_000;
  const rangeAlerts = (query.data ?? []).filter((alert) => {
    const createdAt = Date.parse(alert.createdAt);
    return createdAt >= rangeStart;
  });
  const items = rangeAlerts
    .filter((alert) => alert.status === tab &&
      (severity === 'all' || alert.severity === severity))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const statusCounts = rangeAlerts.reduce<Record<AlertTab, number>>((counts, alert) => {
    counts[alert.status] += 1;
    return counts;
  }, { open: 0, acknowledged: 0, resolved: 0 });
  const acknowledgementTimes = rangeAlerts
    .filter((alert) => alert.acknowledgedAt)
    .map((alert) => Math.max(0, (Date.parse(alert.acknowledgedAt!) - Date.parse(alert.createdAt)) / 60_000))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const medianAcknowledgement = acknowledgementTimes.length
    ? Math.round((acknowledgementTimes[Math.floor((acknowledgementTimes.length - 1) / 2)] + acknowledgementTimes[Math.floor(acknowledgementTimes.length / 2)]) / 2)
    : null;
  const latestAcknowledgement = rangeAlerts
    .filter((alert) => alert.acknowledgedAt)
    .sort((left, right) => right.acknowledgedAt!.localeCompare(left.acknowledgedAt!))[0];
  const alertsPageCount = Math.max(1, Math.ceil(items.length / alertsPageSize));
  const currentAlertsPage = Math.min(alertsPage, alertsPageCount - 1);
  const alertPaginationItems = getPaginationItems(alertsPageCount, currentAlertsPage);
  const visibleAlerts = items.slice(currentAlertsPage * alertsPageSize, (currentAlertsPage + 1) * alertsPageSize);
  const tankNames = new Map((tanks.data ?? []).map((tank) => [tank.id, tank.name]));

  useEffect(() => {
    setAlertsPage(0);
  }, [period, severity, tab, tankId]);

  useEffect(() => {
    if (!selected) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setResolveDialog(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  function submitResponse(resolve: boolean) {
    const issues = resolve || note.trim() ? validateAcknowledgeNote(note) : [];
    if (issues.length) { setFormError(issues[0].message); return; }
    if (!selected) return;
    setFormError('');
    mutation.mutate({ alertId: selected.id, resolve });
  }

  return (
    <div className="stack alerts-screen">
      <PageHeading title="Alerts Center" description={`Review alerts, record notes, and check response history for ${tankNames.get(tankId) ?? 'the selected tank'}.`} />
      {activityError && <p className="state-error" role="alert">The alert was resolved, but its activity log could not be saved: {activityError}</p>}
      <StaleQueryState updatedAt={query.dataUpdatedAt} />
      {role === 'admin' && tab === 'open' && (pendingRequests.isLoading || pendingRequests.isError || Boolean(pendingRequests.data?.length)) && (
        <section className="card stack account-requests-card" aria-label="Pending account requests">
          <h2 className="card-title">Pending account requests</h2>
          {pendingRequests.isLoading ? <LoadingState label="Loading account requests" /> : pendingRequests.isError ? <ErrorState error={pendingRequests.error} onRetry={() => void pendingRequests.refetch()} /> : pendingRequests.data?.map((request) => (
            <div className="account-request-alert" key={request.id}>
              <UserRound size={18} aria-hidden="true" />
              <div>
                <strong>New account request: {request.firstName} {request.lastName}</strong>
                <p className="small muted">Submitted {formatManilaDateTime(request.createdAt)} PHT</p>
              </div>
            </div>
          ))}
          {!pendingRequests.isLoading && !pendingRequests.isError && <Link className="button" to="/admin/users">Review account requests</Link>}
        </section>
      )}
      {!query.isLoading && !query.isError && <section className={`alerts-status-banner ${statusCounts.open ? 'has-open-alerts' : 'no-open-alerts'}`} role="status">
        <strong>{statusCounts.open ? `${statusCounts.open} open alert${statusCounts.open === 1 ? '' : 's'} need attention.` : 'No open alerts.'}</strong>
        <span>{statusCounts.open
          ? 'Review open alerts and record an acknowledgement.'
          : latestAcknowledgement ? `The last alert was acknowledged ${formatManilaDateTime(new Date(latestAcknowledgement.acknowledgedAt!))} PHT.` : 'No alerts have been acknowledged in this period.'}</span>
      </section>}
      {query.isSuccess && <section className="alerts-summary-grid" aria-label="Alert summary">
        <article className="card glass alerts-summary-card"><span>Open</span><strong>{statusCounts.open}</strong><small>{statusCounts.open ? 'Needs attention' : 'Nothing needs action'}</small></article>
        <article className="card glass alerts-summary-card"><span>Acknowledged</span><strong>{statusCounts.acknowledged}</strong><small>Awaiting resolution or closed</small></article>
        <article className="card glass alerts-summary-card"><span>Resolved</span><strong>{statusCounts.resolved}</strong><small>Closed with a note</small></article>
        <article className="card glass alerts-summary-card"><span>Median time to acknowledge</span><strong>{medianAcknowledgement === null ? '—' : `${medianAcknowledgement} min`}</strong><small>{acknowledgementTimes.length ? `Based on ${acknowledgementTimes.length} acknowledged alert${acknowledgementTimes.length === 1 ? '' : 's'}` : 'No acknowledgement data'}</small></article>
      </section>}
      <section className="card glass alerts-history-card" aria-labelledby="alerts-history-title">
        <header className="trends-section-heading">
          <div>
            <h2 id="alerts-history-title" className="card-title">Alert history</h2>
            <p>{tankNames.get(tankId) ?? 'Selected tank'} · {period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'All dates'}</p>
          </div>
          <span className="alerts-history-count">Showing {items.length} alert{items.length === 1 ? '' : 's'}</span>
        </header>
        <div className="alerts-history-toolbar">
          <div className="tabs alerts-status-tabs" role="tablist" aria-label="Alert status">
            {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className="tab" onClick={() => { setTab(item.key); setSelected(null); }}>{item.label} ({statusCounts[item.key]})</button>)}
          </div>
          <div className="alerts-filter-row">
            <label className="field alerts-severity-filter"><span className="sr-only">Severity</span>
              <Select value={severity === 'all' ? '' : severity} clearable placeholder="Severity" onChange={(event) => { setSeverity((event.target.value || 'all') as typeof severity); setSelected(null); }}>

                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
              </Select>
            </label>
            <label className="field alerts-period-filter"><span className="sr-only">Date range</span>
              <Select value={period === 'all' ? '' : period} clearable placeholder="Date range" onChange={(event) => { setPeriod((event.target.value || 'all') as AlertPeriod); setSelected(null); }}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>

              </Select>
            </label>
          </div>
        </div>
        {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length === 0 ? <EmptyState>
          {!rangeAlerts.length ? 'No alerts occurred in this range.' : `No ${severity === 'all' ? '' : `${severity} `}${tab} alerts match these filters.`}
        </EmptyState> : (
          <>
            <div className="table-wrap alerts-history-table-wrap">
              <table className="trends-alert-table alerts-history-table">
                <thead><tr><th scope="col">Date and time (PHT)</th><th scope="col">pH</th><th scope="col">DO</th><th scope="col">Temp</th><th scope="col">Severity</th><th scope="col">Acknowledged by</th><th scope="col">Note</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{visibleAlerts.map((alert) => {
                  const parameter = parameterName(alert.parameter);
                  return (
                    <tr key={alert.id}>
                      <td><time dateTime={alert.createdAt}>{formatManilaDateTime(new Date(alert.createdAt))}</time></td>
                      <td>{parameter === 'pH' ? `${alert.value} pH` : '—'}</td>
                      <td>{parameter === 'Dissolved oxygen' ? `${alert.value} mg/L` : '—'}</td>
                      <td>{parameter === 'Temperature' ? `${alert.value} °C` : '—'}</td>
                      <td><StatusBadge level={alert.severity === 'critical' ? 'critical' : 'warning'} label={alert.severity} /></td>
                      <td>{alert.acknowledgedBy ?? '—'}</td>
                      <td>{alert.note ?? '—'}</td>
                      <td><button type="button" className="button" onClick={() => { setSelected(alert); setNote(''); setFormError(''); setResolveDialog(false); }}>View</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className="trends-alert-pagination">
              <div className="trends-alert-pagination-info">
                <span>Page {currentAlertsPage + 1} of {alertsPageCount} · {items.length} alerts</span>
                <label htmlFor="alerts-page-size">Rows per page</label>
                <Select id="alerts-page-size" value={alertsPageSize} onChange={(event) => { setAlertsPageSize(Number(event.target.value)); setAlertsPage(0); }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </Select>
              </div>
              <nav className="trends-alert-page-buttons" aria-label="Alert history pages">
                <button className="button" type="button" disabled={currentAlertsPage === 0} onClick={() => setAlertsPage((page) => Math.max(0, page - 1))}>‹ Previous</button>
                {alertPaginationItems.map((item, index) => item === 'ellipsis'
                  ? <span className="trends-alert-page-ellipsis" key={`ellipsis-${index}`} aria-hidden="true">…</span>
                  : <button className="button" type="button" key={item} aria-label={`Page ${item + 1}`} aria-current={item === currentAlertsPage ? 'page' : undefined} onClick={() => setAlertsPage(item)}>{item + 1}</button>)}
                <button className="button" type="button" disabled={currentAlertsPage >= alertsPageCount - 1} onClick={() => setAlertsPage((page) => Math.min(alertsPageCount - 1, page + 1))}>Next ›</button>
              </nav>
            </div>
          </>
        )}
      </section>
      {selected && (
        <div className="dialog-backdrop alerts-response-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelected(null); setResolveDialog(false); } }}>
          <section className="dialog card stack alerts-response-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-response-title">
            <header className="alerts-response-heading">
              <div><h2 id="alert-response-title" className="card-title">Response history</h2><p>{parameterName(selected.parameter)} alert · {formatManilaDateTime(new Date(selected.createdAt))} PHT · {tankNames.get(selected.tankId) ?? 'Unknown tank'}</p></div>
              <div className="alerts-response-actions">
                {selected.status === 'acknowledged' && can(role, 'resolveAlert') && <button type="button" className="button button-primary" onClick={() => { setResolveDialog(true); setNote(''); setFormError(''); }}>Resolve alert</button>}
                <button type="button" className="button" onClick={() => { setSelected(null); setResolveDialog(false); }}>Close history</button>
              </div>
            </header>
            {responses.isLoading ? <LoadingState label="Loading response history" /> : responses.isError ? <ErrorState error={responses.error} onRetry={() => void responses.refetch()} /> : <ol className="alerts-response-timeline">
              <li><time dateTime={selected.createdAt}>{formatManilaDateTime(new Date(selected.createdAt))} PHT</time><div><strong>Alert raised</strong><p>{selected.value} {parameterUnit(selected.parameter)}, {selected.threshold}</p></div></li>
              {(responses.data ?? []).map((response) => <li key={response.id}><time dateTime={response.createdAt}>{formatManilaDateTime(new Date(response.createdAt))} PHT</time><div><strong>{response.status === 'acknowledged' ? `Acknowledged by ${response.createdBy}` : response.status === 'resolved' ? `Resolved by ${response.createdBy}` : 'Alert raised'}</strong>{response.note && <p>Note: {response.note}</p>}</div></li>)}
              {responses.data?.length === 0 && selected.status !== 'open' && <li><div><strong>{selected.status === 'resolved' ? 'Resolved' : 'Acknowledged'}</strong><p>{selected.note ?? 'No response note was recorded.'}</p></div></li>}
            </ol>}
            {selected.status === 'open' && <label className="field">Acknowledgement note (optional)<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="What did you observe or verify?" /></label>}
            {resolveDialog && selected.status === 'acknowledged' && <label className="field">Resolution note<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Record the verification result" /></label>}
            {formError && <p className="state-error" role="alert">{formError}</p>}
            {mutation.isError && <ErrorState error={mutation.error} />}
            {(selected.status === 'open' || (resolveDialog && selected.status === 'acknowledged')) && <footer className="inline">
              {selected.status === 'open' && <button className="button button-primary" type="button" disabled={mutation.isPending} onClick={() => submitResponse(false)}>Acknowledge alert</button>}
              {resolveDialog && selected.status === 'acknowledged' && <button type="button" className="button button-primary" disabled={mutation.isPending} onClick={() => submitResponse(true)}>Confirm resolve</button>}
            </footer>}
          </section>
        </div>
      )}
    </div>
  );
}
