import { X } from 'lucide-react';

export function ConfirmActionDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="dialog-backdrop confirm-action-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !disabled) onCancel();
    }}>
      <section className="dialog card stack confirm-action-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
        <header className="confirm-action-heading">
          <h2 id="confirm-action-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Close confirmation" disabled={disabled} onClick={onCancel}><X size={18} /></button>
        </header>
        <p>{message}</p>
        <div className="confirm-action-actions">
          <button type="button" className="button" disabled={disabled} onClick={onCancel}>Cancel</button>
          <button type="button" className="button button-danger" disabled={disabled} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
