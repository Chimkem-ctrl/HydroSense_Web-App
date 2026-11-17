import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatManilaDateTime, getManilaDateString } from '@hydrosense/shared';
import type { CalibrationLog } from '@hydrosense/shared';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useSelectedTank } from '../app/tank/TankContext';
import { PageHeading } from '../components/common/PageHeading';
import { ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import { ThresholdsPanel } from './ThresholdsPage';

const maintenanceItems = [
  'Inspect device enclosure and cable seals',
  'Check sensor probe for fouling or damage',
  'Verify device clock and data transmission status',
  'Review the latest manual reference measurement',
];

export default function CalibrationPage() {
  const { tankId } = useSelectedTank();
  const { userName, role } = useRole();
  const queryClient = useQueryClient();
  const isOperator = role === 'operator';
  const [parameter, setParameter] = useState<CalibrationLog['parameter']>('ph');
  const [standard, setStandard] = useState('pH 7.00 buffer');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [date, setDate] = useState(getManilaDateString());
  const [nextDue, setNextDue] = useState(getManilaDateString(new Date(Date.now() + 30 * 86_400_000)));
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['calibrations', tankId], queryFn: () => api.listCalibrationLogs(tankId), enabled: Boolean(tankId) && !isOperator });
  const mutation = useMutation({
    mutationFn: () => api.createCalibrationLog({
      tankId,
      parameter,
      standard: standard.trim(),
      before: Number(before),
      after: Number(after),
      date: new Date(`${date}T12:00:00+08:00`).toISOString(),
      user: userName,
      nextDue: new Date(`${nextDue}T12:00:00+08:00`).toISOString(),
    }),
    onSuccess: async () => {
      setBefore('');
      setAfter('');
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['calibrations'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tankId || !standard.trim() || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) ||
        !before || !after || !date || !nextDue || new Date(`${nextDue}T00:00:00`) <= new Date(`${date}T00:00:00`)) {
      setError('Enter a calibration standard, valid before/after readings, and a due date after the calibration date.');
      return;
    }
    setError('');
    mutation.mutate();
  }

  const calibrationRecords = query.data ?? [];
  const now = Date.now();
  const soonestDue = calibrationRecords.reduce<CalibrationLog | null>((soonest, log) => (
    !soonest || new Date(log.nextDue).getTime() < new Date(soonest.nextDue).getTime() ? log : soonest
  ), null);
  const hasOverdueCalibration = calibrationRecords.some((log) => new Date(log.nextDue).getTime() < now);
  const soonestDueDate = soonestDue ? getManilaDateString(new Date(soonestDue.nextDue)) : null;
  const daysUntilDue = soonestDueDate
    ? Math.round((Date.parse(`${soonestDueDate}T00:00:00Z`) - Date.parse(`${getManilaDateString()}T00:00:00Z`)) / 86_400_000)
    : null;
  const checklistProgress = Math.round((checked.length / maintenanceItems.length) * 100);

  return (
    <div className={`dash-grid dash-calibration compact-page${isOperator ? ' dash-calibration-readonly' : ''}`}>
      <div className="dash-heading">
        <PageHeading title="Calibration & maintenance" description="Log pH and dissolved-oxygen calibration results and due dates. Checklists are informational only." />
      </div>
      {!isOperator && (
        <>
          <div className="dash-calibration-top">
            <section className="card dash-card dash-stat dash-calibration-summary">
              <header className="dash-card-header">
                <h2 className="card-title">Calibration status</h2>
                <p className="small muted dash-subtitle">Time until the soonest calibration is due.</p>
                <StaleQueryState updatedAt={query.dataUpdatedAt} />
              </header>
              <div className="dash-calibration-status-content">
                <div className="dash-stat-main">
                  <strong className="dash-stat-value">
                    {!soonestDue ? '—' : hasOverdueCalibration ? 'Overdue' : daysUntilDue}
                  </strong>
                  {soonestDue && !hasOverdueCalibration && <span className="dash-stat-unit">days</span>}
                </div>
                <p className="small muted dash-stat-caption">{soonestDueDate ? `Next due ${soonestDueDate}` : 'No calibration logged yet'}</p>
              </div>
            </section>
            <form className="card stack dash-card dash-calibration-form" onSubmit={submit}>
              <header className="dash-card-header">
                <h2 className="card-title">Log calibration</h2>
                <p className="small muted dash-subtitle">Record reference readings and the next scheduled calibration.</p>
              </header>
              {error && <p className="state-error" role="alert">{error}</p>}
              {mutation.isError && <ErrorState error={mutation.error} />}
              <div className="form-grid dash-calibration-fields">
                <label className="field dash-calibration-field-wide">Parameter<select value={parameter} onChange={(event) => {
                  const next = event.target.value as CalibrationLog['parameter'];
                  setParameter(next);
                  setStandard(next === 'ph' ? 'pH 7.00 buffer' : 'Air-saturated water');
                }}><option value="ph">pH</option><option value="do">Dissolved oxygen</option></select></label>
                <label className="field dash-calibration-field-wide">Calibration standard<input value={standard} onChange={(event) => setStandard(event.target.value)} required /></label>
                <label className="field">Before<input type="number" step="0.01" value={before} onChange={(event) => setBefore(event.target.value)} required /></label>
                <label className="field">After<input type="number" step="0.01" value={after} onChange={(event) => setAfter(event.target.value)} required /></label>
                <label className="field">Calibration date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
                <label className="field">Next due<input type="date" value={nextDue} onChange={(event) => setNextDue(event.target.value)} required /></label>
                <button className="button button-primary dash-save-button" type="submit" disabled={mutation.isPending}>Save calibration log</button>
              </div>
            </form>
          </div>
          <section className="card stack dash-card dash-calibration-due">
            <header className="dash-card-header">
              <h2 className="card-title">Calibration due dates</h2>
              <p className="small muted dash-subtitle">Review scheduled calibration dates and overdue records.</p>
            </header>
            <div className="dash-calibration-due-content">
              {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.length ? <p className="dash-calibration-empty" role="status">No calibration records are available.</p> : (
                <div className="table-wrap"><table><thead><tr><th>Parameter</th><th>Standard</th><th>Before</th><th>After</th><th>Date (PHT)</th><th>Next due</th><th>Technician</th></tr></thead><tbody>
                  {query.data.map((log) => {
                    const overdue = new Date(log.nextDue).getTime() < now;
                    return <tr key={log.id}><td>{log.parameter.toUpperCase()}</td><td>{log.standard}</td><td className="table-numeric">{log.before}</td><td className="table-numeric">{log.after}</td><td>{formatManilaDateTime(log.date)}</td><td className={overdue ? 'row-overdue' : ''}>{formatManilaDateTime(log.nextDue)}{overdue ? ' · OVERDUE' : ''}</td><td>{log.user}</td></tr>;
                  })}
                </tbody></table></div>
              )}
            </div>
          </section>
        </>
      )}
      <div className="dash-after-grid stack">
        <ThresholdsPanel readOnly />
      </div>
      {!isOperator && (
        <section className="card stack dash-card dash-calibration-checklist">
          <header className="dash-card-header">
            <h2 className="card-title">Maintenance checklist</h2>
            <p className="small muted dash-subtitle">Complete these informational maintenance steps.</p>
          </header>
          <div className="dash-list">
            {maintenanceItems.map((item) => <label key={item} className="check-row"><input type="checkbox" checked={checked.includes(item)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} /><span>{item}</span></label>)}
          </div>
          <div className="dash-checklist-progress">
            <strong>{checked.length} / {maintenanceItems.length} complete</strong>
            <div className="dash-checklist-meter" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={checklistProgress}>
              <span style={{ width: `${checklistProgress}%` }} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
