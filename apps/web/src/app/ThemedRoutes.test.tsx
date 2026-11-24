import { act, cleanup, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import App from '../App';
import { queryClient } from './query';
import { api } from './api';
import { authService } from '../services/authService';
import * as activityDownload from '../services/downloadCsv';

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
  window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
  window.localStorage.setItem('hydrosense.theme', 'dark');
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.removeItem('hydrosense.auth.session.v2');
  window.localStorage.removeItem('hydrosense.auth.accounts.v2');
  window.localStorage.removeItem('hydrosense.theme');
});

describe('themed dashboard routes', () => {
  it.each([
    ['operator', 'Tank 01', '01'],
    ['manager', 'TANK 2', '02'],
    ['admin', 'Tank 01', '01'],
  ] as const)('shows the tank number in critical alerts for %s', async (role, tankName, number) => {
    signInAs(role);
    vi.spyOn(authService, 'getProfileSite').mockResolvedValue('Sagay');
    vi.spyOn(api, 'listTanks').mockResolvedValue([{ id: 'internal-tank-uuid', name: tankName, site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device' }]);
    vi.spyOn(api, 'listAlerts').mockResolvedValue([{
      id: 'alert', tankId: 'internal-tank-uuid', parameter: 'ph', value: 4.2, threshold: '7–8', severity: 'critical', status: 'open', createdAt: new Date().toISOString(),
    }]);
    window.history.replaceState({}, '', '/history');
    render(<App />);
    const alert = await screen.findByRole('alertdialog', { name: 'Critical Alert' });
    expect(alert).toHaveTextContent('4.2');
    expect(alert).toHaveTextContent('7–8');
    expect(alert).toHaveTextContent(`in ${number}.`);
    expect(alert).not.toHaveTextContent('internal-tank-uuid');
  });

  it('lists critical alerts together and opens the relevant tank in Alerts Center without acknowledging', async () => {
    signInAs('admin');
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'a', name: 'Tank 01', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device-a' },
      { id: 'b', name: 'Tank 2', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device-b' },
    ]);
    const now = new Date().toISOString();
    const alerts = [
      { id: 'b-ph', tankId: 'b', parameter: 'ph', value: 4.2, threshold: '7–8', severity: 'critical' as const, status: 'open' as const, createdAt: now },
      { id: 'a-do', tankId: 'a', parameter: 'do', value: 2, threshold: '>5', severity: 'critical' as const, status: 'open' as const, createdAt: now },
    ];
    vi.spyOn(api, 'listAlerts').mockImplementation(async (id) => id ? alerts.filter((alert) => alert.tankId === id) : alerts);
    const acknowledge = vi.spyOn(api, 'acknowledgeAlert');
    window.history.replaceState({}, '', '/history');
    render(<App />);
    const dialog = await screen.findByRole('alertdialog', { name: 'Critical Alerts' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect(dialog).toHaveTextContent('in 02.');
    expect(dialog).toHaveTextContent('in 01.');
    expect(within(dialog).queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('link', { name: 'View on Alerts' }));
    expect(await screen.findByRole('heading', { name: 'Alerts Center' })).toBeInTheDocument();
    expect(await screen.findByText('Tank 2 · All dates')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(acknowledge).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('tab', { name: 'Acknowledged (0)' }));
    act(() => queryClient.setQueryData(['alerts', 'all'], [...alerts, { ...alerts[0], id: 'new-alert' }]));
    const newDialog = await screen.findByRole('alertdialog', { name: 'Critical Alerts' });
    fireEvent.click(within(newDialog).getByRole('link', { name: 'View on Alerts' }));
    expect(await screen.findByRole('tab', { name: 'Open (1)', selected: true })).toBeInTheDocument();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it.each(['operator', 'manager', 'admin'] as const)('shows the shared welcome on the %s dashboard', async (role) => {
    signInAs(role);
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText(`Welcome, Test ${role}`)).toHaveClass('live-greeting');
    expect(screen.getByRole('heading', { name: 'Live Monitor' })).toBeInTheDocument();
  });

  it('labels the chart download menu by chart and exposes its formats', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    signInAs('admin');
    window.history.replaceState({}, '', '/trends');
    render(<App />);
    const trigger = await screen.findByRole('button', { name: 'Download Temperature' });
    expect(trigger).toHaveAttribute('title', 'Download Temperature');
    expect(trigger.querySelector('svg')).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const menu = screen.getByRole('group', { name: 'Temperature download formats' });
    expect(within(menu).getByRole('button', { name: 'Image (PNG)' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'CSV' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('labels the chart zoom icons by action and chart', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    signInAs('admin');
    window.history.replaceState({}, '', '/trends');
    render(<App />);
    const zoomIn = await screen.findByRole('button', { name: 'Zoom in Temperature' });
    for (const [name, title] of [
      ['Zoom in Temperature', 'Zoom in'],
      ['Zoom out Temperature', 'Zoom out'],
      ['Reset zoom Temperature', 'Reset zoom'],
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('title', title);
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.textContent).toBe('');
      expect(button.parentElement).toBe(zoomIn.parentElement);
    }
  });

  it('navigates historical readings with labelled arrow buttons', async () => {
    vi.spyOn(api, 'listReadings').mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({
      id: `reading-${index}`, tankId: 'tank-1', timestamp: new Date().toISOString(), temperature: 27, doMgL: 5, ph: 7,
    })));
    window.history.replaceState({}, '', '/history');
    render(<App />);
    const pages = await screen.findByRole('navigation', { name: 'Historical log pages' });
    expect(within(pages).getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(within(pages).getByRole('button', { name: 'Next' }));
    expect(within(pages).getByText('Page 2 of 2')).toHaveAttribute('aria-current', 'page');
    expect(within(pages).getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(within(pages).getByRole('button', { name: 'Previous' }));
    expect(within(pages).getByText('Page 1 of 2')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('combobox', { name: 'Parameter' }));
    fireEvent.click(screen.getByRole('option', { name: 'pH' }));
    expect(screen.getByRole('combobox', { name: 'Parameter' })).toHaveTextContent('pH');
  });

  it.each([
    ['Tank 01', '01'],
    ['TANK 2', '02'],
    ['Tank 10', '10'],
    ['Larval Tank A', 'Larval Tank A'],
  ])('shows %s as %s in historical logs without changing the tank identifier', async (name, display) => {
    const id = '00000000-0000-0000-0000-000000000001';
    vi.spyOn(api, 'listTanks').mockResolvedValue([{ id, name, site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device' }]);
    const readings = vi.spyOn(api, 'listReadings').mockResolvedValue([{
      id: 'reading', tankId: id, timestamp: new Date().toISOString(), temperature: 27, doMgL: 5, ph: 7,
    }]);
    window.history.replaceState({}, '', '/history');
    render(<App />);
    expect(await screen.findByRole('cell', { name: display })).toBeInTheDocument();
    expect(readings).toHaveBeenCalledWith(expect.objectContaining({ tankId: id }));
  });

  it('resets historical pagination when the header hatchery changes', async () => {
    signInAs('admin');
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 's', name: 'Sagay tank', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 's' },
      { id: 'b', name: 'Benoni tank', site: 'Benoni', rearingStartDate: '2026-01-01', deviceId: 'b' },
    ]);
    vi.spyOn(api, 'listReadings').mockImplementation(async (query) => Array.from({ length: query?.tankId === 's' ? 21 : 1 }, (_, index) => ({
      id: `${query?.tankId}-${index}`, tankId: query?.tankId ?? '', timestamp: new Date().toISOString(), temperature: 27, doMgL: 5, ph: 7,
    })));
    window.history.replaceState({}, '', '/history');
    render(<App />);
    const pages = await screen.findByRole('navigation', { name: 'Historical log pages' });
    fireEvent.click(within(pages).getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Historical log pages' })).toHaveTextContent('1'));
    expect(screen.getByRole('cell', { name: 'Benoni tank' })).toBeInTheDocument();
  });

  it('filters admin activity records and CSV by hatchery and hides worker actions', async () => {
    const now = new Date().toISOString();
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 's', name: 'Sagay tank', site: 'Sagay Hatchery', rearingStartDate: '2026-01-01', deviceId: 's' },
      { id: 'b', name: 'Benoni tank', site: 'Benoni Hatchery', rearingStartDate: '2026-01-01', deviceId: 'b' },
    ]);
    vi.spyOn(api, 'listActivityLogs').mockResolvedValue([
      { id: 's', tankId: 'hatchery', kind: 'ENVIRONMENT', type: 'Sagay event', occurredAt: now, operator: 'S', notes: '' },
      { id: 'b', tankId: 'hatchery', hatcheryId: 'camiguin-benoni', kind: 'ENVIRONMENT', type: 'Benoni event', occurredAt: now, operator: 'B', notes: '' },
    ]);
    const download = vi.spyOn(activityDownload, 'downloadCsv').mockImplementation(() => undefined);
    window.history.replaceState({}, '', '/entries');
    render(<App />);
    expect(await screen.findByText('Sagay event')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log operation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log weather / event' })).not.toBeInTheDocument();
    const records = screen.getByRole('heading', { name: 'Activity Records' }).closest('section')!;
    const exportButton = within(records).getByRole('button', { name: 'Export CSV' });
    expect(exportButton).toHaveAttribute('title', 'Export CSV');
    expect(within(records).queryByRole('combobox', { name: 'Hatchery' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    expect(screen.getByText('Benoni event')).toBeInTheDocument();
    expect(screen.queryByText('Sagay event')).not.toBeInTheDocument();
    fireEvent.click(exportButton);
    expect(download).toHaveBeenCalledWith(expect.stringContaining('Benoni event'), 'hydrosense-activity-logs.csv');
    expect(download.mock.calls[0][0]).not.toContain('Sagay event');
  });

  it('shows an empty Benoni monitor when the backend has only Sagay tanks', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([{ id: 's', name: 'Sagay tank', site: 'Sagay Hatchery', rearingStartDate: '2026-01-01', deviceId: 's' }]);
    window.history.replaceState({}, '', '/');
    render(<App />);
    await screen.findByRole('button', { name: 'Sagay tank' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    expect(await screen.findByText('No tank or reading is available. Check the tank selector and device status.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sagay tank' })).not.toBeInTheDocument();
  });

  it('keeps the admin hatchery selection across tabs and scopes notifications', async () => {
    signInAs('admin');
    vi.spyOn(api, 'listTanks').mockResolvedValue([{ id: 's', name: 'Sagay tank', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 's' }]);
    vi.spyOn(api, 'listActivityLogs').mockResolvedValue([
      { id: 's', tankId: 'hatchery', hatcheryId: 'camiguin-sagay', kind: 'ENVIRONMENT', type: 'Sagay event', occurredAt: new Date().toISOString(), operator: 'S', notes: '' },
      { id: 'b', tankId: 'hatchery', hatcheryId: 'camiguin-benoni', kind: 'ENVIRONMENT', type: 'Benoni event', occurredAt: new Date().toISOString(), operator: 'B', notes: '' },
    ]);
    vi.spyOn(authService, 'listPendingRequests').mockResolvedValue([
      { id: 's', firstName: 'Sagay', lastName: 'Request', email: 's@example.com', role: null, requestedRole: 'operator', status: 'pending', hatcheryId: 'camiguin-sagay', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', firstName: 'Benoni', lastName: 'Request', email: 'b@example.com', role: null, requestedRole: 'operator', status: 'pending', hatcheryId: 'camiguin-benoni', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    window.history.replaceState({}, '', '/entries');
    render(<App />);
    await screen.findByText('Sagay event');
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    expect(screen.getByText('Benoni event')).toBeInTheDocument();
    expect(screen.queryByText('Sagay event')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /including 1 pending account request/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Users & Roles' }));
    expect(await screen.findByText('Benoni Request')).toBeInTheDocument();
    expect(screen.queryByText('Sagay Request')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Hatchery' })).toHaveTextContent('Benoni');
    fireEvent.click(screen.getByRole('link', { name: 'Reports' }));
    expect(await screen.findByText('No tanks are available for the selected hatchery.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Hatchery' })).toHaveTextContent('Benoni');
  });

  it.each(['manager', 'operator'] as const)('scopes %s to their assigned hatchery without a selector', async (role) => {
    signInAs(role);
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 's', name: 'Sagay tank', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 's' },
      { id: 'b', name: 'Benoni tank', site: 'Benoni', rearingStartDate: '2026-01-01', deviceId: 'b' },
    ]);
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sagay tank' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Benoni tank' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Hatchery' })).not.toBeInTheDocument();
  });

  it('previews reports for the selected hatchery without mixing readings', async () => {
    const createUrl = vi.fn((_blob: Blob) => 'blob:report');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 's', name: 'Sagay tank', site: 'Sagay Hatchery', rearingStartDate: '2026-01-01', deviceId: 's' },
      { id: 'b', name: 'Benoni tank', site: 'Benoni Hatchery', rearingStartDate: '2026-01-01', deviceId: 'b' },
    ]);
    vi.spyOn(api, 'listReadings').mockImplementation(async (query) => [{
      id: `${query?.tankId}-reading`, tankId: query?.tankId ?? '', timestamp: new Date().toISOString(),
      temperature: query?.tankId === 'b' ? 31 : 22, doMgL: 5, ph: 7,
    }]);
    vi.spyOn(api, 'listAlerts').mockResolvedValue([]);
    vi.spyOn(api, 'listActivityLogs').mockResolvedValue([]);
    vi.spyOn(api, 'listCalibrationLogs').mockResolvedValue([]);
    vi.spyOn(api, 'listValidationRows').mockResolvedValue([]);
    const saveReport = vi.spyOn(api, 'saveReport');
    window.history.replaceState({}, '', '/reports');
    render(<App />);
    const settings = screen.getByRole('heading', { name: 'Export Settings' }).closest('section')!;
    expect(within(settings).queryByRole('combobox', { name: 'Hatchery' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    const preview = screen.getByRole('heading', { name: 'Report Preview' }).closest('section')!;
    expect(await within(preview).findByText(/Benoni tank ·/)).toBeInTheDocument();
    const reportId = preview.querySelector('.dash-report-id')?.textContent ?? '';
    expect(reportId).toMatch(/^RPT-\d{8}-[A-HJ-NP-Z2-9]{6}$/);
    expect(reportId).not.toContain('b');
    expect(within(preview).getAllByText('31.00').length).toBeGreaterThan(0);
    expect(within(preview).queryByText('22.00')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(createUrl.mock.calls[0][0]);
    });
    expect(csv).toContain('Benoni');
    expect(csv).not.toContain('Sagay');
    expect(saveReport).toHaveBeenCalledWith(expect.objectContaining({
      id: reportId, reportType: 'csv', tankIds: ['b'],
    }));
    expect(preview.querySelector('.dash-report-id')?.textContent).toBe(reportId);
  });

  it('does not present unscoped audit records as hatchery-filtered', async () => {
    signInAs('admin');
    window.history.replaceState({}, '', '/admin/logs');
    render(<App />);
    await screen.findByRole('heading', { name: 'Audit & System Logs' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    expect(screen.getByText(/Audit and system logs cannot be filtered by hatchery/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('disables report export when Benoni has no tanks', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([{ id: 's', name: 'Sagay tank', site: 'Sagay Hatchery', rearingStartDate: '2026-01-01', deviceId: 's' }]);
    window.history.replaceState({}, '', '/reports');
    render(<App />);
    await screen.findByText(/Sagay tank ·/);
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    expect(await screen.findByText('No tanks are available for the selected hatchery.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Print / Save PDF' })).not.toBeInTheDocument();
  });
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
    const maintenance = await screen.findByRole('region', { name: 'Device Maintenance' });
    expect(await within(maintenance).findByText('Site lookup failed', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Profile' })).getByText('Site lookup failed')).toBeInTheDocument();
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
      window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    }
    window.history.replaceState({}, '', '/tanks');
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: 'Tank Overview & System Health', level: 1 });
    expect(container.querySelector('.app-shell')?.getAttribute('data-role')).toBe(role);
    expect(screen.getByText(`${role.toUpperCase()} Workspace`)).not.toBeNull();
  });

  it.each(routes.flatMap(([path, title]) => (['light', 'dark'] as const).map((theme) => [path, title, theme] as const)))('renders %s in the shared shell (%s, %s)', async (path, title, theme) => {
    window.history.replaceState({}, '', path);
    window.localStorage.setItem('hydrosense.theme', theme);
    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(container.querySelector('.glass-shell .glass-screen')).toBeInTheDocument();
    expect(container.querySelector('main .page-controls')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Dashboard controls')).getByRole('combobox', { name: 'Hatchery' })).toBeInTheDocument();
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

  it('places chat beside notifications and closes the popover when opened', async () => {
    signInAs('operator');
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    const bell = await screen.findByRole('button', { name: /open alerts/ });
    const chat = screen.getByRole('link', { name: 'Chat, 0 unread messages' });
    expect(chat.nextElementSibling).toContainElement(bell);
    fireEvent.click(bell);
    expect(screen.getByRole('dialog', { name: 'Current notifications' })).toBeInTheDocument();
    fireEvent.click(chat);
    expect(screen.queryByRole('dialog', { name: 'Current notifications' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Chat' })).toBeInTheDocument();
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

  it('requires confirmation before removing a tank', async () => {
    const removeTank = vi.spyOn(api, 'deleteTank').mockRejectedValue(new Error('Removal failed'));
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0]);
    const confirmation = screen.getByRole('dialog', { name: 'Remove tank?' });
    expect(within(confirmation).getByText(/Are you sure you want to remove/)).toBeInTheDocument();
    expect(removeTank).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Remove tank' }));
    await waitFor(() => expect(removeTank).toHaveBeenCalledTimes(1));
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
      window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    }
    window.history.replaceState({}, '', '/tanks');
    render(<App />);
    await screen.findByRole('region', { name: 'Tank overview table' });
    expect(Boolean(screen.queryByRole('button', { name: 'Register tank' }))).toBe(allowed);
  });

  it('lets operators access reports without requesting restricted validation data', async () => {
    const user = {
      id: 'test-operator', firstName: 'Test', lastName: 'operator', email: 'operator@example.com',
      role: 'operator', requestedRole: 'operator', status: 'approved', hatcheryId: 'camiguin-sagay', createdAt: '2026-01-01T00:00:00.000Z',
    };
    window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
    window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    const validation = vi.spyOn(api, 'listValidationRows');
    const calibration = vi.spyOn(api, 'listCalibrationLogs');
    vi.spyOn(api, 'listThresholds').mockResolvedValue([
      { parameter: 'temperature', max: 32 },
      { parameter: 'do', min: 5 },
      { parameter: 'ph', min: 7.2, max: 8.5 },
    ]);
    window.history.replaceState({}, '', '/reports');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    const downloadButton = await screen.findByRole('button', { name: 'Download CSV' });
    const printButton = await screen.findByRole('button', { name: 'Print / Save PDF' });
    expect(downloadButton).toHaveClass('button-primary', 'button-soft-action');
    expect(printButton.className).toBe(downloadButton.className);
    const statistics = screen.getByRole('region', { name: 'Report statistics' });
    expect(within(statistics).getByRole('columnheader', { name: 'Std dev' })).toBeInTheDocument();
    expect(within(statistics).getByRole('cell', { name: 'Temperature' })).toBeInTheDocument();
    expect(screen.getByText('Temperature ≤ 32')).toBeInTheDocument();
    expect(screen.getByText('DO ≥ 5')).toBeInTheDocument();
    expect(screen.getByText('pH 7.2–8.5')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Temp (°C)' })).toBeInTheDocument();
    expect(screen.getByText(/^Showing first \d+ of \d+ readings$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const filterDialog = await screen.findByRole('dialog', { name: 'Report filters' });
    expect(filterDialog.closest('.glass-shell')).not.toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: 'CSV dataset' }));
    const datasetMenu = await screen.findByRole('listbox', { name: 'CSV dataset' });
    expect(datasetMenu.closest('.glass-shell')).not.toBeNull();
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
    expect(await screen.findByRole('columnheader', { name: 'Acknowledged at (PHT)' })).toBeInTheDocument();
    const pagination = screen.getByRole('navigation', { name: 'Alert history pages' });
    expect(within(pagination).getByText('Page 1 of 1')).toHaveAttribute('aria-current', 'page');
    expect(within(pagination).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(pagination).getByRole('button', { name: 'Next' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'pH' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'DO' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Temp' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Parameter')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(await screen.findByRole('heading', { name: 'Response History' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Response History' })).toBeInTheDocument();
    expect(await screen.findByText('Alert raised')).toBeInTheDocument();
    expect(await screen.findByText('Acknowledged by Juan Dela Cruz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve alert' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resolution note' }), { target: { value: 'Verified readings are back in range.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }));
    const resolveConfirmation = screen.getByRole('dialog', { name: 'Resolve alert?' });
    expect(within(resolveConfirmation).getByText(/Are you sure you want to resolve/)).toBeInTheDocument();
    fireEvent.click(within(resolveConfirmation).getByRole('button', { name: 'Confirm resolve' }));
    expect(await screen.findByRole('tab', { name: 'Acknowledged (0)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resolved (1)' })).toBeInTheDocument();
  });

  it('shows older alert history and changes the selected tank', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'a', name: 'Tank A', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device-a' },
      { id: 'b', name: 'Tank B', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device-b' },
    ]);
    vi.spyOn(api, 'listAlerts').mockImplementation(async (tankId) => tankId === 'a' ? [{
      id: 'old', tankId: 'a', parameter: 'ph', value: 9, threshold: '8',
      severity: 'warning', status: 'acknowledged', createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    }] : [{
      id: 'new', tankId: 'b', parameter: 'do', value: 2, threshold: '5',
      severity: 'critical', status: 'open', createdAt: new Date().toISOString(),
    }]);
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    expect(await screen.findByText('Tank A · All dates')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Acknowledged (1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Tank' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tank B' }));
    expect(await screen.findByText('Tank B · All dates')).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Open (1)' })).toBeInTheDocument();
    expect(screen.getByText('2 mg/L')).toBeInTheDocument();
  });

  it('orders acknowledged alerts by acknowledgement time, with missing times last', async () => {
    const now = Date.now();
    const newestAck = new Date(now - 60_000).toISOString();
    const olderAck = new Date(now - 120_000).toISOString();
    vi.spyOn(api, 'listAlerts').mockResolvedValue([
      { id: 'later-created', tankId: 'tank-a', parameter: 'ph', value: 8.1, threshold: '7', severity: 'warning', status: 'acknowledged', createdAt: new Date(now - 180_000).toISOString(), acknowledgedAt: olderAck },
      { id: 'earlier-created', tankId: 'tank-a', parameter: 'ph', value: 8.2, threshold: '7', severity: 'warning', status: 'acknowledged', createdAt: new Date(now - 240_000).toISOString(), acknowledgedAt: newestAck },
      { id: 'missing-time', tankId: 'tank-a', parameter: 'ph', value: 8.3, threshold: '7', severity: 'warning', status: 'acknowledged', createdAt: new Date(now - 30_000).toISOString() },
    ]);
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Acknowledged (3)' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1].textContent)).toEqual(['8.2 pH', '8.1 pH', '8.3 pH']);
    expect(rows[0].querySelector('time')).toHaveAttribute('datetime', newestAck);
    expect(rows[1].querySelector('time')).toHaveAttribute('datetime', olderAck);
    expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent('—');
  });

  it('paginates alert history with arrows and resets when the page size changes', async () => {
    vi.spyOn(api, 'listAlerts').mockResolvedValue(Array.from({ length: 31 }, (_, index) => ({
      id: `alert-${index}`, tankId: 'tank-a', parameter: 'ph', value: 9, threshold: '8',
      severity: 'warning' as const, status: 'open' as const, createdAt: new Date().toISOString(),
    })));
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    const pagination = await screen.findByRole('navigation', { name: 'Alert history pages' });
    expect(within(pagination).getByText('Page 1 of 4')).toBeInTheDocument();
    expect(within(pagination).getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(within(pagination).getByRole('button', { name: 'Next' }));
    expect(within(pagination).getByText('Page 2 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    fireEvent.click(screen.getByRole('option', { name: '25' }));
    expect(within(pagination).getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Page 1 of 4 · 31 alerts')).not.toBeInTheDocument();
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
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Resolve alert?' })).getByRole('button', { name: 'Confirm resolve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The alert was resolved, but its activity log could not be saved: Network unavailable');
    expect(await screen.findByRole('tab', { name: 'Resolved (1)' })).toBeInTheDocument();
  });

  it('groups the selected tank readings and device details', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const readings = await screen.findByRole('region', { name: 'Current Water Quality' });
    expect(within(readings).getByRole('article', { name: 'Temperature reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'DO reading' })).toBeInTheDocument();
    expect(within(readings).getByRole('article', { name: 'pH reading' })).toBeInTheDocument();
    expect(within(readings).getAllByRole('img', { name: /Current value/ })).toHaveLength(3);
    const device = screen.getByRole('region', { name: 'Device Connection' });
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
    expect(within(switcher).getByRole('button', { name: 'Larval Tank B' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('.page-heading')).not.toHaveTextContent(/rearing day/i);
    fireEvent.click(within(switcher).getByRole('button', { name: 'Larval Tank B' }));
    expect(await screen.findByText('Larval Tank B has readings that need attention')).toBeInTheDocument();
    expect(within(switcher).getByRole('button', { name: 'Larval Tank B' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(switcher).getByRole('button', { name: 'Larval Tank A' })).toHaveAttribute('aria-pressed', 'false');
    const summary = screen.getByRole('region', { name: 'Current reading status' });
    expect(within(summary).getByRole('link', { name: 'Activity Logs' })).toHaveAttribute('href', '/entries');
    expect(within(summary).getByRole('link', { name: 'View trends' })).toHaveAttribute('href', '/trends');
    expect(screen.getByRole('region', { name: 'Recent Alerts' })).toBeInTheDocument();
  });

  it('shows the selected device connection even when there are no readings', async () => {
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'a', name: 'Tank A', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device-a' },
      { id: 'b', name: 'Tank B', site: 'Sagay', rearingStartDate: '2026-01-01', deviceId: 'device-b' },
    ]);
    vi.spyOn(api, 'getLatestReading').mockResolvedValue(null);
    vi.spyOn(api, 'listDeviceStatuses').mockResolvedValue([
      { deviceId: 'device-a', online: false, lastSeen: '2020-01-01T00:00:00Z', wifiRssi: 0, pendingSyncCount: 0, batteryPct: null, powerSource: 'grid' },
      { deviceId: 'device-b', online: true, lastSeen: new Date().toISOString(), wifiRssi: -62, pendingSyncCount: 0, batteryPct: null, powerSource: 'grid', reportedFields: ['wifiRssi'], storageAvailable: false },
    ]);
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('No reading is available for this tank.')).toBeInTheDocument();
    expect(screen.getByLabelText('ESP32 Offline')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Device Connection' })).getByText('Offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tank B' }));
    expect(await screen.findByLabelText('ESP32 Online')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Device Connection' })).getByText('Online')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Device Connection' })).getByText('-62 dBm')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Device Connection' })).getByText('SD unavailable')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent Alerts' }).compareDocumentPosition(screen.getByRole('region', { name: 'ESP32 Setup' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    const readings = screen.getByRole('region', { name: 'Current Water Quality' });
    expect(within(readings).getByText('Check probe')).toBeInTheDocument();
    expect(within(readings).queryByText('Critical')).not.toBeInTheDocument();
    expect(screen.getByText('Reading status unavailable while offline')).toBeInTheDocument();
  });

  it('validates password changes and displays errors and success', async () => {
    signInAs('operator');
    const change = vi.spyOn(authService, 'changePassword')
      .mockRejectedValueOnce(new Error('Current password is incorrect.'))
      .mockResolvedValueOnce();
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change Password' });
    expect(within(dialog).queryByText(/Are you sure you want to change your password/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Enter your current password and choose a new one/)).not.toBeInTheDocument();
    expect(dialog.closest('#device-maintenance')).toBeNull();
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      const input = within(dialog).getByLabelText(label);
      expect(input).toHaveAttribute('type', 'password');
      fireEvent.click(within(dialog).getByRole('button', { name: `Show ${label.toLowerCase()}` }));
      expect(input).toHaveAttribute('type', 'text');
      fireEvent.click(within(dialog).getByRole('button', { name: `Hide ${label.toLowerCase()}` }));
      expect(input).toHaveAttribute('type', 'password');
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm change' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter your current password.');
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(within(dialog).getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm change' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Current password is incorrect.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm change' }));
    expect(await screen.findByText('Password changed successfully.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('dialog', { name: 'Change Password' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'discarded-password' } });
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Change Password' }).parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Change Password' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it.each(['operator', 'manager', 'admin'] as const)('uses the correct password dialog dismissal for %s', async (role) => {
    signInAs(role);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change Password' });
    expect(within(dialog).queryByText(/Are you sure you want to change your password/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Enter your current password and choose a new one/)).not.toBeInTheDocument();
    const close = within(dialog).queryByRole('button', { name: 'Close change password dialog' });
    if (role === 'admin') {
      expect(close).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'discarded-password' } });
      fireEvent.click(close!);
      expect(screen.queryByRole('dialog', { name: 'Change Password' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
      expect(screen.getByLabelText('Current password')).toHaveValue('');
    } else {
      expect(close).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    }
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
    for (const name of ['Profile', 'Alert Notifications', 'Appearance', 'Device Maintenance']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('switch', { name: 'SMS alerts' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Email alerts' })).toBeDisabled();
    expect(screen.queryByText(/valid for sms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phone on file:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Email on file:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
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
    const maintenance = screen.getByRole('region', { name: 'Device Maintenance' });
    expect(within(maintenance).queryByRole('combobox', { name: 'Hatchery' })).not.toBeInTheDocument();
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

  it('lets a signed-in user upload a profile picture', async () => {
    signInAs('operator');
    const saveProfileAvatar = authService.saveProfileAvatar.bind(authService);
    let finishUpload!: () => void;
    const uploadGate = new Promise<void>((resolve) => { finishUpload = resolve; });
    vi.spyOn(authService, 'saveProfileAvatar').mockImplementation(async (file) => {
      await uploadGate;
      return saveProfileAvatar(file);
    });
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Upload profile picture' })).toBeInTheDocument();
    expect(screen.queryByText(/JPG, PNG, or WebP/)).not.toBeInTheDocument();
    const file = new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Choose profile picture'), { target: { files: [file] } });
    expect(await screen.findByText(/Preparing and uploading… JPG, PNG, or WebP/)).toBeInTheDocument();
    finishUpload();
    expect(await screen.findByRole('img', { name: 'Test operator profile picture' })).toHaveAttribute('src', 'data:image/png;base64,AQID');
    expect(await screen.findByText('Profile picture updated.')).toHaveAttribute('role', 'status');
  });

  it.each(['not a phone', ''] as const)('does not show SMS validation text for %s', async (phone) => {
    signInAs('operator', phone);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    await screen.findByRole('region', { name: 'Alert Notifications' });
    expect(screen.queryByText(/valid for sms/i)).not.toBeInTheDocument();
  });

  it('offers backend tanks for the selected hatchery in maintenance', async () => {
    signInAs('admin');
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'tank-one-id', name: 'Tank 01', site: 'Camiguin, Sagay Multispecies Hatchery', rearingStartDate: '2026-01-01', deviceId: 'HS-001' },
      { id: 'tank-two-id', name: 'Tank 02', site: 'Camiguin, Benoni Experimental Station', rearingStartDate: '2026-01-01', deviceId: 'HS-002' },
    ]);
    window.history.replaceState({}, '', '/profile');
    render(<App />);
    const maintenance = await screen.findByRole('region', { name: 'Device Maintenance' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Sagay Multispecies Hatchery' }));
    const tankSelect = await within(maintenance).findByRole('combobox', { name: 'Tank' });
    fireEvent.click(tankSelect);
    expect(screen.getByRole('option', { name: 'Tank 01' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tank 02' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Tank 01' }));
    expect(tankSelect).toHaveTextContent('Tank 01');
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Benoni Experimental Station' }));
    expect(tankSelect).toHaveTextContent('Select a tank');
    fireEvent.click(tankSelect);
    expect(screen.queryByRole('option', { name: 'Tank 01' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Tank 02' }));
    expect(tankSelect).toHaveTextContent('Tank 02');
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
    vi.spyOn(api, 'listTanks').mockResolvedValue([
      { id: 'calibration-tank', name: 'Sagay tank', site: 'Sagay Hatchery', rearingStartDate: '2026-01-01', deviceId: 'device-1' },
    ]);
    const listCalibrationLogs = vi.spyOn(api, 'listCalibrationLogs').mockResolvedValue([{
      id: 'calibration-1',
      tankId: 'calibration-tank',
      parameter: 'ph',
      standard: 'pH 7.00 buffer',
      before: 6.8,
      after: 7,
      date: '2026-11-20T08:00:00.000Z',
      nextDue: '2030-11-20T08:00:00.000Z',
      user: 'Test technician',
    }]);
    window.history.replaceState({}, '', '/calibration');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Calibration & Maintenance', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calibration' })).toBeInTheDocument();
    const form = screen.getByRole('heading', { name: 'Log Calibration' }).closest('form');
    const dueDates = screen.getByRole('heading', { name: 'Calibration Due Dates' }).closest('section');
    const status = screen.getByRole('heading', { name: 'Calibration Status' }).closest('section');
    expect(await screen.findByRole('cell', { name: 'Test technician' })).toBeInTheDocument();
    expect(listCalibrationLogs).toHaveBeenCalledWith('calibration-tank');
    const table = dueDates?.querySelector('table');
    expect(table).not.toBeNull();
    for (const header of ['Parameter', 'Standard', 'Before', 'After', 'Date (PHT)', 'Next due', 'Technician']) {
      expect(within(table!).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(form?.parentElement).toHaveClass('dash-calibration-top');
    expect(dueDates?.parentElement).toBe(form?.parentElement);
    expect(status?.parentElement).toHaveClass('dash-calibration');
    expect(status?.parentElement).not.toBe(form?.parentElement);
    expect(status).toHaveClass('dash-calibration-summary');
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
    const pending = await screen.findByRole('region', { name: 'Pending Requests' });
    expect(await within(pending).findByText('1 pending')).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('combobox', { name: 'Review role for Test User' }));
    fireEvent.click(screen.getByRole('option', { name: 'Manager' }));
    fireEvent.click(within(pending).getByRole('button', { name: 'Approve Test User' }));
    const confirmation = screen.getByRole('dialog', { name: 'Approve account request?' });
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Approve request' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('pending-test', 'manager'));
    const team = screen.getByRole('region', { name: 'Team Accounts' });
    expect(await within(team).findByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(within(team).queryByRole('combobox', { name: 'Role for Juan Dela Cruz' })).not.toBeInTheDocument();
  });

  it('keeps the accounts table when search has no matches', async () => {
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const accountName = await screen.findByText('Juan Dela Cruz');
    const table = accountName.closest('table')!;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search team accounts' }), { target: { value: 'zzzz-no-match' } });
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
    signInAs('operator');
    window.history.replaceState({}, '', '/entries');
    render(<App />);
    await screen.findByRole('heading', { name: 'Activity Logs' });
    fireEvent.click(screen.getByRole('button', { name: 'Log operation' }));
    let dialog = screen.getByRole('dialog', { name: 'Log Hatchery Operation' });
    expect(within(dialog).getByLabelText('Operation type')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Operation' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Weather / event' })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Operation type'), { target: { value: 'Manual water quality check' } });
    expect(within(dialog).getByLabelText('Notes')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Dissolved oxygen')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Instrument / method (optional)')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log weather / event' }));
    dialog = screen.getByRole('dialog', { name: 'Log Weather or Event' });
    expect(within(dialog).getByLabelText('Event type')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Observed impact')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Operation' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Weather / event' })).not.toBeInTheDocument();
  });
});

describe('themed authentication routes', () => {
  function navigateAfterSplash(path: string) {
    if (path === '/signin') return;
    act(() => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }

  const authRoutes = [
    ['/signin', 'Welcome Back'],
    ['/signup', "Let's Get Started"],
    ['/forgot-password', 'Reset Your Password'],
    ['/pending-approval', 'Request Submitted'],
  ] as const;
  it.each(authRoutes.flatMap(([path, title]) => (['light', 'dark'] as const).map((theme) => [path, title, theme] as const)))('renders %s with glass (%s, %s)', async (path, title, theme) => {
    window.sessionStorage.removeItem('hydrosense.auth.session.v2');
    window.localStorage.setItem('hydrosense.theme', theme);
    window.history.replaceState({}, '', path);
    const { container } = render(<App />);
    navigateAfterSplash(path);
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(container.querySelector('.auth-background .glass-panel')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', theme);
  });

  it.each(['/signin', '/signup'])('shows the mobile-style brand on %s', async (path) => {
    window.sessionStorage.removeItem('hydrosense.auth.session.v2');
    window.history.replaceState({}, '', path);
    const { container } = render(<App />);
    navigateAfterSplash(path);
    const header = container.querySelector('.auth-header--branded');
    expect(await screen.findByText('WATER QUALITY MONITORING')).toBeInTheDocument();
    expect(header).toHaveTextContent('HydroSense');
    expect(header?.querySelector('img')).toHaveAttribute('src', '/assets/logos/hydrosense-logo.png');
  });
});
