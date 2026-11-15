import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  { id: 'u1', name: 'Local Operator', email: 'local-op@example.com', role: 'operator', site: hatchery.name, phone: 'bad', active: true, lastActive: '2026-01-01T00:00:00Z' },
  { id: 'u2', name: 'Local Manager', email: 'local-manager@example.com', role: 'manager', site: hatchery.name, active: true, lastActive: '2026-01-01T00:00:00Z' },
  { id: 'u3', name: 'Local Admin', email: 'local-admin@example.com', role: 'admin', site: hatchery.name, active: true, lastActive: '2026-01-01T00:00:00Z' },
  { id: 'u4', name: 'Other Operator', email: 'other-op@example.com', role: 'operator', site: 'Other hatchery', active: true, lastActive: '2026-01-01T00:00:00Z' },
];

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
  it('filters manager display by hatchery, excludes admins and disables approvals', async () => {
    signIn('manager', hatchery.id);
    mockAccounts();
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Users & roles', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users & roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: hatchery.name })).toBeInTheDocument();
    expect(screen.getByText('Review operator accounts for your hatchery.')).toBeInTheDocument();
    const requests = await screen.findByRole('region', { name: 'Pending requests table' });
    expect(within(requests).getByText('Local Applicant')).toBeInTheDocument();
    expect(within(requests).queryByText('Other Applicant')).not.toBeInTheDocument();
    expect(within(requests).getByText('Valid for SMS')).toBeInTheDocument();
    expect(within(requests).getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(requests).getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(within(requests).getByText('Manager approvals are not connected yet.')).toBeInTheDocument();
    expect(within(requests).queryByRole('combobox')).not.toBeInTheDocument();
    const accounts = await screen.findByRole('region', { name: 'Team accounts table' });
    expect(within(accounts).getByText('Local Operator')).toBeInTheDocument();
    expect(within(accounts).getByText('Local Manager')).toBeInTheDocument();
    expect(within(accounts).getByText('Not valid for SMS')).toBeInTheDocument();
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

  it('preserves admin visibility and requires confirmation for role changes', async () => {
    signIn('admin');
    mockAccounts();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const update = vi.spyOn(api, 'updateUserRole').mockRejectedValue(new Error('Update failed'));
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    const requests = await screen.findByRole('region', { name: 'Pending requests table' });
    expect(within(requests).getByText('Other Applicant')).toBeInTheDocument();
    const approvalRole = within(requests).getByRole('combobox', { name: 'Approval role for Local Applicant' });
    expect(within(approvalRole).queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
    expect(within(requests).getByRole('columnheader', { name: 'Requested role' })).toBeInTheDocument();
    const accounts = await screen.findByRole('region', { name: 'Team accounts table' });
    expect(within(accounts).getByText('Other Operator')).toBeInTheDocument();
    expect(within(accounts).getByText('Local Admin')).toBeInTheDocument();
    const select = within(accounts).getByRole('combobox', { name: 'Role for Local Operator' });
    fireEvent.change(select, { target: { value: 'manager' } });
    expect(confirm).toHaveBeenCalledWith('Change Local Operator from Operator to Manager?');
    expect(select).toHaveValue('operator');
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'manager' } });
    await waitFor(() => expect(update).toHaveBeenCalledWith('u1', 'manager', 'Test User'));
    expect(await screen.findByText('Update failed')).toBeInTheDocument();
  });

  it.each([['operator', '/admin/users'], ['operator', '/admin/logs'], ['manager', '/admin/logs']] as const)('denies %s access to %s', async (role, path) => {
    signIn(role, hatchery.id);
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Live monitor', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: 'Audit & system logs' })).not.toBeInTheDocument();
  });

  it('surfaces manager authorization failures from the existing services', async () => {
    signIn('manager', hatchery.id);
    vi.spyOn(api, 'listUsers').mockRejectedValue(new Error('Not authorized'));
    vi.spyOn(authService, 'listPendingRequests').mockRejectedValue(new Error('Requests not authorized'));
    window.history.replaceState({}, '', '/admin/users');
    render(<App />);
    expect(await screen.findByText(/Not authorized/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText(/Requests not authorized/, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('threshold review', () => {
  it('shows before and after values and prevents unchanged confirmation', async () => {
    signIn('admin');
    vi.spyOn(api, 'listThresholds').mockResolvedValue(DEFAULT_THRESHOLDS.map((item) => ({ ...item })));
    vi.spyOn(api, 'getAdvisorySettings').mockResolvedValue({ ...DEFAULT_ADVISORY_RULES });
    const update = vi.spyOn(api, 'updateThresholds');
    window.history.replaceState({}, '', '/settings/thresholds');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review and save' }));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Confirm changes' })).toBeDisabled();
    expect(screen.queryByText(/Last changed by/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const field = screen.getByLabelText('Salinity watch temperature (°C)');
    const previous = (field as HTMLInputElement).value;
    fireEvent.change(field, { target: { value: String(Number(previous) - 1) } });
    const phField = screen.getByLabelText('Ammonia high pH');
    const previousPh = (phField as HTMLInputElement).value;
    fireEvent.change(phField, { target: { value: String(Number(previousPh) + 0.1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(`Salinity watch temperature (°C): ${previous} → ${Number(previous) - 1}`)).toBeInTheDocument();
    expect(within(dialog).getByText(`Ammonia high pH: ${previousPh} → ${Number(previousPh) + 0.1}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirm changes' })).toBeEnabled();
    expect(update).not.toHaveBeenCalled();
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
    expect(screen.getAllByRole('row')).toHaveLength(26);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('From date (Manila)'), { target: { value: '2026-01-02' } });
    fireEvent.change(screen.getByLabelText('To date (Manila)'), { target: { value: '2026-01-02' } });
    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'Other' } });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'Delete' } });
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
