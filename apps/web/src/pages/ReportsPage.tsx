import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
type FilterPopoverPosition = { top: number; left: number; width: number; maxHeight: number };

const reportSections: Array<{ value: ReportSection; label: string }> = [
  { value: 'summary', label: 'Executive summary' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'activity', label: 'Activity logs' },
  { value: 'validation', label: 'Validation' },
  { value: 'raw-readings', label: 'Raw readings' },
  { value: 'thresholds', label: 'Thresholds' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'data-quality', label: 'Data quality' },
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterPosition, setFilterPosition] = useState<FilterPopoverPosition | null>(null);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - Math.min(7, tierConfig.retentionDays) * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const minimumDate = getManilaDateString(new Date(Date.now() - Math.max(0, tierConfig.retentionDays - 1) * 86_400_000));
  const maximumDate = getManilaDateString();
  const [sections, setSections] = useState<ReportSection[]>(() => reportSections.filter(({ value }) => (value !== 'validation' || canViewValidation) && (value !== 'calibration' || canViewCalibration)).map(({ value }) => value));
  const [notice, setNotice] = useState('');
  const filterActionsRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterPanelId = useId();
  const availableReportSections = reportSections.filter(({ value }) => (value !== 'validation' || canViewValidation) && (value !== 'calibration' || canViewCalibration));
  const selectedReportSectionCount = availableReportSections.filter(({ value }) => sections.includes(value)).length;
  useEffect(() => {
    if (tankId) setSelectedTankIds([tankId]);
  }, [tankId]);
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterActionsRef.current?.contains(event.target) && !filterPanelRef.current?.contains(event.target)) {
        setFiltersOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFiltersOpen(false);
        filterButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    filterPanelRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);
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
      return {
        tanks,
        readings,
        alerts,
        thresholds,
        advisories: {},
        activityLogs,
        calibrationLogs,
        validationRows,
        deviceStatuses,
      };
    },
  });
  useLayoutEffect(() => {
    if (!filtersOpen) return;
    const reposition = () => {
      const trigger = filterButtonRef.current?.getBoundingClientRect();
      const panel = filterPanelRef.current;
      if (!trigger || !panel) return;
      const margin = 16;
      const gap = 8;
      const narrow = window.innerWidth <= 900;
      const width = narrow ? window.innerWidth - margin * 2 : Math.min(560, window.innerWidth * 0.9);
      const left = narrow
        ? margin
        : Math.max(margin, Math.min(trigger.right - width, window.innerWidth - width - margin));
      const maxViewportHeight = window.innerHeight * 0.7;
      const contentHeight = panel.scrollHeight;
      const requiredHeight = Math.min(contentHeight, maxViewportHeight);
      const availableBelow = Math.max(0, window.innerHeight - trigger.bottom - gap - margin);
      const availableAbove = Math.max(0, trigger.top - gap - margin);
      const opensAbove = availableBelow < requiredHeight && availableAbove > 0;
      const availableHeight = opensAbove ? availableAbove : availableBelow;
      const maxHeight = Math.min(maxViewportHeight, availableHeight);
      const height = Math.min(contentHeight, maxHeight);
      const top = opensAbove ? trigger.top - gap - height : trigger.bottom + gap;
      setFilterPosition((current) => current && current.top === top && current.left === left && current.width === width && current.maxHeight === maxHeight
        ? current
        : { top, left, width, maxHeight });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [filtersOpen, dataQuery.data]);
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
  const tankNames = useMemo(() => new Map((model?.tanks ?? []).map((tank) => [tank.id, tank.name])), [model]);
  const rows = useMemo((): unknown[][] => {
    if (!model) return [];
    if (type === 'readings') return model.rawReadings.map((row) => [row.timestamp, tankNames.get(row.tankId) ?? row.tankId, row.temperature, row.doMgL, row.ph]);
    if (type === 'alerts') return model.alerts.map((row) => [row.createdAt, tankNames.get(row.tankId) ?? row.tankId, row.parameter, row.value, row.threshold, row.severity, row.status, row.acknowledgedBy ?? '', row.note ?? '']);
    if (type === 'activity') return model.activityLogs.map((row) => [row.occurredAt, row.kind, row.type, row.tankId === 'hatchery' ? 'Hatchery-wide' : tankNames.get(row.tankId) ?? row.tankId, row.notes, row.operator]);
    if (type === 'calibration') return model.calibrationLogs.map((row) => [row.date, tankNames.get(row.tankId) ?? row.tankId, row.parameter, row.standard, row.before, row.after, row.user, row.nextDue]);
    return model.validationRows.map((row) => [row.parameter, row.hydrosenseMean, row.reference, row.error, row.pctError, row.tolerance, row.pass ? 'pass' : 'fail']);
  }, [model, tankNames, type]);
  const headers: Record<ExportType, string[]> = {
    readings: ['Timestamp (ISO)', 'Tank', 'Temperature °C', 'DO mg/L', 'pH'],
    alerts: ['Created (ISO)', 'Tank', 'Parameter', 'Value', 'Threshold', 'Severity', 'Status', 'Acknowledged by', 'Response note'],
    activity: ['Occurred (ISO)', 'Kind', 'Type', 'Tank / scope', 'Details', 'Operator'],
    calibration: ['Date (ISO)', 'Tank', 'Parameter', 'Standard', 'Before', 'After', 'User', 'Next due (ISO)'],
    validation: ['Parameter', 'HydroSense mean', 'Reference', 'Error', '% error', 'Tolerance', 'Result'],
  };

  function toggleFilters() {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setFilterPosition(null);
    setFiltersOpen(true);
  }

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
          <p className="small muted dash-report-scope-note">The dataset applies to CSV export; the date range applies to CSV and the report.</p>
          <div className="dash-report-toolbar">
            <div className="dash-report-result">
              <span className="small muted">Records matched</span>
              <strong>{rows.length}</strong>
              <span className="small muted">{from} → {to} · Asia/Manila</span>
            </div>
            <div className="dash-report-actions" ref={filterActionsRef}>
              {!dataQuery.isLoading && !dataQuery.isError && !rows.length && <p className="small muted">No records match this dataset and date range.</p>}
              {notice && <p role="status">{notice}</p>}
              <div className={`dash-report-action-buttons${canExport && rows.length > 0 && !dataQuery.isLoading && !dataQuery.isError ? ' has-csv' : ''}`}>
                {canExport && rows.length > 0 && !dataQuery.isLoading && !dataQuery.isError && <button className="button button-primary" type="button" onClick={downloadCsv}>Download CSV</button>}
                <button
                  ref={filterButtonRef}
                  className="button dash-report-filter-button"
                  type="button"
                  aria-expanded={filtersOpen}
                  aria-haspopup="dialog"
                  aria-controls={filtersOpen ? filterPanelId : undefined}
                  onClick={toggleFilters}
                >
                  <span>Filters</span>
                  <span className="dash-report-filter-count">{selectedReportSectionCount}/{availableReportSections.length}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="card stack dash-card dash-report-preview print-preview" aria-labelledby="report-preview-title">
          <div className="dash-report-preview-header">
            <h2 id="report-preview-title" className="card-title">Report preview</h2>
            {canExport && model && <button className="button button-primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>}
          </div>
          {dataQuery.isLoading ? <LoadingState label="Preparing report..." /> : dataQuery.isError ? <ErrorState error={dataQuery.error} onRetry={() => void dataQuery.refetch()} /> : !model ? <EmptyState>Select a tank to generate the report.</EmptyState> : (
            <div className="dash-report-body">
              <dl className="dash-report-meta">
                <div><dt>Report ID</dt><dd className="dash-report-id">{model.id}</dd></div>
                <div><dt>Tanks / period</dt><dd>{model.tanks.map((tank) => tank.name).join(', ')} · {from} to {to} PHT</dd></div>
                <div><dt>Prepared by</dt><dd>{model.generatedBy.name} ({model.generatedBy.role})</dd></div>
                <div><dt>Generated</dt><dd>{formatManilaDateTime(model.generatedAt)} PHT</dd></div>
              </dl>
              {sections.includes('summary') && <p className="dash-report-summary">{model.summary}</p>}
              {sections.includes('statistics') && <div className="table-wrap"><table><thead><tr><th>Parameter</th><th>Min</th><th>Max</th><th>Mean</th><th>Std dev</th><th>In range</th><th>Excursions</th><th>Longest (h)</th></tr></thead><tbody>
                {model.statistics.map((row) => <tr key={row.parameter}><td>{row.parameter}</td><td className="table-numeric">{row.min?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.max?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.mean?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.standardDeviation?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.percentInRange?.toFixed(1) ?? '—'}%</td><td className="table-numeric">{row.excursions}</td><td className="table-numeric">{row.longestExcursionHours.toFixed(1)}</td></tr>)}
              </tbody></table></div>}
              <div className="dash-report-facts">
                {sections.includes('alerts') && <p className="dash-report-fact"><strong>Alerts:</strong> {model.alertCounts.critical} critical, {model.alertCounts.warning} warning · {model.alertCounts.open} open, {model.alertCounts.acknowledged} acknowledged, {model.alertCounts.resolved} resolved.</p>}
                {sections.includes('data-quality') && <p className="dash-report-fact"><strong>Expected readings:</strong> {model.dataQuality.expectedReadings} · Received: {model.dataQuality.receivedReadings} ({model.dataQuality.receivedPercent.toFixed(1)}%).</p>}
                {sections.includes('thresholds') && <p className="dash-report-fact"><strong>Thresholds used:</strong> {model.thresholds.map((threshold) => `${threshold.parameter} ${threshold.min ?? '—'}–${threshold.max ?? '—'}`).join(' · ')}</p>}
                {sections.includes('activity') && <p className="dash-report-fact"><strong>Activity logs included:</strong> {model.activityLogs.length}.</p>}
                {sections.includes('calibration') && <p className="dash-report-fact"><strong>Calibration records included:</strong> {model.calibrationLogs.length}.</p>}
                {sections.includes('validation') && <p className="dash-report-fact"><strong>Validation comparisons included:</strong> {model.validationRows.length}.</p>}
              </div>
              {sections.includes('raw-readings') && <div className="dash-report-raw-readings">{model.rawReadings.slice(0, 10).map((row) => <p className="small" key={row.id}>{formatManilaDateTime(row.timestamp)} PHT · {row.tankId} · {row.temperature} °C · {row.doMgL} mg/L · pH {row.ph}</p>)}</div>}
              {!canExport && <p className="small muted">Operators may view reports; export is available to managers and administrators.</p>}
            </div>
          )}
        </section>
      </div>
      {filtersOpen && createPortal(
        <div
          ref={filterPanelRef}
          id={filterPanelId}
          className="dash-report-filter-popover"
          style={{
            top: filterPosition?.top ?? 0,
            left: filterPosition?.left ?? 0,
            width: filterPosition?.width ?? 'min(560px, 90vw)',
            maxHeight: filterPosition?.maxHeight ?? '70vh',
            visibility: filterPosition ? 'visible' : 'hidden',
          }}
          role="dialog"
          aria-label="Report filters"
        >
          <div className="dash-report-filter-area">
            <p className="small muted dash-report-filter-note">Tanks and sections apply to the report preview and PDF.</p>
            <div className="dash-report-filter-groups">
              <fieldset className="dash-report-filter-group">
                <legend>Tanks</legend>
                <div className="dash-report-options dash-report-tank-options">
                  {(dataQuery.data?.tanks ?? []).map((tank) => (
                    <label className="dash-report-option" key={tank.id}>
                      <input type="checkbox" checked={selectedTankIds.includes(tank.id)} disabled={selectedTankIds.length === 1 && selectedTankIds.includes(tank.id)} onChange={(event) => setSelectedTankIds((current) => event.target.checked ? [...current, tank.id] : current.filter((id) => id !== tank.id))} />
                      <span>{tank.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="dash-report-filter-group">
                <legend>Report sections</legend>
                <div className="dash-report-options dash-report-section-options">
                  {availableReportSections.map(({ value, label }) => (
                    <label className="dash-report-option" key={value}>
                      <input type="checkbox" checked={sections.includes(value)} onChange={(event) => setSections((current) => event.target.checked ? [...current, value] : current.filter((section) => section !== value))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
