import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdvisoryRuleSettings, MeasuredParameter, Threshold } from '@hydrosense/shared';
import { DEFAULT_ADVISORY_RULES, validateAdvisoryRules, validateThresholds } from '@hydrosense/shared';
import { api } from '../app/api';
import { useRole } from '../app/auth/RoleContext';
import { ErrorState, LoadingState } from '../components/common/States';

const parameterNames: Record<MeasuredParameter, string> = { temperature: 'Temperature (°C)', do: 'Dissolved oxygen (mg/L)', ph: 'pH' };
const parameterUnits: Record<MeasuredParameter, string> = { temperature: '°C', do: 'mg/L', ph: 'pH' };
const parameters: MeasuredParameter[] = ['temperature', 'do', 'ph'];

interface ThresholdsPanelProps {
  readOnly?: boolean;
}

export function ThresholdsPanel({ readOnly }: ThresholdsPanelProps) {
  const { userName } = useRole();
  const queryClient = useQueryClient();
  const thresholdsQuery = useQuery({ queryKey: ['thresholds'], queryFn: () => api.listThresholds() });
  const rulesQuery = useQuery({ queryKey: ['advisory-rules'], queryFn: () => api.getAdvisorySettings(), enabled: !readOnly });
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [rules, setRules] = useState<AdvisoryRuleSettings>(DEFAULT_ADVISORY_RULES);
  const [confirm, setConfirm] = useState(false);
  const [issue, setIssue] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      const [savedThresholds, savedRules] = await Promise.all([
        api.updateThresholds(thresholds, userName),
        api.updateAdvisorySettings(rules, userName),
      ]);
      return { savedThresholds, savedRules };
    },
    onSuccess: async ({ savedThresholds, savedRules }) => {
      setThresholds(savedThresholds);
      setRules(savedRules);
      setConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ['thresholds'] });
      await queryClient.invalidateQueries({ queryKey: ['advisory-rules'] });
      await queryClient.invalidateQueries({ queryKey: ['advisories'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
  useEffect(() => {
    if (!thresholdsQuery.data || (!readOnly && !rulesQuery.data)) return;
    setThresholds(thresholdsQuery.data);
    if (rulesQuery.data) setRules(rulesQuery.data);
    setSettingsLoaded(true);
  }, [thresholdsQuery.data, rulesQuery.data, readOnly]);
  useEffect(() => {
    if (!confirm) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirm(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirm]);

  function updateThreshold(parameter: MeasuredParameter, bound: 'min' | 'max', value: string) {
    if (readOnly) return;
    setThresholds((current) => {
      const existing = current.find((item) => item.parameter === parameter) ?? { parameter };
      const number = value === '' ? undefined : Number(value);
      const updated = { ...existing, [bound]: number };
      return [...current.filter((item) => item.parameter !== parameter), updated];
    });
  }

  function save() {
    if (readOnly) return;
    const mapped = Object.fromEntries(parameters.map((parameter) => {
      const item = thresholds.find((threshold) => threshold.parameter === parameter);
      return [parameter, { min: item?.min, max: item?.max }];
    })) as Record<MeasuredParameter, { min?: number; max?: number }>;
    const errors = [...validateThresholds(mapped), ...validateAdvisoryRules(rules)];
    if (errors.length) { setIssue(errors[0].message); setConfirm(false); return; }
    setIssue('');
    setConfirm(true);
  }

  if (thresholdsQuery.isError) return <ErrorState error={thresholdsQuery.error} onRetry={() => void thresholdsQuery.refetch()} />;
  if (!readOnly && rulesQuery.isError) return <ErrorState error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />;
  if (!settingsLoaded) return <LoadingState label="Loading threshold settings..." />;

  const changes: Array<{ label: string; before: number | undefined; after: number | undefined }> = [];
  for (const parameter of parameters) {
    const before = thresholdsQuery.data?.find((item) => item.parameter === parameter);
    const after = thresholds.find((item) => item.parameter === parameter);
    for (const bound of ['min', 'max'] as const) {
      if (before?.[bound] !== after?.[bound]) changes.push({ label: `${parameterNames[parameter]} ${bound === 'min' ? 'minimum' : 'maximum'}`, before: before?.[bound], after: after?.[bound] });
    }
  }
  const ruleLabels: Record<keyof AdvisoryRuleSettings, string> = {
    salinityWatchTemperatureC: 'Salinity watch temperature (°C)',
    salinityHighTemperatureC: 'Salinity high temperature (°C)',
    ammoniaWatchTemperatureC: 'Ammonia watch temperature (°C)',
    ammoniaHighPh: 'Ammonia high pH',
  };
  for (const key of Object.keys(ruleLabels) as Array<keyof AdvisoryRuleSettings>) {
    if (rulesQuery.data?.[key] !== rules[key]) changes.push({ label: ruleLabels[key], before: rulesQuery.data?.[key], after: rules[key] });
  }

  return (
    <>
      <section className="card stack dash-threshold-card">
        <header className="dash-card-header">
          <h2 className="card-title">Measured parameter thresholds</h2>
          {readOnly && <p className="small muted dash-subtitle">Reference values only. Calibration is logged above.</p>}
        </header>
        <div className={readOnly ? 'threshold-table-wrap' : undefined}>
        <div className={`threshold-grid${readOnly ? ' threshold-grid-readonly' : ''}`} role="table" aria-label="Measured parameter thresholds">
          <div className="threshold-grid-header" role="row">
            <span role="columnheader">Parameter</span>
            <span role="columnheader">Minimum</span>
            <span role="columnheader">Maximum</span>
          </div>
          {parameters.map((parameter) => {
            const item = thresholds.find((threshold) => threshold.parameter === parameter);
            return (
              <div className="threshold-grid-row" role="row" key={parameter}>
                <strong role="rowheader">{parameterNames[parameter]}</strong>
                <div role="cell" data-label={readOnly ? 'Minimum' : undefined}>{readOnly ? item?.min === undefined ? <span className="muted">Not set</span> : `${item.min} ${parameterUnits[parameter]}` : <label className="field threshold-grid-field"><span className="sr-only">Minimum</span><input type="number" step="0.1" value={item?.min ?? ''} onChange={(event) => updateThreshold(parameter, 'min', event.target.value)} /></label>}</div>
                <div role="cell" data-label={readOnly ? 'Maximum' : undefined}>{readOnly ? item?.max === undefined ? <span className="muted">Not set</span> : `${item.max} ${parameterUnits[parameter]}` : <label className="field threshold-grid-field"><span className="sr-only">Maximum</span><input type="number" step="0.1" value={item?.max ?? ''} onChange={(event) => updateThreshold(parameter, 'max', event.target.value)} /></label>}</div>
              </div>
            );
          })}
        </div>
        </div>
      </section>
      {!readOnly && <section className="card stack dash-threshold-advisories">
        <header className="dash-card-header">
          <h2 className="card-title">Rule-based advisories (not sensor readings)</h2>
        </header>
        <div className="form-grid advisory-rules-grid">
          <label className="field">Salinity watch temperature (°C)<input type="number" value={rules.salinityWatchTemperatureC} onChange={(event) => setRules((current) => ({ ...current, salinityWatchTemperatureC: Number(event.target.value) }))} /></label>
          <label className="field">Salinity high temperature (°C)<input type="number" value={rules.salinityHighTemperatureC} onChange={(event) => setRules((current) => ({ ...current, salinityHighTemperatureC: Number(event.target.value) }))} /></label>
          <label className="field">Ammonia watch temperature (°C)<input type="number" value={rules.ammoniaWatchTemperatureC} onChange={(event) => setRules((current) => ({ ...current, ammoniaWatchTemperatureC: Number(event.target.value) }))} /></label>
          <label className="field">Ammonia high pH<input type="number" value={rules.ammoniaHighPh} onChange={(event) => setRules((current) => ({ ...current, ammoniaHighPh: Number(event.target.value) }))} /></label>
        </div>
        <button type="button" className="button button-primary dash-save-button" onClick={save}>Review and save</button>
        {issue && <p className="state-error" role="alert">{issue}</p>}
        {mutation.isError && <ErrorState error={mutation.error} />}
      </section>}
      {confirm && <div className="dialog-backdrop"><section className="dialog card stack" role="dialog" aria-modal="true" aria-labelledby="confirm-thresholds">
        <h2 id="confirm-thresholds" className="card-title">Confirm rule changes</h2>
        <p>These thresholds change how measured data is labeled and alerts are evaluated. No equipment will be controlled.</p>
        {changes.length ? <ul>{changes.map((change) => <li key={change.label}>{change.label}: {change.before ?? 'Not set'} → {change.after ?? 'Not set'}</li>)}</ul> : <p>No changes to confirm.</p>}
        <div className="inline"><button className="button" type="button" onClick={() => setConfirm(false)}>Cancel</button><button className="button button-primary" type="button" disabled={mutation.isPending || !changes.length} onClick={() => mutation.mutate()}>Confirm changes</button></div>
      </section></div>}
    </>
  );
}
