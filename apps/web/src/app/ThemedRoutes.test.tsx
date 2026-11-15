import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { queryClient } from './query';
import { api } from './api';
import { authService } from '../services/authService';

const routes = [
  ['/', 'Live monitor'],
  ['/tanks', 'Tank overview'],
  ['/health', 'System health'],
  ['/trends', 'Trend charts'],
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

function signInAs(role: 'operator' | 'manager' | 'admin', phone?: string) {
  const user = {
    id: `test-${role}`,
    firstName: 'Test',
    lastName: role,
    email: `${role}@example.com`,
    role,
    requestedRole: role === 'admin' ? null : role,
    status: 'approved',
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
    await screen.findByRole('heading', { name: 'Tank overview', level: 1 });
    expect(container.querySelector('.app-shell')?.getAttribute('data-role')).toBe(role);
    expect(screen.getByText(`Pilot workspace · ${role.toUpperCase()}`)).not.toBeNull();
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
    await screen.findByRole('heading', { name: 'Tank overview', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }));
    expect(screen.getByRole('menuitem', { name: 'My profile' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select tank' })).toBeInTheDocument();
  });

  it('groups the selected tank readings, advisories and device details', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const readings = await screen.findByRole('region', { name: 'Current water quality' });
    expect(within(readings).getByRole('article', { name: 'Temperature reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'Dissolved oxygen reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'pH reading' })).toBeInTheDocument();
    const advisories = await screen.findByRole('region', { name: 'Water-quality advisories' });
    const advisory = within(advisories).getByRole('button', { name: /Advisory · Salinity/ });
    fireEvent.click(advisory);
    expect(advisory).toHaveAttribute('aria-expanded', 'true');
    expect(within(advisories).getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Device connection' })).toBeInTheDocument();
  });

  it('retains the page heading when no tank is available', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([]);
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('No tank or reading is available. Check the tank selector and device status.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live monitor', level: 1 })).toBeInTheDocument();
  });

  it.each(['operator', 'manager', 'admin'] as const)('shows the five profile cards and unavailable actions for %s', async (role) => {
    signInAs(role, '+639175550100');
    window.history.replaceState({}, '', '/profile');
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: 'My profile', level: 1 });
    expect(Array.from(container.querySelectorAll('.profile-layout > section')).map((section) => section.id))
      .toEqual(['profile', 'alerts', 'appearance', 'security', 'device-maintenance']);
    for (const name of ['Profile', 'Alert notifications', 'Appearance', 'Security', 'Device maintenance']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('switch', { name: 'SMS alerts' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Email alerts' })).toBeDisabled();
    expect(screen.getByText('Valid for SMS')).toBeInTheDocument();
    expect(screen.getByText(/Email on file:.*@example.com/)).toBeInTheDocument();
    for (const name of ['Change password', 'Sign out other devices']) expect(screen.getByRole('button', { name })).toBeDisabled();
    if (role === 'operator') {
      expect(screen.getByRole('button', { name: 'Request calibration' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Request reboot' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Reboot device' })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('button', { name: 'Reboot device' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Request calibration' })).not.toBeInTheDocument();
    }
    if (role === 'admin') expect(screen.queryByRole('button', { name: 'Request a change' })).not.toBeInTheDocument();
    else expect(screen.getByRole('button', { name: 'Request a change' })).toBeDisabled();
    const maintenance = screen.getByRole('region', { name: 'Device maintenance' });
    expect(await within(maintenance).findByText('Larval Tank A')).toBeInTheDocument();
    expect(within(maintenance).getByText('HS-MF-001')).toBeInTheDocument();
    expect(screen.queryByText('Active Sessions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it.each(['not a phone', ''] as const)('marks invalid or missing SMS numbers', async (phone) => {
    signInAs('operator', phone);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    expect(await screen.findByText('Not valid for SMS')).toBeInTheDocument();
  });

  it('updates device details when the selected tank changes', async () => {
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    const maintenance = await screen.findByRole('region', { name: 'Device maintenance' });
    await within(maintenance).findByText('HS-MF-001');
    fireEvent.change(screen.getByRole('combobox', { name: 'Select tank' }), { target: { value: 'tank-b' } });
    expect(within(maintenance).getByText('Larval Tank B')).toBeInTheDocument();
    expect(within(maintenance).getByText('HS-MF-002')).toBeInTheDocument();
  });

  it.each(['/settings', '/settings/notifications'])('redirects %s to profile', async (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);
    await screen.findByRole('heading', { name: 'My profile', level: 1 });
    expect(window.location.pathname).toBe('/profile');
    expect(window.location.search).toBe('');
  });

  it.each(['operator', 'manager', 'admin'] as const)('does not expose provisioning for %s on profile or tanks', async (role) => {
    signInAs(role);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    await screen.findByRole('heading', { name: 'My profile', level: 1 });
    expect(screen.queryByLabelText('Tank ID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wi-Fi password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Tank overview' }));
    await screen.findByRole('heading', { name: 'Tank overview', level: 1 });
    expect(screen.queryByLabelText('Tank ID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wi-Fi password')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Sessions')).not.toBeInTheDocument();
  });

  it('guards calibration from operators and permits managers', async () => {
    signInAs('operator');
    window.history.replaceState({}, '', '/calibration');
    const rendered = render(<App />);
    await screen.findByRole('heading', { name: 'Live monitor', level: 1 });
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Calibration' })).not.toBeInTheDocument();
    rendered.unmount();
    queryClient.clear();
    signInAs('manager');
    window.history.replaceState({}, '', '/calibration');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Calibration & maintenance', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calibration' })).toBeInTheDocument();
  });

  it('scrolls to profile hash targets on load and account-menu navigation', async () => {
    const scroll = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      window.history.replaceState({}, '', '/profile#alerts');
      render(<App />);
      await screen.findByRole('heading', { name: 'My profile', level: 1 });
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.instances[0]).toBe(document.getElementById('alerts'));
      fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
      expect(window.location.hash).toBe('#appearance');
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll.mock.instances[1]).toBe(document.getElementById('appearance'));
      expect(screen.queryByRole('menuitem', { name: 'Appearance' })).not.toBeInTheDocument();
    } finally {
      HTMLElement.prototype.scrollIntoView = previous;
    }
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
