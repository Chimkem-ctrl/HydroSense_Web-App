import { ChevronDown, FileDown, Printer } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { activityHatcheryName, activityInHatchery, buildReport, can, formatManilaDateTime, generateReportId, formatMeasuredParameterLabel, getManilaDateString, loadAllReadings, tankInHatchery, toCsv } from '@hydrosense/shared';
import type { ReportData, ReportModel, ReportSection } from '@hydrosense/shared';
import { useQuery } from '@tanstack/react-query';
import { tierConfig } from '../app/config';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { useSelectedTank } from '../app/tank/TankContext';
import { PageHeading } from '../components/common/PageHeading';
import { Select } from '../components/common/Select';
import { EmptyState, ErrorState, LoadingState, StaleQueryState } from '../components/common/States';
import { activityLogCsv } from './activityLogs';

type ExportType = 'readings' | 'alerts' | 'activity' | 'calibration' | 'validation';
type FilterPopoverPosition = { top: number; left: number; width: number; maxHeight: number };

const reportSections: Array<{ value: ReportSection; label: string }> = [
  { value: 'summary', label: 'Executive Summary' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'activity', label: 'Activity Logs' },
  { value: 'validation', label: 'Validation' },
  { value: 'raw-readings', label: 'Raw Readings' },
  { value: 'thresholds', label: 'Thresholds' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'data-quality', label: 'Data Quality' },
];

const reportParameterLabels = { temperature: 'Temperature', do: 'DO', ph: 'pH' } as const;

function manilaStart(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

function manilaEnd(date: string) {
  return new Date(`${date}T23:59:59.999+08:00`).toISOString();
}

const reportRangeDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
});

function formatReportRangeDate(date: string) {
  return reportRangeDateFormatter.format(new Date(`${date}T12:00:00+08:00`));
}

function formatThresholdRange(min?: number, max?: number) {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return '—';
}

function saveReportMetadata(report: ReportModel, reportType: ReportModel['format']) {
  void api.saveReport({
    id: report.id,
    reportType,
    tankIds: report.tanks.map((tank) => tank.id),
    rangeFrom: report.range.from,
    rangeTo: report.range.to,
  }).catch((error) => console.error('Could not save report metadata:', error));
}

export default function ReportsPage() {
  const { tankId, hatchery } = useSelectedTank();
  const { userName, role } = useRole();
  const canExport = can(role, 'exportReports');
  const canViewValidation = can(role, 'validation');
  const canViewCalibration = can(role, 'calibration');
  const [type, setType] = useState<ExportType>('readings');
  const [selectedTankIds, setSelectedTankIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterPosition, setFilterPosition] = useState<FilterPopoverPosition | null>(null);
  const [from, setFrom] = useState(() => getManilaDateString(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => getManilaDateString());
  const minimumDate = getManilaDateString(new Date(Date.now() - Math.max(0, tierConfig.retentionDays - 1) * 86_400_000));
  const maximumDate = getManilaDateString();
  const [sections, setSections] = useState<ReportSection[]>(() => reportSections.filter(({ value }) => (value !== 'validation' || canViewValidation) && (value !== 'calibration' || canViewCalibration)).map(({ value }) => value));
  const [notice, setNotice] = useState('');
  const filterActionsRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterPortalRoot = typeof document === 'undefined'
    ? null
    : filterButtonRef.current?.closest('.glass-shell') ?? document.body;
  const filterPanelId = useId();
  const availableReportSections = reportSections.filter(({ value }) => (value !== 'validation' || canViewValidation) && (value !== 'calibration' || canViewCalibration));
  const selectedReportSectionCount = availableReportSections.filter(({ value }) => sections.includes(value)).length;
  useEffect(() => {
    const root = document.documentElement;
    const property = '--report-print-header-time';
    let printing = false;
    let previousValue = '';
    let previousPriority = '';
    const beforePrint = () => {
      if (!printing) {
        previousValue = root.style.getPropertyValue(property);
        previousPriority = root.style.getPropertyPriority(property);
        printing = true;
      }
      const time = new Date().toLocaleString(undefined, {
        year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      root.style.setProperty(property, JSON.stringify(time));
    };
    const afterPrint = () => {
      if (!printing) return;
      if (previousValue) root.style.setProperty(property, previousValue, previousPriority);
      else root.style.removeProperty(property);
      printing = false;
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      afterPrint();
    };
  }, []);
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
    queryKey: ['report-data', role, hatchery, from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<ReportData & { truncated: boolean }> => {
      const tanks = (await api.listTanks()).filter((tank) => tankInHatchery(tank, hatchery));
      if (!tanks.length) {
        return { tanks, readings: [], alerts: [], thresholds: [], advisories: {}, activityLogs: [], calibrationLogs: [], validationRows: [], deviceStatuses: [], truncated: false };
      }
      const [readingGroups, alertGroups, thresholds, activityLogs, calibrationLogs, validationGroups] = await Promise.all([
        Promise.all(tanks.map((tank) => loadAllReadings(api, {
          tankId: tank.id,
          from: manilaStart(from),
          to: manilaEnd(to),
        }))),
        Promise.all(tanks.map((tank) => api.listAlerts(tank.id))),
        api.listThresholds(),
        api.listActivityLogs(),
        canViewCalibration ? api.listCalibrationLogs() : Promise.resolve([]),
        canViewValidation ? Promise.all(tanks.map((tank) => api.listValidationRows(tank.id))) : Promise.resolve([]),
      ]);
      const readings = readingGroups.flatMap(({ rows }) => rows);
      const alerts = alertGroups.flat();
      const validationRows = validationGroups.flat();
      return {
        tanks,
        readings,
        alerts,
        thresholds,
        advisories: {},
        activityLogs,
        calibrationLogs,
        validationRows,
        deviceStatuses: [],
        truncated: readingGroups.some((result) => result.truncated) ||
          alerts.length >= 1000 ||
          activityLogs.length >= 1000 ||
          calibrationLogs.length >= 1000 ||
          validationRows.length >= 1000,
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
  const reportId = useMemo(() => generateReportId(), [from, hatchery, role, sections, selectedTankIds, tankId, to, userName]);
  const model = useMemo(() => {
    if (!dataQuery.data) return null;
    const availableTanks = dataQuery.data.tanks.filter((tank) => tankInHatchery(tank, hatchery));
    const selected = selectedTankIds.filter((id) => availableTanks.some((tank) => tank.id === id));
    const ids = selected.length ? selected : availableTanks.some((tank) => tank.id === tankId) ? [tankId] : availableTanks[0] ? [availableTanks[0].id] : [];
    if (!ids.length) return null;
    const siteData = {
      ...dataQuery.data,
      activityLogs: dataQuery.data.activityLogs.filter((log) => activityInHatchery(log, dataQuery.data!.tanks, hatchery)),
      validationRows: hatchery === 'all' ? dataQuery.data.validationRows : dataQuery.data.validationRows.filter((row) => row.tankId && ids.includes(row.tankId)),
    };
    return buildReport({
      tankIds: ids,
      from: manilaStart(from),
      to: manilaEnd(to),
      sections,
      format: 'pdf',
      generatedBy: { name: userName, role },
    }, siteData, undefined, reportId);
  }, [dataQuery.data, from, hatchery, reportId, role, sections, selectedTankIds, tankId, to, userName]);
  const rows = useMemo((): unknown[][] => {
    if (!model) return [];
    const site = (id: string) => model.tanks.find((tank) => tank.id === id)?.site ?? '';
    if (type === 'readings') return model.rawReadings.map((row) => [site(row.tankId), row.timestamp, row.tankId, row.temperature, row.doMgL, row.ph]);
    if (type === 'alerts') return model.alerts.map((row) => [site(row.tankId), row.createdAt, row.tankId, formatMeasuredParameterLabel(row.parameter), row.value, row.threshold, row.severity, row.status, row.acknowledgedBy ?? '', row.note ?? '']);
    if (type === 'activity') return model.activityLogs.map((row) => [activityHatcheryName(row, model.tanks), row.occurredAt, row.kind, row.type, row.tankId, row.notes, row.operator]);
    if (type === 'calibration') return model.calibrationLogs.map((row) => [site(row.tankId), row.date, row.tankId, formatMeasuredParameterLabel(row.parameter), row.standard, row.before, row.after, row.user, row.nextDue]);
    return model.validationRows.map((row) => [row.tankId ? site(row.tankId) : '', formatMeasuredParameterLabel(row.parameter), row.hydrosenseMean, row.reference, row.error, row.pctError, row.tolerance, row.pass ? 'pass' : 'fail']);
  }, [model, type]);
  const headers: Record<ExportType, string[]> = {
    readings: ['Timestamp (ISO)', 'Tank', 'Temperature °C', 'DO mg/L', 'pH'],
    alerts: ['Created (ISO)', 'Tank', 'Parameter', 'Value', 'Threshold', 'Severity', 'Status', 'Acknowledged by', 'Response note'],
    activity: ['Occurred (ISO)', 'Kind', 'Type', 'Tank / scope', 'Details', 'Operator'],
    calibration: ['Date (ISO)', 'Tank', 'Parameter', 'Standard', 'Before', 'After', 'User', 'Next due (ISO)'],
    validation: ['Parameter', 'HydroSense mean', 'Reference', 'Error', '% error', 'Tolerance', 'Result'],
  };
  const rawReadingsPreview = model?.rawReadings.slice(0, 10) ?? [];

  function toggleFilters() {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setFilterPosition(null);
    setFiltersOpen(true);
  }

  function downloadCsv() {
    if (model) saveReportMetadata(model, 'csv');
    const csv = type === 'activity' && model
      ? activityLogCsv(model.activityLogs, model.tanks)
      : toCsv([['Hatchery', ...headers[type]], ...rows]);
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
            <h2 className="card-title">Export Settings</h2>
            <StaleQueryState updatedAt={dataQuery.dataUpdatedAt} />
          </header>
          <div className={`dash-report-controls${canExport ? '' : ' without-dataset'}`}>
            {canExport && <label className="field">CSV dataset<Select aria-label="CSV dataset" value={type} onChange={(event) => setType(event.target.value as ExportType)}><option value="readings">Raw readings</option><option value="alerts">Alerts</option><option value="activity">Activity logs</option>{canViewCalibration && <option value="calibration">Calibration log</option>}{canViewValidation && <option value="validation">Validation</option>}</Select></label>}
            <label className="field">From<input type="date" value={from} min={minimumDate} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="field">To<input type="date" value={to} min={from} max={maximumDate} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <p className="small muted dash-report-scope-note">CSV includes the selected dataset, tanks, and date range; report sections apply to the preview and PDF.</p>
        </section>
        <section className="card stack dash-card dash-report-result-card">
          <div className="dash-report-result">
            <span className="dash-report-result-label">RECORDS MATCHED</span>
            <div className="dash-report-count">
              <strong>{rows.length}</strong>
              <span>records</span>
            </div>
            <span className="dash-report-date-range">{formatReportRangeDate(from)} → {formatReportRangeDate(to)}</span>
          </div>
          <div className="dash-report-actions" ref={filterActionsRef}>
            <div className="dash-report-status">
              {!dataQuery.isLoading && !dataQuery.isError && !rows.length && <p>No records match this dataset and date range.</p>}
              {notice && <p role="status">{notice}</p>}
            </div>
            <div className={`dash-report-action-buttons${canExport ? ' has-csv' : ''}`}>
              {canExport && <button className="button button-primary button-soft-action" type="button" disabled={!rows.length || dataQuery.isLoading || dataQuery.isError || dataQuery.isFetching} onClick={downloadCsv}><FileDown size={18} aria-hidden="true" />Download CSV</button>}
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
        </section>
        <section className="card stack dash-card dash-report-preview print-preview" aria-labelledby="report-preview-title">
          {dataQuery.data?.truncated && <p className="small muted">Showing the most recent {dataQuery.data.readings.length} readings. Narrow the date range for the full set.</p>}
          <div className="dash-report-preview-header">
            <h2 id="report-preview-title" className="card-title">Report Preview</h2>
            {canExport && model && <button className="button button-primary button-soft-action" type="button" onClick={() => { saveReportMetadata(model, 'pdf'); window.print(); }}><Printer size={18} aria-hidden="true" />Print / Save PDF</button>}
          </div>
          {dataQuery.isLoading || dataQuery.isFetching ? <LoadingState label="Preparing report..." /> : dataQuery.isError ? <ErrorState error={dataQuery.error} onRetry={() => void dataQuery.refetch()} /> : !model ? <EmptyState>No tanks are available for the selected hatchery.</EmptyState> : (
            <div className="dash-report-body">
              <header className="report-print-only report-print-header">
                <div className="report-print-brand">HydroSense</div>
                <h1>Water Quality Report</h1>
                <p>Monitoring results and operational overview</p>
              </header>
              <dl className="dash-report-meta">
                <div><dt>Report ID</dt><dd className="dash-report-id" title={model.id}>{model.id}</dd></div>
                <div><dt>Hatchery</dt><dd>{[...new Set(model.tanks.map((tank) => tank.site))].join(', ')}</dd></div>
                <div><dt>Tanks / period</dt><dd>{model.tanks.map((tank) => tank.name).join(', ')} · {from} to {to} PHT</dd></div>
                <div><dt>Prepared by</dt><dd>{model.generatedBy.name} ({model.generatedBy.role})</dd></div>
                <div><dt>Generated</dt><dd>{formatManilaDateTime(model.generatedAt)} PHT</dd></div>
              </dl>
              {sections.includes('summary') && <section className="dash-report-section"><h2 className="report-print-only report-print-section-title">Executive Summary</h2><p className="dash-report-summary">{model.summary}</p></section>}
              {sections.includes('statistics') && (
                <section className="dash-report-section" aria-label="Report statistics">
                  <h2 className="report-print-only report-print-section-title">Water Quality Statistics</h2>
                  <div className="report-bar-chart" role="img" aria-label={`Readings in range: ${model.statistics.map((row) => `${reportParameterLabels[row.parameter]} ${row.percentInRange === null ? 'no data' : `${row.percentInRange.toFixed(1)}%`}`).join(', ')}`}>
                    <h3>Readings in Range</h3>
                    <p>Percentage of valid readings within the configured thresholds</p>
                    <div className="report-bar-axis" aria-hidden="true">
                      <div><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                    </div>
                    {model.statistics.map((row) => <div className="report-bar-row" key={row.parameter}>
                      <span>{reportParameterLabels[row.parameter]}</span>
                      <div className="report-bar-plot">
                        <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${row.percentInRange ?? 0}%` }} /></div>
                        <div className="report-bar-tooltip" aria-hidden="true">
                          {reportParameterLabels[row.parameter]} · {row.percentInRange === null ? 'No data' : `${row.percentInRange.toFixed(1)}% in range`}
                        </div>
                      </div>
                      <strong>{row.percentInRange === null ? 'No data' : `${row.percentInRange.toFixed(1)}%`}</strong>
                    </div>)}
                  </div>
                  <div className="table-wrap dash-report-table-frame">
                    <table className="dash-report-stats-table">
                      <thead><tr><th scope="col">Parameter</th><th className="table-numeric" scope="col">Min</th><th className="table-numeric" scope="col">Max</th><th className="table-numeric" scope="col">Mean</th><th className="table-numeric" scope="col">Std dev</th><th className="table-numeric" scope="col">In range</th><th className="table-numeric" scope="col">Excursions</th><th className="table-numeric" scope="col">Longest (h)</th></tr></thead>
                      <tbody>
                        {model.statistics.map((row) => <tr key={row.parameter}><td>{reportParameterLabels[row.parameter]}</td><td className="table-numeric">{row.min?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.max?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.mean?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.standardDeviation?.toFixed(2) ?? '—'}</td><td className="table-numeric">{row.percentInRange?.toFixed(1) ?? '—'}%</td><td className="table-numeric">{row.excursions}</td><td className="table-numeric">{row.longestExcursionHours.toFixed(1)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {(sections.includes('alerts') || sections.includes('data-quality') || sections.includes('thresholds') || sections.includes('activity') || sections.includes('calibration') || sections.includes('validation')) && (
                <section className="dash-report-section dash-report-facts-section" aria-label="Report facts">
                  <h2 className="report-print-only report-print-section-title">Operations And Data Quality</h2>
                  <div className="dash-report-facts">
                    {sections.includes('alerts') && <div className="dash-report-fact"><span className="dash-report-fact-label">Alerts</span><p className="dash-report-fact-value">{model.alertCounts.critical} critical · {model.alertCounts.warning} warning · {model.alertCounts.open} open · {model.alertCounts.acknowledged} acknowledged · {model.alertCounts.resolved} resolved</p></div>}
                    {sections.includes('data-quality') && <div className="dash-report-fact"><span className="dash-report-fact-label">Expected readings</span><p className="dash-report-fact-value">Expected {model.dataQuality.expectedReadings} · Received {model.dataQuality.receivedReadings} ({model.dataQuality.receivedPercent.toFixed(1)}%)</p></div>}
                    {sections.includes('thresholds') && <div className="dash-report-fact"><span className="dash-report-fact-label">Thresholds used</span><div className="dash-report-thresholds">{model.thresholds.map((threshold) => <span className="dash-report-threshold-chip" key={threshold.parameter}>{reportParameterLabels[threshold.parameter]} {formatThresholdRange(threshold.min, threshold.max)}</span>)}</div></div>}
                    {sections.includes('activity') && <div className="dash-report-fact"><span className="dash-report-fact-label">Activity logs</span><p className="dash-report-fact-value">{model.activityLogs.length}</p></div>}
                    {sections.includes('calibration') && <div className="dash-report-fact"><span className="dash-report-fact-label">Calibration</span><p className="dash-report-fact-value">{model.calibrationLogs.length}</p></div>}
                    {sections.includes('validation') && <div className="dash-report-fact"><span className="dash-report-fact-label">Validation</span><p className="dash-report-fact-value">{model.validationRows.length}</p></div>}
                  </div>
                </section>
              )}
              {sections.includes('raw-readings') && (
                <section className="dash-report-section">
                  <h2 className="report-print-only report-print-section-title">Reading Sample</h2>
                  <p className="dash-report-raw-caption">Showing first {rawReadingsPreview.length} of {model.rawReadings.length} readings</p>
                  <div className="table-wrap dash-report-table-frame dash-report-raw-readings">
                    <table className="dash-report-raw-table">
                      <thead><tr><th scope="col">Time</th><th scope="col">Tank</th><th className="table-numeric" scope="col">Temp (°C)</th><th className="table-numeric" scope="col">DO (mg/L)</th><th className="table-numeric" scope="col">pH</th></tr></thead>
                      <tbody>
                        {rawReadingsPreview.map((row) => <tr key={row.id}><td>{formatManilaDateTime(row.timestamp, { year: '2-digit', month: 'numeric', day: 'numeric' })}</td><td>{model.tanks.find((tank) => tank.id === row.tankId)?.name ?? row.tankId}</td><td className="table-numeric">{Number.isFinite(row.temperature) ? row.temperature.toFixed(2) : '—'}</td><td className="table-numeric">{Number.isFinite(row.doMgL) ? row.doMgL.toFixed(2) : '—'}</td><td className="table-numeric">{Number.isFinite(row.ph) ? row.ph.toFixed(2) : '—'}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {!canExport && <p className="small muted">Operators may view reports; export is available to managers and administrators.</p>}
            </div>
          )}
        </section>
      </div>
      {filtersOpen && filterPortalRoot && createPortal(
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
                  {(dataQuery.data?.tanks ?? []).filter((tank) => tankInHatchery(tank, hatchery)).map((tank) => (
                    <label className="dash-report-option" key={tank.id}>
                      <input type="checkbox" checked={Boolean(model?.tanks.some((item) => item.id === tank.id))} disabled={model?.tanks.length === 1 && model.tanks[0].id === tank.id} onChange={(event) => setSelectedTankIds(event.target.checked ? [...(model?.tanks.map((item) => item.id) ?? []), tank.id] : (model?.tanks.map((item) => item.id) ?? []).filter((id) => id !== tank.id))} />
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
        filterPortalRoot,
      )}
    </>
  );
}