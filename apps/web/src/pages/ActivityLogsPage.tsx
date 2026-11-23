import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { ClipboardList, CloudSun, FileDown } from 'lucide-react';
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_OPERATION_TYPES,
  activityInHatchery,
  formatManilaDateTime,
  hatcheryId,
  validateActivityLog,
} from '@hydrosense/shared';
import type { ActivityLog, ActivityLogKind } from '@hydrosense/shared';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useSelectedTank } from '../app/tank/TankContext';
import { useTanks } from '../app/data/hooks';
import { PageHeading } from '../components/common/PageHeading';
import { Select } from '../components/common/Select';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import { activityLogCsv, manilaDate } from './activityLogs';
import { downloadCsv } from '../services/downloadCsv';
import type { ShellOutletContext } from '../components/shell/AppShell';

type FormKind = Extract<ActivityLogKind, 'OPERATION' | 'ENVIRONMENT'>;

export default function ActivityLogsPage() {
  const { notifyActivityExport } = useOutletContext<ShellOutletContext>();
  const { tankId, hatchery, tanks: scopedTanks } = useSelectedTank();
  const { userName, role } = useRole();
  const queryClient = useQueryClient();
  const tanks = useTanks();
  const logs = useQuery({ queryKey: ['activity-logs'], queryFn: () => api.listActivityLogs() });
  const canExport = role === 'manager' || role === 'admin';
  const [modalKind, setModalKind] = useState<FormKind | null>(null);
  const [scope, setScope] = useState(tankId);
  const [activityType, setActivityType] = useState<string>(ACTIVITY_OPERATION_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [waterChangePercent, setWaterChangePercent] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [impact, setImpact] = useState('Moderate');
  const [formError, setFormError] = useState('');
  const [kindFilter, setKindFilter] = useState<ActivityLogKind | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const createLog = useMutation({
    mutationFn: (entry: Omit<ActivityLog, 'id' | 'occurredAt'>) => api.createActivityLog(entry),
    onSuccess: async (created) => {
      setModalKind(null);
      setNotes('');
      setWaterChangePercent('');
      setWaterSource('');
      setFormError('');
      setStatusMessage(created.kind === 'OPERATION' ? 'Hatchery operation logged.' : 'Environmental event logged.');
      await queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
      if (created.tankId !== 'hatchery') {
        await queryClient.invalidateQueries({ queryKey: ['advisories', created.tankId] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['advisories'] });
      }
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  useEffect(() => {
    if (!modalKind) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalKind(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modalKind]);

  const filteredLogs = (logs.data ?? [])
    .filter((log) => activityInHatchery(log, tanks.data ?? [], hatchery))
    .filter((log) => kindFilter === 'all' || log.kind === kindFilter)
    .filter((log) => {
      const date = typeof log.occurredAt === 'string' ? manilaDate(log.occurredAt) : '';
      return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    })
    .sort((left, right) => String(right.occurredAt ?? '').localeCompare(String(left.occurredAt ?? '')));
  const tankNames = new Map((tanks.data ?? []).map((tank) => [tank.id, tank.name]));

  function openLog(kind: FormKind) {
    setModalKind(kind);
    setScope(kind === 'ENVIRONMENT' ? 'hatchery' : tankId);
    setActivityType(kind === 'OPERATION' ? ACTIVITY_OPERATION_TYPES[0] : ACTIVITY_EVENT_TYPES[0]);
    setNotes('');
    setWaterChangePercent('');
    setWaterSource('');
    setImpact('Moderate');
    setFormError('');
  }

  function submitLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalKind) return;
    const selectedTank = (tanks.data ?? []).find((tank) => tank.id === tankId);
    const selectedHatchery = hatchery === 'all' ? (selectedTank ? hatcheryId(selectedTank.site) : '') : hatchery;
    if (scope === 'hatchery' && !selectedHatchery) {
      setFormError('Select a tank or hatchery before recording a hatchery-wide event.');
      return;
    }
    const rawPercent = waterChangePercent.trim();
    const parsedPercent = rawPercent ? Number(rawPercent) : undefined;
    const entry: Omit<ActivityLog, 'id' | 'occurredAt'> = {
      tankId: scope,
      ...(scope === 'hatchery' ? { hatcheryId: selectedHatchery } : {}),
      kind: modalKind,
      type: activityType,
      operator: userName,
      notes: notes.trim(),
      ...(modalKind === 'OPERATION' && activityType === 'Water change / exchange' ? {
        waterChangePercent: parsedPercent ?? Number.NaN,
        ...(waterSource.trim() ? { waterSource: waterSource.trim() } : {}),
      } : {}),
      ...(modalKind === 'ENVIRONMENT' ? { impact } : {}),
    };
    const issues = validateActivityLog(entry);
    if (issues.length) {
      setFormError(issues[0].message);
      return;
    }
    createLog.mutate({
      ...entry,
    });
  }

  function exportLogs() {
    if (!filteredLogs.length) return;
    downloadCsv(activityLogCsv(filteredLogs, tanks.data ?? []), 'hydrosense-activity-logs.csv');
    notifyActivityExport();
  }

  return (
    <div className="stack activity-logs-page">
      <PageHeading
        title="Activity Logs"
        description="Log operations, water-quality checks, and environmental events for shift handover."
      />
      {role !== 'admin' && <div className="inline activity-log-actions">
        <button type="button" className="button" onClick={() => openLog('OPERATION')}><ClipboardList size={18} aria-hidden="true" />Log operation</button>
        <button type="button" className="button" onClick={() => openLog('ENVIRONMENT')}><CloudSun size={18} aria-hidden="true" />Log weather / event</button>
      </div>}
      {statusMessage && <p className="small muted" role="status">{statusMessage}</p>}
      <StaleQueryState updatedAt={logs.dataUpdatedAt} />
      <section className="card stack activity-log-records">
        <header className="activity-log-records-header">
          <h2 className="card-title">Activity Records</h2>
          {canExport && <button type="button" className="icon-button activity-log-export" aria-label="Export CSV" title="Export CSV" disabled={!filteredLogs.length || logs.isLoading || logs.isError || tanks.isLoading || tanks.isError} onClick={exportLogs}><FileDown size={18} aria-hidden="true" /></button>}
        </header>
        <div className="form-grid filter-row activity-log-filters">
          <label className="field">Kind
            <Select value={kindFilter === 'all' ? '' : kindFilter} clearable placeholder="Kind" onChange={(event) => setKindFilter((event.target.value || 'all') as ActivityLogKind | 'all')}>
              <option value="OPERATION">Operation</option>
              <option value="ENVIRONMENT">Environment</option>
              <option value="ALERT RESOLUTION">Alert resolution</option>
            </Select>
          </label>
          <label className="field">From date (PHT)<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="field">To date (PHT)<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        {logs.isLoading || tanks.isLoading ? <LoadingState /> : logs.isError ? <ErrorState error={logs.error} onRetry={() => void logs.refetch()} /> : tanks.isError ? <ErrorState error={tanks.error} onRetry={() => void tanks.refetch()} /> : !filteredLogs.length ? <EmptyState>No activity logs match the selected filters.</EmptyState> : (
          <div className="table-wrap activity-log-table-wrap"><table className="activity-log-table"><thead><tr><th>Time (PHT)</th><th>Kind</th><th>Type</th><th>Tank/scope</th><th>Details</th><th>Operator</th></tr></thead><tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td data-label="Time (PHT)">{log.occurredAt && Number.isFinite(Date.parse(log.occurredAt)) ? `${formatManilaDateTime(log.occurredAt)} PHT` : 'Unavailable'}</td>
                <td data-label="Kind">{log.kind ?? '—'}</td>
                <td data-label="Type">{log.type ?? '—'}</td>
                <td data-label="Tank/scope">{log.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(log.tankId) ?? log.tankId ?? '—'}</td>
                <td data-label="Details">{log.notes ?? '—'}{log.waterChangePercent !== undefined ? ` · ${log.waterChangePercent}% exchanged` : ''}{log.impact ? ` · Impact: ${log.impact}` : ''}</td>
                <td data-label="Operator">{log.operator ?? '—'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      {modalKind && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalKind(null); }}>
          <section className="dialog card stack" role="dialog" aria-modal="true" aria-labelledby="activity-log-title">
            <header>
              <h2 id="activity-log-title" className="card-title activity-log-dialog-title">{modalKind === 'OPERATION' ? <ClipboardList size={20} aria-hidden="true" /> : <CloudSun size={20} aria-hidden="true" />}{modalKind === 'OPERATION' ? 'Log Hatchery Operation' : 'Log Weather or Event'}</h2>
              <p className="small muted">Add an activity record for shift handover.</p>
            </header>
            <form className="stack activity-log-form" onSubmit={submitLog}>
              <label className="field">{modalKind === 'OPERATION' ? 'Tank or scope' : 'Event scope'}
                <Select value={scope} onChange={(event) => setScope(event.target.value)}>
                  <option value="hatchery">Entire hatchery</option>
                  {scopedTanks.map((tank) => <option value={tank.id} key={tank.id}>{tank.name}</option>)}
                </Select>
              </label>
              <label className="field">{modalKind === 'OPERATION' ? 'Operation type' : 'Event type'}
                <Select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
                  {(modalKind === 'OPERATION' ? ACTIVITY_OPERATION_TYPES : ACTIVITY_EVENT_TYPES).map((type) => <option key={type}>{type}</option>)}
                </Select>
              </label>
              {modalKind === 'OPERATION' && activityType === 'Water change / exchange' && (
                <div className="form-grid">
                  <label className="field">Water replaced (%)<input type="number" min="0.1" max="100" step="0.1" value={waterChangePercent} onChange={(event) => setWaterChangePercent(event.target.value)} placeholder="e.g. 20" required /></label>
                  <label className="field">Water source (optional)<input value={waterSource} onChange={(event) => setWaterSource(event.target.value)} placeholder="e.g. treated reservoir" /></label>
                </div>
              )}
              {modalKind === 'ENVIRONMENT' && <label className="field">Observed impact<Select value={impact} onChange={(event) => setImpact(event.target.value)}><option>Low</option><option>Moderate</option><option>High</option><option>Unknown</option></Select></label>}
              <label className="field">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={modalKind === 'OPERATION' ? 'What was done? Include observations or follow-up needed.' : 'When did it occur? What changed around the tank?'} rows={4} required /></label>
              {formError && <p className="state-error" role="alert">{formError}</p>}
              {createLog.isError && <ErrorState error={createLog.error} />}
              <footer className="inline">
                <button type="button" className="button" onClick={() => setModalKind(null)}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={createLog.isPending}>{createLog.isPending ? 'Saving…' : 'Save entry'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
