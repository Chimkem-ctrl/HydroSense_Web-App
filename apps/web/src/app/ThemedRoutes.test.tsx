import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { queryClient } from './query';
import { api } from './api';
import { authService } from '../services/authService';

const routes = [
  ['/', 'Live monitor'],
  ['/tanks', 'Tank overview & system health'],
  ['/health', 'Tank overview & system health'],
  ['/trends', 'Trends'],
  ['/history', 'Historical logs'],
  ['/alerts', 'Alerts center'],
  ['/entries', 'Activity logs'],
  ['/reports', 'Export reports'],
  ['/calibration', 'Calibration & maintenance'],
  ['/validation', 'Validation view'],
  ['/settings/thresholds', 'Thresholds & advisory rules'],
  ['/admin/users', 'Users & roles'],
  ['/admin/logs', 'Audit & system logs'],
  ['/profile', 'My profile'],
  ['/fleet', 'Multi-site fleet view · Coming soon'],
  ['/batch', 'Batch tracking · Coming soon'],
] as const;

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
    await screen.findByRole('heading', { name: 'Tank overview & system health', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }));
    expect(screen.getByRole('menuitem', { name: 'My profile' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select tank' })).toBeInTheDocument();
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
    window.history.replaceState({}, '', '/reports');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Export reports' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Validation' })).not.toBeInTheDocument();
    expect(validation).not.toHaveBeenCalled();
  });

  it('does not show the data-quality card on Trends', async () => {
    window.history.replaceState({}, '', '/trends');
    render(<App />);
    await screen.findByRole('heading', { name: 'Trends', level: 1 });
    expect(screen.queryByRole('region', { name: 'Data quality' })).not.toBeInTheDocument();
  });

  it('shows alert summary and response history in the Alerts Center', async () => {
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Alerts center', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Alert summary' })).toBeInTheDocument();
    expect(screen.getByText('Median time to acknowledge')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Select tank' }), { target: { value: 'tank-b' } });
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
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
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

  it('groups the selected tank readings, advisories and device details', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const readings = await screen.findByRole('region', { name: 'Current water quality' });
    expect(within(readings).getByRole('article', { name: 'Temperature reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'Dissolved oxygen reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'pH reading' })).toBeInTheDocument();
    expect(within(readings).getAllByRole('img', { name: /Current value/ })).toHaveLength(3);
    const advisories = await screen.findByRole('region', { name: 'Water-quality advisories' });
    expect(within(advisories).getByRole('heading', { name: 'Salinity risk' })).toBeInTheDocument();
    expect(within(advisories).getByRole('heading', { name: 'Ammonia risk' })).toBeInTheDocument();
    expect(within(advisories).getByText(/No salinity advisory rule fired/)).toBeInTheDocument();
    const advisory = within(advisories).getByRole('button', { name: /Advisory · Salinity/ });
    fireEvent.click(advisory);
    expect(advisory).toHaveAttribute('aria-expanded', 'true');
    expect(within(advisories).getByRole('dialog')).toBeInTheDocument();
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
    expect(within(summary).getByRole('link', { name: 'Activity logs' })).toHaveAttribute('href', '/entries');
    expect(within(summary).getByRole('link', { name: 'View trends' })).toHaveAttribute('href', '/trends');
    expect(screen.getByRole('region', { name: 'Recent alerts' })).toBeInTheDocument();
  });

  it('retains the page heading when no tank is available', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([]);
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('No tank or reading is available. Check the tank selector and device status.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live monitor', level: 1 })).toBeInTheDocument();
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

  it('keeps account settings controls available in their sections', async () => {
    window.history.replaceState({}, '', '/settings');
    render(<App />);
    const profile = await screen.findByRole('region', { name: 'Account profile' });
    const security = screen.getByRole('region', { name: 'Privacy & Security' });
    const devices = screen.getByRole('region', { name: 'Connected Devices' });
    const criticalAlerts = within(profile).getByRole('switch', { name: 'Critical Alerts' });
    expect(criticalAlerts).toBeChecked();
    fireEvent.click(criticalAlerts);
    expect(criticalAlerts).not.toBeChecked();
    expect(within(devices).getByLabelText('Tank ID')).toBeInTheDocument();
    expect(within(devices).getByLabelText('Wi-Fi password')).toHaveAttribute('type', 'password');
    expect(within(security).getByRole('heading', { name: 'Maintenance Actions' })).toBeInTheDocument();
    expect(within(profile).queryByRole('heading', { name: 'Maintenance Actions' })).not.toBeInTheDocument();
    expect(within(security).queryByRole('heading', { name: 'System Log & Data Access' })).not.toBeInTheDocument();
    expect(within(security).queryByRole('switch', { name: 'Share Diagnostic Logs' })).not.toBeInTheDocument();
    expect(within(security).queryByRole('button', { name: /Account Audit Trail/ })).not.toBeInTheDocument();
    fireEvent.click(within(security).getByRole('button', { name: 'Request Calibrate Sensors' }));
    expect(within(security).getByRole('status')).toHaveTextContent('Sensor calibration requested.');
    fireEvent.click(within(security).getByRole('button', { name: 'Request Reboot Hardware Node' }));
    expect(within(security).getByRole('status')).toHaveTextContent('Hardware node reboot requested.');
  });

  it.each(['operator', 'manager'] as const)('shows maintenance instead of system log settings for %s', async (role) => {
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
    window.history.replaceState({}, '', '/settings');
    render(<App />);
    const profile = await screen.findByRole('region', { name: 'Account profile' });
    const security = screen.getByRole('region', { name: 'Privacy & Security' });
    expect(within(security).getByRole('heading', { name: 'Maintenance Actions' })).toBeInTheDocument();
    expect(within(profile).queryByRole('heading', { name: 'Maintenance Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System Log & Data Access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Share Diagnostic Logs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Account Audit Trail/ })).not.toBeInTheDocument();
  });

  it('groups profile details and keeps linked preference tabs functional', async () => {
    window.history.replaceState({}, '', '/profile?tab=alerts');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Alert preferences', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alert preferences' })).toHaveAttribute('aria-selected', 'true');
    const email = screen.getByRole('checkbox', { name: 'Email alerts' });
    expect(email).toBeChecked();
    fireEvent.click(email);
    expect(email).not.toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    for (const name of ['Contact details', 'Role & assignment', 'Emergency contact', 'Account']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(window.location.search).toBe('');
  });

  it('keeps pending review and team role controls accessible', async () => {
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
    const approveButton = within(pending).getByRole('button', { name: 'Approve' });
    expect(approveButton).toBeDisabled();
    fireEvent.change(within(pending).getByRole('combobox', { name: 'Approval role for Test User' }), { target: { value: 'manager' } });
    fireEvent.click(approveButton);
    await waitFor(() => expect(approve).toHaveBeenCalledWith('pending-test', 'manager'));
    const team = screen.getByRole('region', { name: 'Team accounts' });
    expect(await within(team).findByRole('combobox', { name: 'Role for Juan Dela Cruz' })).toBeInTheDocument();
  });

  it('preserves role updates and account removal confirmation', async () => {
    const updateRole = vi.spyOn(api, 'updateUserRole').mockRejectedValue(new Error('Role update failed'));
    const remove = vi.spyOn(authService, 'removeAccount').mockRejectedValue(new Error('Removal failed'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const role = await screen.findByRole('combobox', { name: 'Role for Juan Dela Cruz' });
    fireEvent.change(role, { target: { value: 'manager' } });
    await waitFor(() => expect(updateRole).toHaveBeenCalledWith(expect.any(String), 'manager', expect.any(String)));
    expect(await screen.findByText('Role update failed')).toBeInTheDocument();
    const row = role.closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('button', { name: 'Remove account' }));
    expect(confirm).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['/fleet', '/batch'])('places the heading outside the coming-soon card on %s', async (path) => {
    window.history.replaceState({}, '', path);
    const { container } = render(<App />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.closest('.card')).toBeNull();
    expect(container.querySelector('.coming-soon-page > .page-heading')).toContainElement(heading);
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeInTheDocument();
    expect(screen.getByText('No batch or fleet data is displayed until the feature is implemented.')).toBeInTheDocument();
  });

  it('opens the selected activity form without duplicate kind buttons', async () => {
    window.history.replaceState({}, '', '/entries');
    render(<App />);
    await screen.findByRole('heading', { name: 'Activity logs' });
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
