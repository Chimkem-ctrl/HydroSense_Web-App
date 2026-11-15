import type { ReactNode } from 'react';

interface ToggleSwitchProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  disabled?: boolean;
}

export default function ToggleSwitch({
  label,
  checked,
  onChange,
  id,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <div className="settings-row">
      <label className="settings-row-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="toggle-switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
