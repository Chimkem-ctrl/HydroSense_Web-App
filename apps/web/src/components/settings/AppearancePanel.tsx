import { useTheme } from '../../app/ThemeContext';
import type { ThemeChoice } from '../../app/ThemeContext';

const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Match your device setting' },
  { value: 'light', label: 'Light', hint: 'Light background' },
  { value: 'dark', label: 'Dark', hint: 'Dark background, easier to read at night' },
];

export function AppearancePanel() {
  const { choice, setChoice } = useTheme();
  return (
    <section id="appearance" className="card profile-preferences" aria-labelledby="appearance-title">
      <div className="profile-panel-heading"><h2 id="appearance-title">Appearance</h2></div>
      <fieldset className="profile-theme">
        <legend className="sr-only">Theme</legend>
        <div className="profile-options">
          {OPTIONS.map(({ value, label, hint }) => (
            <label key={value} className={`check-row${choice === value ? ' is-selected' : ''}`}>
              <input type="radio" name="theme" value={value} checked={choice === value} onChange={() => setChoice(value)} aria-labelledby={`theme-${value}-label`} aria-describedby={`theme-${value}-hint`} />
              <span className="profile-option-copy">
                <span id={`theme-${value}-label`}>{label}</span>
                <small id={`theme-${value}-hint`}>{hint}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}