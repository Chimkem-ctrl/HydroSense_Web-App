import { cleanup, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { AuditLog, DashboardUser } from '@hydrosense/shared';
import { DEFAULT_ADVISORY_RULES, DEFAULT_THRESHOLDS } from '@hydrosense/shared';
import App from '../App';
import { api } from './api';
import { queryClient } from './query';
import { authService, SUBSCRIBED_HATCHERIES } from '../services/authService';
import { auditLogCsv } from '../pages/AdminPages';

const hatchery = SUBSCRIBED_HATCHERIES[0];
const pending = [
  { id: 'p1', firstName: 'Local', lastName: 'Applicant', email: 'local@example.com', role: null, requestedRole: 'manager', status: 'pending', hatcheryId: hatchery.id, phone: '+639175550100', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', firstName: 'Other', lastName: 'Applicant', email: 'other@example.com', role: null, requestedRole: 'operator', status: 'pending', hatcheryId: 'other', createdAt: '2026-01-01T00:00:00Z' },
] as const;
const team: DashboardUser[] = [
  { id: 'u1', name: 'Local Operator', email: 'local-op@example.com', role: 'operator', site: hatchery.name, phone: 'bad', active: true, lastActive: '2026-01-01T00:00:00Z', avatarUrl: 'https://storage.example/operator-avatar' },
  { id: 'u2', name: 'Local Manager', email: 'local-manager@example.com', role: 'manager', site: hatchery.name, active: true, lastActive: '2026-01-01T00:00:00Z' },
  { id: 'u3', name: 'Local Admin', email: 'local-admin@example.com', role: 'admin', site: hatchery.name, active: true, lastActive: '2026-01-01T00:00:00Z', employeeId: 'ADM-001', phone: '+639175550999' },
  { id: 'u4', name: 'Other Operator', email: 'other-op@example.com', role: 'operator', site: 'Other hatchery', active: true, lastActive: '2026-01-01T00:00:00Z' },
];

function render(ui: ReactElement) {
  const result = renderBase(ui);
  const getStarted = screen.queryByRole('button', { name: 'Get Started' });
  if (getStarted) fireEvent.click(getStarted);
  return result;
}

function signIn(role: 'operator' | 'manager' | 'admin', hatcheryId?: string) {
  const user = { id: 'test-user', firstName: 'Test', lastName: 'User', email: 'user@example.com', role, requestedRole: role === 'admin' ? null : role, status: 'approved', hatcheryId, createdAt: '2026-01-01T00:00:00Z' };
  window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
  window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
}

function mockAccounts() {
  vi.spyOn(api, 'listUsers').mockResolvedValue(team);
  vi.spyOn(authService, 'listApprovedUsers').mockResolvedValue([]);
  vi.spyOn(authService, 'listPendingRequests').mockResolvedValue([...pending]);
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('users and roles', () => {
  it('filters manager accounts by hatchery without showing or fetching pending requests', async () => {
    signIn('manager', hatchery.id);
    mockAccounts();
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Users & Roles', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users & Roles' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: hatchery.name })).not.toBeInTheDocument();
    expect(screen.getByText('Review operator accounts for your hatchery.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pending requests' })).not.toBeInTheDocument();
    expect(authService.listPendingRequests).not.toHaveBeenCalled();
    const accounts = await screen.findByRole('region', { name: 'Team accounts table' });
    expect(within(accounts).getByText('Local Operator')).toBeInTheDocument();
    expect(within(accounts).getByText('Local Manager')).toBeInTheDocument();
    expect(within(accounts).queryByText(/valid for sms/i)).not.toBeInTheDocument();
    expect(within(accounts).queryByText('Local Admin')).not.toBeInTheDocument();
    expect(within(accounts).queryByText('Other Operator')).not.toBeInTheDocument();
    expect(within(accounts).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(accounts).queryByRole('button', { name: 'Remove account' })).not.toBeInTheDocument();
  });

  it('shows the unassigned manager state without requesting account lists', async () => {
    signIn('manager');
    mockAccounts();
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    expect(await screen.findByText('No hatchery is assigned to your account. Contact an administrator.')).toBeInTheDocument();
    expect(authService.listPendingRequests).not.toHaveBeenCalled();
    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it('shows admin accounts separately and keeps approved roles static', async () => {
    signIn('admin');
    mockAccounts();
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const requests = await screen.findByRole('region', { name: 'Pending requests table' });
    expect(within(requests).getByRole('heading', { name: hatchery.name })).toBeInTheDocument();
    expect(within(requests).getByRole('region', { name: 'other pending requests' })).toBeInTheDocument();
    expect(within(requests).getByText('Other Applicant')).toBeInTheDocument();
    const approvalRole = within(requests).getByRole('combobox', { name: 'Review role for Local Applicant' });
    fireEvent.click(approvalRole);
    expect(screen.queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
    fireEvent.click(approvalRole);
    expect(within(requests).getAllByText('Pending')).toHaveLength(2);
    expect(within(requests).getByRole('button', { name: 'Approve Local Applicant' })).toBeInTheDocument();
    expect(within(requests).getByRole('button', { name: 'Reject Local Applicant' })).toBeInTheDocument();
    expect(within(requests).getAllByRole('columnheader', { name: 'Requested role' })).toHaveLength(2);
    expect(within(requests).getAllByRole('columnheader', { name: 'Review Role' })).toHaveLength(2);
    expect(within(requests).getAllByRole('columnheader', { name: 'Action' })).toHaveLength(2);
    const accounts = await screen.findByRole('region', { name: 'Team accounts table' });
    const localSite = within(accounts).getByRole('region', { name: `${hatchery.name} accounts` });
    const otherSite = within(accounts).getByRole('region', { name: 'Other hatchery accounts' });
    expect(within(localSite).getByText('Local Operator')).toBeInTheDocument();
    expect(localSite.querySelector('img.admin-user-avatar')).toHaveAttribute('src', 'https://storage.example/operator-avatar');
    expect(within(otherSite).getByText('Other Operator')).toBeInTheDocument();
    expect(within(localSite).queryByRole('columnheader', { name: 'Site' })).not.toBeInTheDocument();
    expect(within(accounts).getByText('Other Operator')).toBeInTheDocument();
    expect(within(accounts).queryByText('Local Admin')).not.toBeInTheDocument();
    expect(within(accounts).getByText('Local Operator').closest('tr')).toHaveTextContent('Operator');
    expect(within(accounts).queryByRole('combobox', { name: /Role for/ })).not.toBeInTheDocument();
    const adminAccounts = screen.getByRole('region', { name: 'Admin accounts table' });
    expect(within(adminAccounts).getByText('Local Admin')).toBeInTheDocument();
    expect(within(adminAccounts).getByRole('columnheader', { name: 'ID' })).toBeInTheDocument();
    expect(within(adminAccounts).getByRole('columnheader', { name: 'Phone number' })).toBeInTheDocument();
    expect(within(adminAccounts).getByText('ADM-001')).toBeInTheDocument();
    expect(within(adminAccounts).getByText('+639175550999')).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('.admin-users-panel h2')).map((heading) => heading.textContent))
      .toEqual(['Pending requests', 'Admin accounts', 'Team accounts']);
  });

  it('filters pending requests and account lists using the header hatchery', async () => {
    signIn('admin');
    mockAccounts();
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    await screen.findByText('Other Operator');
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Sagay Multispecies Hatchery' }));
    expect(screen.getByText('Local Applicant')).toBeInTheDocument();
    expect(screen.getByText('Local Operator')).toBeInTheDocument();
    expect(screen.getByText('Local Admin')).toBeInTheDocument();
    expect(screen.queryByText('Other Applicant')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Operator')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: hatchery.name })).not.toBeInTheDocument();
  });

  it('searches team accounts across hatcheries without per-hatchery counts', async () => {
    signIn('admin');
    mockAccounts();
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const accounts = await screen.findByRole('region', { name: 'Team accounts table' });
    expect(within(accounts).getByText('Other Operator')).toBeInTheDocument();
    expect(within(accounts).queryByText(/^\d+ accounts?$/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search team accounts' }), { target: { value: 'operator' } });
    expect(within(accounts).getByText('Local Operator')).toBeInTheDocument();
    expect(within(accounts).getByText('Other Operator')).toBeInTheDocument();
    expect(within(accounts).queryByText('Local Manager')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Hatchery' }));
    fireEvent.click(screen.getByRole('option', { name: 'Camiguin, Sagay Multispecies Hatchery' }));
    expect(within(accounts).getByText('Local Operator')).toBeInTheDocument();
    expect(within(accounts).queryByText('Other Operator')).not.toBeInTheDocument();
    expect(within(accounts).queryByText('Local Manager')).not.toBeInTheDocument();
  });

  it('moves an approved request into its hatchery account list after refresh', async () => {
    signIn('admin');
    let approved = false;
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    vi.spyOn(authService, 'listPendingRequests').mockImplementation(async () => approved ? [] : [pending[0]]);
    vi.spyOn(authService, 'listApprovedUsers').mockImplementation(async () => approved ? [{
      ...pending[0], role: 'operator', status: 'approved',
    }] : []);
    const approve = vi.spyOn(authService, 'approveRequest').mockImplementation(async () => {
      approved = true;
      return { ...pending[0], role: 'operator', status: 'approved' };
    });
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const requests = await screen.findByRole('region', { name: 'Pending requests table' });
    fireEvent.click(within(requests).getByRole('button', { name: 'Approve Local Applicant' }));
    const confirmation = screen.getByRole('dialog', { name: 'Approve account request?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Approve request' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('p1', 'manager'));
    const accounts = await screen.findByRole('region', { name: `${hatchery.name} accounts` });
    expect(within(accounts).getByText('Local Applicant')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: `${hatchery.name} pending requests` })).not.toBeInTheDocument());
  });

  it('uses the fetched site for managers with an assignment outside the signup list', async () => {
    signIn('manager');
    mockAccounts();
    vi.spyOn(authService, 'getProfileSite').mockResolvedValue('Other hatchery');
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const accounts = await screen.findByRole('region', { name: 'Team accounts table' });
    expect(within(accounts).queryByRole('heading', { name: 'Other hatchery' })).not.toBeInTheDocument();
    expect(within(accounts).getByText('Other Operator')).toBeInTheDocument();
    expect(within(accounts).queryByText('Local Operator')).not.toBeInTheDocument();
  });

  it.each([['operator', '/admin/users'], ['operator', '/admin/logs'], ['manager', '/admin/logs']] as const)('denies %s access to %s', async (role, path) => {
    signIn(role, hatchery.id);
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Live Monitor', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Audit & System Logs' })).not.toBeInTheDocument();
  });

  it('surfaces manager account authorization failures', async () => {
    signIn('manager', hatchery.id);
    vi.spyOn(api, 'listUsers').mockRejectedValue(new Error('Not authorized'));
    const requests = vi.spyOn(authService, 'listPendingRequests').mockRejectedValue(new Error('Requests not authorized'));
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    expect(await screen.findByText(/Not authorized/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(requests).not.toHaveBeenCalled();
  });
});

describe('threshold review', () => {
  it('shows calibration thresholds as read-only reference values', async () => {
    signIn('admin');
    vi.spyOn(api, 'listThresholds').mockResolvedValue(DEFAULT_THRESHOLDS.map((item) => item.parameter === 'do' ? { ...item, max: undefined } : { ...item }));
    vi.spyOn(api, 'getAdvisorySettings').mockResolvedValue({ ...DEFAULT_ADVISORY_RULES });
    window.history.replaceState({}, '', '/calibration');
    render(<App />);
    const heading = await screen.findByRole('heading', { name: 'Measured parameter thresholds' });
    expect(await screen.findByText('Reference values only. Calibration is logged above.')).toBeInTheDocument();
    expect(screen.getByText('Reference values only. Calibration is logged above.').parentElement).toBe(heading.parentElement);
    expect(screen.getByRole('row', { name: 'Temperature (°C) 26 °C 30 °C' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Dissolved oxygen (mg/L) 4 mg/L Not set' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Minimum')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Maximum')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review and save' })).not.toBeInTheDocument();
  });
});

describe('audit logs', () => {
  it('filters Manila dates, user, action and detail, paginates and clears filters', async () => {
    signIn('admin');
    const logs: AuditLog[] = Array.from({ length: 27 }, (_, i) => ({ id: String(i), timestamp: '2026-01-01T16:30:00Z', user: i === 26 ? 'Other' : 'Alice', action: i === 26 ? 'Delete' : 'Edit', detail: `Entry ${i}` }));
    vi.spyOn(api, 'listAuditLogs').mockResolvedValue(logs);
    window.history.replaceState({}, '', '/admin/logs');
    render(<App />);
    expect(await screen.findByText('27 results')).toBeInTheDocument();
    const searchTools = screen.getByRole('searchbox', { name: 'Search detail' }).closest('.audit-log-tools');
    expect(searchTools).toContainElement(screen.getByRole('button', { name: 'Clear filters' }));
    expect(searchTools).toContainElement(screen.getByRole('button', { name: 'Export CSV' }));
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' }).querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('From date (Manila)'), { target: { value: '2026-01-02' } });
    fireEvent.change(screen.getByLabelText('To date (Manila)'), { target: { value: '2026-01-02' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'User' }));
    fireEvent.click(screen.getByRole('option', { name: 'Other' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Action' }));
    fireEvent.click(screen.getByRole('option', { name: 'Delete' }));
    fireEvent.change(screen.getByLabelText('Search detail'), { target: { value: 'ENTRY 26' } });
    expect(screen.getByText('1 result')).toBeInTheDocument();
    expect(screen.getByText('Entry 26')).toBeInTheDocument();
    const createUrl = vi.fn().mockReturnValue('blob:test');
    const revokeUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('hydrosense-audit-logs.csv');
    });
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('From date (Manila)'), { target: { value: '2026-01-03' } });
    expect(screen.getByText('0 results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('27 results')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(auditLogCsv([{ ...logs[0], detail: '=1,"x"' }])).toContain(`"'=1,""x"""`);
  });
});
