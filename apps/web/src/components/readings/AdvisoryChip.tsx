import { HelpCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { AdvisoryState } from '@hydrosense/shared';
import { AdvisoryEvidence } from './AdvisoryEvidence';

const levelLabel = { low: 'Low', watch: 'Watch', high: 'High' } as const;
const kindLabel = { salinity: 'Salinity', ammonia: 'Ammonia' } as const;

export function AdvisoryChip({ advisory, tankId }: { advisory: AdvisoryState; tankId: string }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'above' | 'below'>('below');
  const [popoverMaxHeight, setPopoverMaxHeight] = useState<number>();
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailId = useId();
  const cancelScheduledClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = (event: MouseEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && (button.current?.contains(nextTarget) || popover.current?.contains(nextTarget))) {
      cancelScheduledClose();
      return;
    }
    cancelScheduledClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, 120);
  };
  const togglePopover = () => {
    cancelScheduledClose();
    if (!open) {
      const trigger = button.current?.getBoundingClientRect();
      if (trigger) {
        const gap = 8;
        const availableAbove = Math.max(0, trigger.top - gap);
        const availableBelow = Math.max(0, window.innerHeight - trigger.bottom - gap);
        const nextPlacement = availableBelow >= availableAbove ? 'below' : 'above';
        const availableSpace = nextPlacement === 'below' ? availableBelow : availableAbove;
        setPlacement(nextPlacement);
        setPopoverMaxHeight(Math.min(480, window.innerHeight * 0.65, availableSpace));
      }
    }
    setOpen((value) => !value);
  };
  useEffect(() => () => cancelScheduledClose(), []);
  return (
    <div className={`advisory-wrap${open ? ` is-open is-${placement}` : ''}`} onKeyDown={(event) => {
        if (event.key === 'Escape' && open) { setOpen(false); button.current?.focus(); }
      }}
    >
      <button
        ref={button}
        type="button"
        className={`advisory-chip advisory-${advisory.level}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? detailId : undefined}
        aria-label={`Advisory · ${kindLabel[advisory.kind]} · ${levelLabel[advisory.level]}`}
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleClose}
        onClick={togglePopover}
      >
        <span className="advisory-dot" aria-hidden="true" />
        <span>{kindLabel[advisory.kind]} · {levelLabel[advisory.level]}</span>
        <HelpCircle size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popover}
          id={detailId}
          className="popover advisory-popover"
          style={{ maxHeight: popoverMaxHeight }}
          role="dialog"
          tabIndex={0}
          aria-label={`Why ${kindLabel[advisory.kind]} advisory is ${levelLabel[advisory.level]}`}
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={scheduleClose}
        >
          <strong>Why this level?</strong>
          {advisory.kind === 'salinity' && <p>Reference target: 28–33 ppt. This target is not a sensor measurement.</p>}
          <p>{advisory.firedRule}</p>
          <dl>
            {Object.entries(advisory.inputs).map(([key, value]) => (
              <span key={key} style={{ display: 'contents' }}><dt>{key}</dt><dd>{value}</dd></span>
            ))}
          </dl>
          <small className="muted">Advisory only — not a sensor measurement.</small>
          <AdvisoryEvidence tankId={tankId} kind={advisory.kind} />
        </div>
      )}
    </div>
  );
}
