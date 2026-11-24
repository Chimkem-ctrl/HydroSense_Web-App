import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { formatManilaDateTime, formatMeasuredParameterLabel } from '@hydrosense/shared';
import type { AlertItem, Tank } from '@hydrosense/shared';
import { tankLabel } from '../../app/tank/tankLabel';

export function CriticalAlertModal({ alerts, tanks, onView }: { alerts: AlertItem[]; tanks: Tank[]; onView: (tankId: string) => void }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const visible = alerts.some((alert) => !dismissedIds.has(alert.id));

  useEffect(() => {
    if (visible) linkRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    setDismissedIds(new Set(alerts.map((alert) => alert.id)));
  }

  return (
    <div className="critical-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section className="critical-modal" role="alertdialog" aria-modal="true" aria-labelledby="critical-alert-title" aria-describedby="critical-alert-desc">
        <span className="critical-modal-icon"><AlertTriangle size={24} aria-hidden="true" /></span>
        <h2 id="critical-alert-title">Critical Alert{alerts.length === 1 ? '' : 's'}</h2>
        <p id="critical-alert-desc">{alerts.length} open critical {alerts.length === 1 ? 'alert needs' : 'alerts need'} attention.</p>
        <ul className="critical-modal-list">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <p><b>{formatMeasuredParameterLabel(alert.parameter)}</b> is at <b>{alert.value}</b> in {tankLabel(tanks.find((tank) => tank.id === alert.tankId)?.name)}. Threshold: {alert.threshold}.</p>
              <p className="critical-modal-meta">Raised {formatManilaDateTime(alert.createdAt)} PHT</p>
            </li>
          ))}
        </ul>
        <Link ref={linkRef} to="/alerts" state={{ showOpenAlerts: true }} className="button button-primary critical-modal-action" onClick={() => { dismiss(); onView(alerts[0].tankId); }}>
          View on Alerts
        </Link>
      </section>
    </div>
  );
}
