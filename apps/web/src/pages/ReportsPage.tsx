import { useEffect, useMemo, useState } from 'react';
import { buildReport, can, formatManilaDateTime, getManilaDateString, toCsv } from '@hydrosense/shared';
import type { ReportData, ReportSection } from '@hydrosense/shared';
import { useQuery } from '@tanstack/react-query';
import { tierConfig } from '../app/config';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useSelectedTank } from '../app/tank/TankContext';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';

type ExportType = 'readings' | 'alerts' | 'activity' | 'calibration' | 'validation';

const reportSections: Array<{ value: ReportSection; label: string }> = [
  { value: 'summary', label: 'Executive summary' },
  { value: 'thresholds', label: 'Thresholds' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'advisories', label: 'Advisories' },
  { value: 'activity', label: 'Activity logs' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'validation', label: 'Validation' },
  { value: 'data-quality', label: 'Data quality' },
  { value: 'raw-readings', label: 'Raw readings' },
];

function manilaStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

function manilaEnd(date: string) {
  return new Date(`${date}T23:59:59.999+08:00`).toISOString();
}

export default function ReportsPage() {
  const { tankId } = useSelectedTank();
  const { userName, role } = useRole();
  const canExport = can(role, 'exportReports');
  const canViewValidation = can(role, 'validation');
  const canViewCalibration = can(role, 'calibration');
  const [type, setType] = useState<ExportType>('readings');
  const [selectedTankIds, setSelectedTankIds] = useState<string[]>([]);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - Math.min(7, tierConfig.retentionDays) * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const minimumDate = getManilaDateString(new Date(Date.now() - Math.max(0, tierConfig.retentionDays - 1) * 86_400_000));
  const maximumDate = getManilaDateString();
  const [sections, setSections] = useState<ReportSection[]>(() => reportSections.filter(({ value }) => (value !== 'validation' || canViewValidation) && (value !== 'calibration' || canViewCalibration)).map(({ value }) => value));
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (tankId) setSelectedTankIds([tankId]);
  }, [tankId]);
  const dataQuery = useQuery({
    queryKey: ['report-data', role],
    queryFn: async (): Promise<ReportData> => {
      const [tanks, readings, alerts, thresholds, activityLogs, calibrationLogs, deviceStatuses] = await Promise.all([
        api.listTanks(),
        api.listReadings(),
        api.listAlerts(),
        api.listThresholds(),
        api.listActivityLogs(),
        canViewCalibration ? api.listCalibrationLogs() : Promise.resolve([]),
        api.listDeviceStatuses(),
      ]);
      const validationRows = canViewValidation ? await api.listValidationRows() : [];
      const advisoryRows = await Promise.all(tanks.map(async (tank) => [tank.id, await api.listAdvisories(tank.id)] as const));
      return {
        tanks,
        readings,
        alerts,
        thresholds,
        advisories: Object.fromEntries(advisoryRows),
        activityLogs,
        calibrationLogs,
        validationRows,
        deviceStatuses,
      };
    },
  });
  const model = useMemo(() => {
    if (!dataQuery.data || !tankId) return null;
    return buildReport({
      tankIds: selectedTankIds.length ? selectedTankIds : [tankId],
      from: manilaStart(from),
      to: manilaEnd(to),
      sections,
      format: 'pdf',
      generatedBy: { name: userName, role },
    }, dataQuery.data);
  }, [dataQuery.data, from, role, sections, selectedTankIds, tankId, to, userName]);
  const rows = useMemo((): unknown[][] => {
    if (!model) return [];
    if (type === 'readings') return model.rawReadings.map((row) => [row.timestamp, row.tankId, row.temperature, row.doMgL, row.ph]);
    if (type === 'alerts') return model.alerts.map((row) => [row.createdAt, row.tankId, row.parameter, row.value, row.threshold, row.severity, row.status, row.acknowledgedBy ?? '', row.note ?? '']);
    if (type === 'activity') return model.activityLogs.map((row) => [row.occurredAt, row.kind, row.type, row.tankId, row.notes, row.operator]);
    if (type === 'calibration') return model.calibrationLogs.map((row) => [row.date, row.tankId, row.parameter, row.standard, row.before, row.after, row.user, row.nextDue]);
    return model.validationRows.map((row) => [row.parameter, row.hydrosenseMean, row.reference, row.error, row.pctError, row.tolerance, row.pass ? 'pass' : 'fail']);
  }, [model, type]);
  const headers: Record<ExportType, string[]> = {
    readings: ['Timestamp (ISO)', 'Tank', 'Temperature °C', 'DO mg/L', 'pH'],
    alerts: ['Created (ISO)', 'Tank', 'Parameter', 'Value', 'Threshold', 'Severity', 'Status', 'Acknowledged by', 'Response note'],
    activity: ['Occurred (ISO)', 'Kind', 'Type', 'Tank / scope', 'Details', 'Operator'],
    calibration: ['Date (ISO)', 'Tank', 'Parameter', 'Standard', 'Before', 'After', 'User', 'Next due (ISO)'],
    validation: ['Parameter', 'HydroSense mean', 'Reference', 'Error', '% error', 'Tolerance', 'Result'],
  };

  function downloadCsv() {
    const csv = toCsv([headers[type], ...rows]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hydrosense-${type}-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('CSV export generated.');
  }

  return (
    <>
      <div className="dash-grid dash-reports compact-page">
        <div className="dash-heading">
          <PageHeading title="Reports" description="Build and preview reports, print to PDF, or export datasets as CSV." />
        </div>
        <section className="card stack dash-card dash-report-settings">
          <header className="dash-card-header">
            <h2 className="card-title">Export settings</h2>
            <p className="small muted dash-subtitle">Choose a dataset and reporting period.</p>
            <StaleQueryState updatedAt={dataQuery.dataUpdatedAt} />
          </header>
          <div className="dash-report-controls">
            {canExport && <label className="field">CSV dataset<select value={type} onChange={(event) => setType(event.target.value as ExportType)}><option value="readings">Raw readings</option><option value="alerts">Alerts</option><option value="activity">Activity logs</option>{canViewCalibration && <option value="calibration">Calibration log</option>}{canViewValidation && <option value="validation">Validation</option>}</select></label>}
            <label className="field">From<input type="date" value={from} min={minimumDate} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="field">To<input type="date" value={to} min={from} max={maximumDate} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <div className="dash-report-toolbar">
            <div className="dash-report-result">
              <span className="small muted">Records matched</span>
              <strong>{rows.length}</strong>
              <span className="small muted">{from} → {to} · Asia/Manila</span>
            </div>
            <div className="dash-report-actions">
              {!dataQuery.isLoading && !dataQuery.isError && !rows.length && <p className="small muted">No records match this dataset and date range.</p>}
              {notice && <p role="status">{notice}</p>}
              {canExport && rows.length > 0 && !dataQuery.isLoading && !dataQuery.isError && <button className="button button-primary" type="button" onClick={downloadCsv}>Download CSV</button>}
            </div>
          </div>
        </section>
        <section className="card stack dash-card dash-report-tanks" aria-labelledby="report-tanks-title">
          <header className="dash-card-header">
            <h2 id="report-tanks-title" className="card-title">Tanks</h2>
            <p className="small muted dash-subtitle">Select the tanks to include.</p>
          </header>
          <div className="dash-list">
            {(dataQuery.data?.tanks ?? []).map((tank) => (
              <label className="check-row" key={tank.id}>
                <input type="checkbox" checked={selectedTankIds.includes(tank.id)} disabled={selectedTankIds.length === 1 && selectedTankIds.includes(tank.id)} onChange={(event) => setSelectedTankIds((current) => event.target.checked ? [...current, tank.id] : current.filter((id) => id !== tank.id))} />
                <span>{tank.name}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="card stack dash-card dash-report-sections" aria-labelledby="report-sections-title">
          <header className="dash-card-header">
            <h2 id="report-sections-title" className="card-title">Report sections</h2>
            <p className="small muted dash-subtitle">Choose the sections to include in the report.</p>
          </header>
          <div className="dash-list dash-list-checks">
            {reportSections.filter(({ value }) => (value !== 'validation' || canViewValidation) && (value !== 'calibration' || canViewCalibration)).map(({ value, label }) => (
              <label className="check-row" key={value}>
                <input type="checkbox" checked={sections.includes(value)} onChange={(event) => setSections((current) => event.target.checked ? [...current, value] : current.filter((section) => section !== value))} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="card stack dash-card dash-report-preview print-preview" aria-labelledby="report-preview-title">
          <div className="dash-report-preview-header">
            <h2 id="report-preview-title" className="card-title">Report preview</h2>
            {canExport && model && <button className="button button-primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>}
          </div>
          {dataQuery.isLoading ? <LoadingState label="Preparing report..." /> : dataQuery.isError ? <ErrorState error={dataQuery.error} onRetry={() => void dataQuery.refetch()} /> : !model ? <EmptyState>Select a tank to generate the report.</EmptyState> : (
            <div className="dash-report-body">
              <div className="dash-report-meta">
                <p>Report {model.id} · {model.tanks.map((tank) => tank.name).join(', ')} · {from} to {to} PHT</p>
                <p>Prepared by {model.generatedBy.name} ({model.generatedBy.role}) · generated {formatManilaDateTime(model.generatedAt)} PHT</p>
              </div>
              {sections.includes('summary') && <p className="dash-report-summary">{model.summary}</p>}
              {sections.includes('statistics') && <div className="table-wrap"><table><thead><tr><th>Parameter</th><th>Min</th><th>Max</th><th>Mean</th><th>Std dev</th><th>In range</th><th>Excursions</th><th>Longest (h)</th></tr></thead><tbody>
                {model.statistics.map((row) => <tr key={row.parameter}><td>{row.parameter}</td><td className="table-numeric">{row.min?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.max?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.mean?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.standardDeviation?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.percentInRange?.toFixed(1) ?? '—'}%</td><td className="table-numeric">{row.excursions}</td><td className="table-numeric">{row.longestExcursionHours.toFixed(1)}</td></tr>)}
              </tbody></table></div>}
              <div className="dash-report-facts">
                {sections.includes('alerts') && <p className="dash-report-fact"><strong>Alerts:</strong> {model.alertCounts.critical} critical, {model.alertCounts.warning} warning · {model.alertCounts.open} open, {model.alertCounts.acknowledged} acknowledged, {model.alertCounts.resolved} resolved.</p>}
                {sections.includes('data-quality') && <p className="dash-report-fact"><strong>Expected readings:</strong> {model.dataQuality.expectedReadings} · Received: {model.dataQuality.receivedReadings} ({model.dataQuality.receivedPercent.toFixed(1)}%).</p>}
                {sections.includes('thresholds') && <p className="dash-report-fact"><strong>Thresholds used:</strong> {model.thresholds.map((threshold) => `${threshold.parameter} ${threshold.min ?? '—'}–${threshold.max ?? '—'}`).join(' · ')}</p>}
                {sections.includes('advisories') && model.tanks.map((tank) => <p className="dash-report-fact" key={tank.id}><strong>Current advisories for {tank.name}:</strong> {(model.advisories[tank.id] ?? []).map((item) => `${item.kind} ${item.level}`).join(', ') || 'none'}.</p>)}
                {sections.includes('activity') && <p className="dash-report-fact"><strong>Activity logs included:</strong> {model.activityLogs.length}.</p>}
                {sections.includes('calibration') && <p className="dash-report-fact"><strong>Calibration records included:</strong> {model.calibrationLogs.length}.</p>}
                {sections.includes('validation') && <p className="dash-report-fact"><strong>Validation comparisons included:</strong> {model.validationRows.length}.</p>}
              </div>
              {sections.includes('raw-readings') && <div className="dash-report-raw-readings">{model.rawReadings.slice(0, 10).map((row) => <p className="small" key={row.id}>{formatManilaDateTime(row.timestamp)} PHT · {row.tankId} · {row.temperature} °C · {row.doMgL} mg/L · pH {row.ph}</p>)}</div>}
              <p className="small muted dash-report-disclaimer">Monitoring and alert system only. Salinity and ammonia are rule-based advisories, not measurements.</p>
              {!canExport && <p className="small muted">Operators may view reports; export is available to managers and administrators.</p>}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
