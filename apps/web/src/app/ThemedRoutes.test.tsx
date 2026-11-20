import { cleanup, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import App from '../App';
import { queryClient } from './query';
import { api } from './api';
import { authService } from '../services/authService';
import * as csvDownload from '../services/downloadCsv';

function render(ui: ReactElement) {
  const result = renderBase(ui);
  const getStarted = screen.queryByRole('button', { name: 'Get Started' });
  if (getStarted) fireEvent.click(getStarted);
  return result;
}

const routes = [
  ['/', 'Live Monitor'],
  ['/tanks', 'Tank Overview & System Health'],
  ['/health', 'Tank Overview & System Health'],
  ['/trends', 'Trends'],
  ['/history', 'Historical Logs'],
  ['/alerts', 'Alerts Center'],
  ['/entries', 'Activity Logs'],
  ['/reports', 'Reports'],
  ['/calibration', 'Calibration & Maintenance'],
  ['/validation', 'Validation View'],
  ['/admin/users', 'Users & Roles'],
  ['/admin/logs', 'Audit & System Logs'],
  ['/profile', 'My Profile'],
] as const;

function signInAs(role: 'operator' | 'manager' | 'admin', phone?: string) {
  const user = {
    id: `test-${role}`,
    firstName: 'Test',
    lastName: role,
    email: `${role}@example.com`,
    role,
    requestedRole: role === 'admin' ? null : role,
    status: 'approved',
    hatcheryId: 'camiguin-sagay',
    phone,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
  window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
  window.localStorage.setItem('hydrosense.theme', 'dark');
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.removeItem('hydrosense.auth.session.v2');
  window.localStorage.removeItem('hydrosense.auth.accounts.v2');
  window.localStorage.removeItem('hydrosense.theme');
});

describe('themed dashboard routes', () => {
  it('displays the fetched profile site rather than a stale session assignment', async () => {
    signInAs('operator');
    vi.spyOn(authService, 'getProfileSite').mockResolvedValue('North Hatchery');
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    expect(await screen.findByText('North Hatchery')).toBeInTheDocument();
  });

  it('reports a profile site fetch failure', async () => {
    signInAs('operator');
    vi.spyOn(authService, 'getProfileSite').mockRejectedValue(new Error('Site lookup failed'));
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    expect(await screen.findByText('Site lookup failed', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it.each(['operator', 'manager', 'admin'] as const)('exposes the %s role on the shell and sidebar', async (role) => {
    if (role !== 'admin') {
      const user = {
        id: `test-${role}`,
        firstName: 'Test',
        lastName: role,
        email: `${role}@example.com`,
        role,
        requestedRole: role,
        status: 'approved',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
      window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    }
    window.history.replaceState({}, '', '/tanks');
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: 'Tank Overview & System Health', level: 1 });
    expect(container.querySelector('.app-shell')?.getAttribute('data-role')).toBe(role);
    expect(screen.queryByText('WATER QUALITY MONITORING')).not.toBeInTheDocument();
    expect(screen.getByText(`${role.toUpperCase()} Workspace`)).toBeInTheDocument();
    expect(screen.queryByText('Days 0–21 · 3-hour sampling')).not.toBeInTheDocument();
    expect(screen.getByText('© 2026 HydroSense')).toBeInTheDocument();
  });

  it.each(routes.flatMap(([path, title]) => (['light', 'dark'] as const).map((theme) => [path, title, theme] as const)))('renders %s in the shared shell (%s, %s)', async (path, title, theme) => {
    window.history.replaceState({}, '', path);
    window.localStorage.setItem('hydrosense.theme', theme);
    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(container.querySelector('.glass-shell .glass-screen')).toBeInTheDocument();
    expect(container.querySelector('main .page-controls')).toBeInTheDocument();
    expect(container.querySelector('.topbar')).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', theme);
  });

  it('keeps the navigation drawer and account controls available in the shared layout', async () => {
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    await screen.findByRole('heading', { name: 'Tank Overview & System Health', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    const accountButton = screen.getByRole('button', { name: /Account menu for/ });
    expect(accountButton).not.toHaveTextContent('DM');
    fireEvent.click(accountButton);
    expect(screen.getByRole('menuitem', { name: 'My Profile' })).toBeInTheDocument();
    const identity = screen.getByText('Dario Minoza').closest('.account-menu-identity');
    if (!identity) throw new Error('Account identity header is missing.');
    expect(identity).toHaveTextContent('Admin');
    expect(identity.compareDocumentPosition(screen.getByRole('menuitem', { name: 'My Profile' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Alert preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Appearance' })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Dashboard controls')).queryByRole('combobox', { name: 'Select tank' })).not.toBeInTheDocument();
  });

  it('combines tank readings and device health in one table', async () => {
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    const table = await screen.findByRole('region', { name: 'Tank overview table' });
    expect(await screen.findByRole('region', { name: 'Data quality' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Battery' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Power' })).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Pending sync' })).toBeInTheDocument();
    expect(screen.queryByText('Tier and integration status')).not.toBeInTheDocument();
  });

  it('keeps the tank table visible when a rearing date is malformed', async () => {
    const listTanks = api.listTanks.bind(api);
    vi.spyOn(api, 'listTanks').mockImplementation(async () => (await listTanks()).map((tank, index) => index === 0 ? { ...tank, rearingStartDate: '11/07/2026' } : tank));
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    const table = await screen.findByRole('region', { name: 'Tank overview table' });
    expect(within(table).getByText('Invalid rearing start date')).toBeInTheDocument();
    expect(within(table).getByText('Larval Tank B')).toBeInTheDocument();
  });

  it('shows at least three open demo notifications', async () => {
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    const button = await screen.findByRole('button', { name: /3 open alerts/ });
    fireEvent.click(button);
    expect(within(screen.getByRole('dialog', { name: 'Current notifications' })).getAllByRole('link').length).toBeGreaterThanOrEqual(4);
  });

  it('adds dismissible activity export notifications that remain when navigating', async () => {
    vi.spyOn(api, 'listActivityLogs').mockResolvedValue([{ id: 'log-1', tankId: 'hatchery', kind: 'OPERATION', type: 'Check', occurredAt: '2026-01-01T00:00:00Z', operator: 'Test', notes: 'Checked' }]);
    const download = vi.spyOn(csvDownload, 'downloadCsv').mockImplementation(() => {});
    window.history.replaceState({}, '', '/entries');
    render(<App />);
    const exportButton = await screen.findByRole('button', { name: 'Export CSV' });
    await waitFor(() => expect(exportButton).toBeEnabled());
    expect(exportButton.querySelector('svg.lucide-file-down')).not.toBeNull();
    expect(exportButton.textContent).toBe('');
    fireEvent.click(exportButton);
    fireEvent.click(exportButton);
    expect(download).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Activity logs exported.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Alerts Center' }));
    await screen.findByRole('heading', { name: 'Alerts Center' });
    fireEvent.click(screen.getByRole('button', { name: /2 export notifications/ }));
    const notifications = screen.getByRole('dialog', { name: 'Current notifications' });
    expect(within(notifications).getAllByText('Activity logs exported.')).toHaveLength(2);
    fireEvent.click(within(notifications).getAllByRole('button', { name: 'Dismiss activity logs export notification' })[0]);
    expect(within(notifications).getAllByText('Activity logs exported.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /1 export notification/ })).toBeInTheDocument();
    fireEvent.click(within(notifications).getByRole('button', { name: 'Dismiss activity logs export notification' }));
    expect(within(notifications).queryByText('Activity logs exported.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export notification/ })).not.toBeInTheDocument();
  });

  it('keeps the tank table available when probe readings are invalid', async () => {
    const getReading = api.getLatestReading.bind(api);
    vi.spyOn(api, 'getLatestReading').mockImplementation(async (tankId) => {
      const reading = await getReading(tankId);
      return reading ? { ...reading, temperature: 126, doMgL: -1, ph: 15 } : null;
    });
    const advisories = vi.spyOn(api, 'listAdvisories').mockRejectedValue(new Error('Check probe'));
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    const table = await screen.findByRole('region', { name: 'Tank overview table' });
    expect(within(table).getAllByText('Check probe').length).toBeGreaterThanOrEqual(3);
    expect(advisories).not.toHaveBeenCalled();
  });

  it.each([
    ['operator', false],
    ['manager', true],
    ['admin', true],
  ] as const)('shows tank management actions for %s according to the matrix', async (role, allowed) => {
    if (role !== 'admin') {
      const user = {
        id: `test-${role}`, firstName: 'Test', lastName: role, email: `${role}@example.com`,
        role, requestedRole: role, status: 'approved', createdAt: '2026-01-01T00:00:00.000Z',
      };
      window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
      window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    }
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    await screen.findByRole('region', { name: 'Tank overview table' });
    expect(Boolean(screen.queryByRole('button', { name: 'Register tank' }))).toBe(allowed);
  });

  it('lets operators access reports without requesting restricted validation data', async () => {
    const user = {
      id: 'test-operator', firstName: 'Test', lastName: 'operator', email: 'operator@example.com',
      role: 'operator', requestedRole: 'operator', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z',
    };
    window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
    window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    const validation = vi.spyOn(api, 'listValidationRows');
    const calibration = vi.spyOn(api, 'listCalibrationLogs');
    window.history.replaceState({}, '', '/reports');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Validation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Calibration log' })).not.toBeInTheDocument();
    expect(validation).not.toHaveBeenCalled();
    expect(calibration).not.toHaveBeenCalled();
  });

  it('does not show the data-quality card on Trends', async () => {
    window.history.replaceState({}, '', '/trends');
    render(<App />);
    await screen.findByRole('heading', { name: 'Trends', level: 1 });
    expect(screen.queryByRole('region', { name: 'Data quality' })).not.toBeInTheDocument();
  });

  it('shows alert summary and response history in the Alerts Center', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const switcher = await screen.findByRole('group', { name: 'Select tank' });
    fireEvent.click(within(switcher).getByRole('button', { name: 'Larval Tank B' }));
    fireEvent.click(screen.getByRole('link', { name: 'Alerts Center' }));
    expect(await screen.findByRole('heading', { name: 'Alerts Center', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Alert summary' })).toBeInTheDocument();
    expect(screen.getByText('Median time to acknowledge')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: 'Acknowledged (1)' }));
    expect(await screen.findByRole('columnheader', { name: 'Date and time (PHT)' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'pH' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'DO' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Temp' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Parameter')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(await screen.findByRole('heading', { name: 'Response history' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Response history' })).toBeInTheDocument();
    expect(await screen.findByText('Alert raised')).toBeInTheDocument();
    expect(await screen.findByText('Acknowledged by Juan Dela Cruz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve alert' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resolution note' }), { target: { value: 'Verified readings are back in range.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }));
    expect(await screen.findByRole('tab', { name: 'Acknowledged (0)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resolved (1)' })).toBeInTheDocument();
  });

  it('allows an open alert to be acknowledged without a note', async () => {
    const acknowledge = vi.spyOn(api, 'acknowledgeAlert');
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'View' }))[0]);
    expect(await screen.findByLabelText('Acknowledgement note (optional)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge alert' }));
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ note: '' })));
  });

  it('reports an activity-log failure without pretending the alert was not resolved', async () => {
    let resolved = false;
    const alert = {
      id: 'partial-resolution', tankId: 'tank-a', parameter: 'ph', value: 9, threshold: '8',
      severity: 'warning', status: 'acknowledged', createdAt: new Date().toISOString(),
    } as const;
    vi.spyOn(api, 'listAlerts').mockImplementation(async () => [{ ...alert, status: resolved ? 'resolved' : 'acknowledged' }]);
    vi.spyOn(api, 'resolveAlert').mockImplementation(async () => {
      resolved = true;
      return { ...alert, status: 'resolved' };
    });
    vi.spyOn(api, 'createActivityLog').mockRejectedValue(new Error('Network unavailable'));
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Acknowledged (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve alert' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resolution note' }), { target: { value: 'Verified readings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The alert was resolved, but its activity log could not be saved: Network unavailable');
    expect(await screen.findByRole('tab', { name: 'Resolved (1)' })).toBeInTheDocument();
  });

  it('groups the selected tank readings and device details', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const readings = await screen.findByRole('region', { name: 'Current water quality' });
    expect(within(readings).getByRole('article', { name: 'Temperature reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'Dissolved oxygen reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'pH reading' })).toBeInTheDocument();
    expect(within(readings).getAllByRole('img', { name: /Current value/ })).toHaveLength(3);
    const device = screen.getByRole('region', { name: 'Device connection' });
    expect(within(device).getByText('Wi-Fi')).toBeInTheDocument();
    expect(within(device).getByText('Last report')).toBeInTheDocument();
    expect(within(device).getByText('Pending sync')).toBeInTheDocument();
    expect(within(device).queryByText('Battery')).not.toBeInTheDocument();
  });

  it('updates the live reading summary and tank selection from the measured values', async () => {
    vi.spyOn(api, 'getLatestReading').mockImplementation(async (tankId) => ({
      id: `${tankId}-reading`, tankId, timestamp: new Date().toISOString(),
      temperature: tankId === 'tank-a' ? 28 : 35, doMgL: 6, ph: 7,
    }));
    window.history.replaceState({}, '', '/');
    render(<App />);
    const switcher = await screen.findByRole('group', { name: 'Select tank' });
    expect(await screen.findByText('Larval Tank A readings are within the configured ranges')).toBeInTheDocument();
    expect(within(switcher).getByRole('button', { name: 'Larval Tank A' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(switcher).getByRole('button', { name: 'Larval Tank B' }));
    expect(await screen.findByText('Larval Tank B has readings that need attention')).toBeInTheDocument();
    expect(within(switcher).getByRole('button', { name: 'Larval Tank B' })).toHaveAttribute('aria-pressed', 'true');
    const summary = screen.getByRole('region', { name: 'Current reading status' });
    expect(within(summary).getByRole('link', { name: 'Activity Logs' })).toHaveAttribute('href', '/entries');
    expect(within(summary).getByRole('link', { name: 'View trends' })).toHaveAttribute('href', '/trends');
    expect(screen.getByRole('region', { name: 'Recent alerts' })).toBeInTheDocument();
  });

  it('retains the page heading when no tank is available', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([]);
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('No tank or reading is available. Check the tank selector and device status.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live Monitor', level: 1 })).toBeInTheDocument();
  });

  it('does not present stale or invalid readings as water-quality alerts', async () => {
    vi.spyOn(api, 'getLatestReading').mockResolvedValue({
      id: 'invalid', tankId: 'tank-a', timestamp: new Date(Date.now() - 7 * 3_600_000).toISOString(),
      temperature: 126, doMgL: 2, ph: 7,
    });
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText(/Offline, last reading 7 h ago/)).toBeInTheDocument();
    const readings = screen.getByRole('region', { name: 'Current water quality' });
    expect(within(readings).getByText('Check probe')).toBeInTheDocument();
    expect(within(readings).queryByText('Critical')).not.toBeInTheDocument();
    expect(screen.getByText('Reading status unavailable while offline')).toBeInTheDocument();
  });

  it.each(['operator', 'manager', 'admin'] as const)('shows profile sections and unavailable actions for %s', async (role) => {
    signInAs(role, '+639175550100');
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'tank-one-id', name: 'Tank 01', site: 'Camiguin, Sagay Multispecies Hatchery', rearingStartDate: '2026-01-01', deviceId: 'HS-001' },
      { id: 'tank-two-id', name: 'Tank 02', site: 'Camiguin, Sagay Multispecies Hatchery', rearingStartDate: '2026-01-01', deviceId: 'HS-002' },
    ]);
    window.history.replaceState({}, '', '/profile');
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: 'My Profile', level: 1 });
    expect(Array.from(container.querySelectorAll('.profile-layout > section')).map((section) => section.id))
      .toEqual(['profile', 'alerts', 'appearance', 'device-maintenance']);
    for (const name of ['Profile', 'Alert notifications', 'Appearance', 'Device maintenance']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('switch', { name: 'SMS alerts' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Email alerts' })).toBeDisabled();
    expect(screen.queryByText(/valid for sms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phone on file:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Email on file:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change password' }).closest('.profile-group')).toHaveAttribute('aria-labelledby', 'profile-details-title');
    expect(screen.queryByText('Select a hatchery to view its Tank 01 device.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out other devices' })).not.toBeInTheDocument();
    if (role === 'operator') {
      expect(screen.getByRole('button', { name: 'Request calibration' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Request reboot' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Reboot device' })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('button', { name: 'Reboot device' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Request calibration' })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Request a change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Choose how HydroSense appears on this device.')).not.toBeInTheDocument();
    const appearance = screen.getByRole('region', { name: 'Appearance' });
    expect(within(appearance).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['light', 'dark']);
    expect(within(appearance).queryByRole('radio', { name: 'System' })).not.toBeInTheDocument();
    expect(within(appearance).getByRole('radio', { name: 'Light' })).not.toHaveAccessibleDescription();
    expect(within(appearance).getByRole('radio', { name: 'Dark' })).not.toHaveAccessibleDescription();
    expect(within(appearance).queryByText(/background/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Coming soon:/)).not.toBeInTheDocument();
    const maintenance = screen.getByRole('region', { name: 'Device maintenance' });
    if (role === 'admin') {
      fireEvent.click(await within(maintenance).findByRole('combobox', { name: 'Hatchery' }));
      fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Sagay Multispecies Hatchery' }));
    }
    const tankSelect = await within(maintenance).findByLabelText('Tank');
    fireEvent.click(tankSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Tank 01' }));
    expect(tankSelect).toHaveTextContent('Tank 01');
    expect(within(maintenance).queryByText('tank-one-id')).not.toBeInTheDocument();
    expect(within(maintenance).queryByText('HS-001')).not.toBeInTheDocument();
    expect(within(maintenance).queryByText(/reboot action/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Active Sessions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it.each(['not a phone', ''] as const)('does not show SMS validation text for %s', async (phone) => {
    signInAs('operator', phone);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    await screen.findByRole('region', { name: 'Alert notifications' });
    expect(screen.queryByText(/valid for sms/i)).not.toBeInTheDocument();
  });

  it('offers only the backend Tank 01 for maintenance selection', async () => {
    signInAs('admin');
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'tank-one-id', name: 'Tank 01', site: 'Camiguin, Sagay Multispecies Hatchery', rearingStartDate: '2026-01-01', deviceId: 'HS-001' },
      { id: 'tank-two-id', name: 'Tank 02', site: 'Camiguin, Sagay Multispecies Hatchery', rearingStartDate: '2026-01-01', deviceId: 'HS-002' },
    ]);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    const maintenance = await screen.findByRole('region', { name: 'Device maintenance' });
    fireEvent.click(await within(maintenance).findByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: /Camiguin/ }));
    const tankSelect = await within(maintenance).findByRole('combobox', { name: 'Tank' });
    fireEvent.click(tankSelect);
    expect(screen.getByRole('option', { name: 'Tank 01' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tank 02' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Tank 01' }));
    expect(tankSelect).toHaveTextContent('Tank 01');
    expect(within(maintenance).queryByText('HS-001')).not.toBeInTheDocument();
  });

  it.each(['/settings', '/settings/notifications'])('redirects %s to profile', async (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);
    await screen.findByRole('heading', { name: 'My Profile', level: 1 });
    expect(window.location.pathname).toBe('/profile');
    expect(window.location.search).toBe('');
  });

  it.each(['operator', 'manager', 'admin'] as const)('does not expose provisioning for %s on profile or tanks', async (role) => {
    signInAs(role);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    await screen.findByRole('heading', { name: 'My Profile', level: 1 });
    expect(screen.queryByLabelText('Tank ID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wi-Fi password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Tanks & System Health' }));
    await screen.findByRole('heading', { name: 'Tank Overview & System Health', level: 1 });
    expect(screen.queryByLabelText('Tank ID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wi-Fi password')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Sessions')).not.toBeInTheDocument();
  });

  it('guards calibration from operators and permits managers', async () => {
    signInAs('operator');
    window.history.replaceState({}, '', '/calibration');
    const rendered = render(<App />);
    await screen.findByRole('heading', { name: 'Live Monitor', level: 1 });
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Calibration' })).not.toBeInTheDocument();
    rendered.unmount();
    queryClient.clear();
    signInAs('manager');
    window.history.replaceState({}, '', '/calibration');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Calibration & Maintenance', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calibration' })).toBeInTheDocument();
  });

  it('guards the legacy thresholds route from operators', async () => {
    signInAs('operator');
    window.history.replaceState({}, '', '/settings/thresholds');
    render(<App />);
    await screen.findByRole('heading', { name: 'Live Monitor', level: 1 });
    expect(window.location.pathname).toBe('/');
  });

  it('scrolls to profile hash targets on load', async () => {
    const scroll = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      window.history.replaceState({}, '', '/profile#alerts');
      render(<App />);
      await screen.findByRole('heading', { name: 'My Profile', level: 1 });
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.instances[0]).toBe(document.getElementById('alerts'));
    } finally {
      HTMLElement.prototype.scrollIntoView = previous;
    }
  });

  it('keeps pending review and team accounts accessible', async () => {
    const request = {
      id: 'pending-test', firstName: 'Test', lastName: 'User', email: 'test@example.com',
      role: null, requestedRole: null, status: 'pending', createdAt: '2026-01-01T00:00:00Z',
    } as const;
    vi.spyOn(authService, 'listPendingRequests').mockResolvedValue([request]);
    const approve = vi.spyOn(authService, 'approveRequest').mockResolvedValue({ ...request, role: 'manager', status: 'approved' });
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const pending = await screen.findByRole('region', { name: 'Pending requests' });
    expect(await within(pending).findByText('1 pending')).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('combobox', { name: 'Review role for Test User' }));
    fireEvent.click(screen.getByRole('option', { name: 'Manager' }));
    fireEvent.click(within(pending).getByRole('button', { name: 'Approve Test User' }));
    const confirmation = screen.getByRole('dialog', { name: 'Approve account request?' });
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Approve request' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('pending-test', 'manager'));
    const team = screen.getByRole('region', { name: 'Team accounts' });
    expect(await within(team).findByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(within(team).queryByRole('combobox', { name: 'Role for Juan Dela Cruz' })).not.toBeInTheDocument();
  });

  it('keeps the accounts table when search has no matches', async () => {
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const accountName = await screen.findByText('Juan Dela Cruz');
    const table = accountName.closest('table')!;
    fireEvent.change(screen.getAllByRole('searchbox', { name: /Search accounts in/ })[0], { target: { value: 'zzzz-no-match' } });
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    expect(within(table).getByText('No accounts match your search.')).toBeInTheDocument();
    expect(within(table).queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
  });

  it('confirms account removal by name', async () => {
    const remove = vi.spyOn(authService, 'removeAccount').mockRejectedValue(new Error('Removal failed'));
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const accountName = await screen.findByText('Juan Dela Cruz');
    const row = accountName.closest('tr');
    expect(row).not.toBeNull();
    const removeButton = within(row!).getByRole('button', { name: 'Remove account' });
    fireEvent.click(removeButton);
    const confirmation = screen.getByRole('dialog', { name: 'Remove account?' });
    expect(within(confirmation).getByText('Are you sure you want to remove "Juan Dela Cruz"?')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove account' }));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(await screen.findByText('Removal failed')).toBeInTheDocument();
  });

  it.each(['admin', 'manager'] as const)('does not show enterprise features for %s', async (role) => {
    signInAs(role);
    window.history.replaceState({}, '', '/');
    render(<App />);
    await screen.findByRole('heading', { name: 'Live Monitor', level: 1 });
    expect(screen.queryByRole('region', { name: 'Enterprise features' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Multi-site fleet|Batch tracking/ })).not.toBeInTheDocument();
  });

  it.each(['/fleet', '/batch'])('redirects removed route %s to the home page', async (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Live Monitor', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('opens the selected activity form without duplicate kind buttons', async () => {
    window.history.replaceState({}, '', '/entries');
    render(<App />);
    await screen.findByRole('heading', { name: 'Activity Logs' });
    fireEvent.click(screen.getByRole('button', { name: 'Log operation' }));
    let dialog = screen.getByRole('dialog', { name: 'Log hatchery operation' });
    expect(within(dialog).getByLabelText('Operation type')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Operation' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Weather / event' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log weather / event' }));
    dialog = screen.getByRole('dialog', { name: 'Log weather or event' });
    expect(within(dialog).getByLabelText('Event type')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Observed impact')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Operation' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Weather / event' })).not.toBeInTheDocument();
  });
});

describe('themed authentication routes', () => {
  const authRoutes = [
    ['/signin', 'Welcome Back'],
    ['/signup', 'Request an account'],
    ['/forgot-password', 'Reset your password'],
    ['/pending-approval', 'Request submitted'],
  ] as const;
  it.each(authRoutes.flatMap(([path, title]) => (['light', 'dark'] as const).map((theme) => [path, title, theme] as const)))('renders %s with glass (%s, %s)', async (path, title, theme) => {
    window.localStorage.removeItem('hydrosense.auth.session.v2');
    window.localStorage.setItem('hydrosense.theme', theme);
    window.history.replaceState({}, '', path);
    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(container.querySelector('.auth-background .glass-panel')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', theme);
  });

  it.each(['/signin', '/signup'])('shows the mobile-style brand on %s', async (path) => {
    window.localStorage.removeItem('hydrosense.auth.session.v2');
    window.history.replaceState({}, '', path);
    const { container } = render(<App />);
    const header = container.querySelector('.auth-header--branded');
    expect(await screen.findByText('WATER QUALITY MONITORING')).toBeInTheDocument();
    expect(header).toHaveTextContent('HydroSense');
    expect(header?.querySelector('img')).toHaveAttribute('src', '/assets/logos/hydrosense-logo.png');
  });
});
