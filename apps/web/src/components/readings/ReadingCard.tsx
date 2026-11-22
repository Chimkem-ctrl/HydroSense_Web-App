import { AlertTriangle, Clock3, Info } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { MeasuredParameter, Reading, Threshold } from '@hydrosense/shared';
import { DEFAULT_THRESHOLDS, formatManilaDateTime, formatParameter, getParameterStatus, isValidMeasurement, safeRangeGauge } from '@hydrosense/shared';
import { StatusBadge } from './StatusBadge';

const config: Record<MeasuredParameter, { title: string; unit: string }> = {
  temperature: { title: 'Temperature', unit: '°C' },
  do: { title: 'Dissolved oxygen', unit: 'mg/L' },
  ph: { title: 'pH', unit: 'pH' },
};

export function ReadingCard({ parameter, reading, threshold, showRangeMeter = false, showUpdatedTimestamp = true, stale = false }: { parameter: MeasuredParameter; reading: Reading; threshold?: Threshold; showRangeMeter?: boolean; showUpdatedTimestamp?: boolean; stale?: boolean }) {
  const value = parameter === 'do' ? reading.doMgL : reading[parameter];
  const configuredThreshold = threshold ?? DEFAULT_THRESHOLDS.find((item) => item.parameter === parameter);
  const status = getParameterStatus(parameter, value, configuredThreshold);
  const unit = config[parameter].unit;
  const formattedValue = formatParameter(parameter, value);
  const numericValue = formattedValue.slice(0, -unit.length).trimEnd();
  const min = configuredThreshold?.min;
  const max = configuredThreshold?.max;
  const safeRange = min !== undefined && max !== undefined
    ? `Safe ${min}–${max} ${unit}`
    : min !== undefined
      ? `Safe ≥${min} ${unit}`
      : `Safe ≤${max ?? '—'} ${unit}`;
  const valid = isValidMeasurement(parameter, value);
  const gauge = showRangeMeter && valid && configuredThreshold ? safeRangeGauge(value, configuredThreshold) : null;
  const scaleNote = gauge ? `Display scale ${gauge.scaleMin}–${gauge.scaleMax} ${unit}${value < gauge.scaleMin || value > gauge.scaleMax ? ' · marker at scale edge' : ''}` : '';
  const distance = status.distance.replace('minimum', 'min').replace('maximum', 'max');
  return (
    <article className={`card reading-card${showRangeMeter ? ' glass' : ''}${stale ? ' reading-stale' : ''}`} data-parameter={parameter} aria-label={`${config[parameter].title} reading`}>
      <div className="reading-head">
        <span className="reading-label">{config[parameter].title}</span>
        {!valid ? <span className="badge reading-invalid"><AlertTriangle size={15} aria-hidden="true" />Check probe</span> : stale ? <span className="badge reading-offline"><Clock3 size={15} aria-hidden="true" />Offline</span> : <StatusBadge level={status.level} label={status.label} />}
      </div>
      <strong className="reading-number"><span>{valid ? numericValue : '—'}</span>{' '}<span className="reading-unit">{unit}</span></strong>
      <p className="reading-status">{!valid ? 'Invalid reading excluded' : stale ? 'Last reading; status unavailable' : distance}</p>
      {gauge ? (
        <div className="reading-scale">
          <div className={`reading-scale-track${max === undefined ? ' reading-scale-track-minimum-only' : ''}`} role="img" aria-label={`${safeRange}. Current value ${formatParameter(parameter, value)}`} style={{ '--safe-start': `${gauge.safeStart}%`, '--safe-end': `${gauge.safeEnd}%` } as CSSProperties}>
            <span style={{ left: `${gauge.position}%` }} />
          </div>
          <div className="reading-scale-labels" aria-hidden="true">
            {min !== undefined && <span className={gauge.safeStart === 0 ? 'reading-scale-label-start' : undefined} style={{ left: `${gauge.safeStart}%` }}>{min}</span>}
            {max !== undefined && <span className={gauge.safeEnd === 100 ? 'reading-scale-label-end' : undefined} style={{ left: `${gauge.safeEnd}%` }}>{max}</span>}
          </div>
          <button type="button" className="info-tip" aria-label={scaleNote} title={scaleNote}><Info size={14} aria-hidden="true" /></button>
        </div>
      ) : <p className="reading-caption">{safeRange}</p>}
      {showRangeMeter && showUpdatedTimestamp && <p className="reading-updated">Updated {formatManilaDateTime(reading.timestamp)} PHT</p>}
    </article>
  );
}
