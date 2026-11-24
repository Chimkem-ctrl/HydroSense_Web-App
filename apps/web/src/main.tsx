import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { restoreSessionOnLaunch } from './services/authService';
import './styles/tokens.css';
import './styles/app.css';
import './styles/auth-variables.css';
import './styles/background.css';
import './styles/auth.css';
import './styles/components.css';
import './design-system/tokens.css';
import './design-system/glass.css';
import './styles/glass-screens.css';
import './styles/glass-shell.css';
import './styles/glass-theme.css';
import './styles/ui-fixes.css';
import './styles/dash-layout.css';
import './styles/ui-overhaul.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function start() {
  root.render(<p role="status">Restoring session...</p>);
  try {
    await restoreSessionOnLaunch();
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } catch (error) {
    root.render(<div role="alert">
      <p>Could not restore your session: {error instanceof Error ? error.message : 'Unexpected error.'}</p>
      <button type="button" onClick={() => void start()}>Retry</button>
    </div>);
  }
}

void start();
