import { useTheme } from '../../app/ThemeContext';
import type { ThemeChoice } from '../../app/ThemeContext';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearancePanel() {
  const { choice, setChoice } = useTheme();
  return (
    <section id="appearance" className="card profile-preferences" aria-labelledby="appearance-title">
      <div className="profile-panel-heading"><h2 id="appearance-title">Appearance</h2></div>
      <fieldset className="profile-theme">
        <legend className="sr-only">Theme</legend>
        <div className="profile-options">
          {OPTIONS.map(({ value, label }) => (
            <label key={value} className={`check-row${choice === value || (choice === 'system' && document.documentElement.dataset.theme === value) ? ' is-selected' : ''}`}>
              <input type="radio" name="theme" value={value} checked={choice === value || (choice === 'system' && document.documentElement.dataset.theme === value)} onChange={() => setChoice(value)} aria-labelledby={`theme-${value}-label`} />
              <span className="profile-option-copy">
                <span id={`theme-${value}-label`}>{label}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}