import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { authService } from '../services/authService';
import { tierConfig } from './config';
import { queryClient } from './query';

const accountsKey = 'hydrosense.auth.accounts.v2';
const sessionKey = 'hydrosense.auth.session.v2';
const pendingAccount = {
  user: {
    id: 'pending-user',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.test',
    role: null,
    requestedRole: null,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  passwordSalt: 'salt',
  passwordHash: 'hash',
};
const operatorAccount = {
  ...pendingAccount,
  user: { ...pendingAccount.user, id: 'operator', email: 'operator@example.test', role: 'operator', status: 'approved' },
};
const queryDefaults = queryClient.getDefaultOptions();

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  queryClient.setDefaultOptions({ ...queryDefaults, queries: { ...queryDefaults.queries, retry: false } });
  window.sessionStorage.setItem(sessionKey, JSON.stringify({ userId: 'demo-admin' }));
  window.history.replaceState({}, '', '/alerts');
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  queryClient.setDefaultOptions(queryDefaults);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(accountsKey);
  window.sessionStorage.removeItem(sessionKey);
  window.localStorage.removeItem('hydrosense.theme');
});

describe('admin account request alerts', () => {
  it('distinguishes account requests from reading alerts with icons', async () => {
    window.localStorage.setItem(accountsKey, JSON.stringify([pendingAccount]));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /including 1 pending account request/ }));
    const notifications = screen.getByRole('dialog', { name: 'Current notifications' });
    const request = within(notifications).getByRole('link', { name: /1 pending account request/ });
    expect(request.querySelector('svg.lucide-user-round')).not.toBeNull();
    expect(request).toHaveClass('notification-item');
    expect(request).toHaveAttribute('href', '/admin/users');
    expect(screen.queryByRole('region', { name: 'Pending account requests' })).not.toBeInTheDocument();
    await waitFor(() => expect(notifications.querySelector('a[href="/alerts"] svg.lucide-triangle-alert')).not.toBeNull());
  });

  it('detects a new request while the admin is on the alerts page', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Alerts Center' });
    await waitFor(() => expect(screen.getByRole('button', { name: /^\d+ open alerts?$/ })).not.toBeNull());

    window.localStorage.setItem(accountsKey, JSON.stringify([pendingAccount]));

    fireEvent.click(await screen.findByRole('button', { name: /including 1 pending account request/ }, { timeout: tierConfig.refreshIntervalMs + 3000 }));
    expect(within(screen.getByRole('dialog', { name: 'Current notifications' })).getByRole('link', { name: /1 pending account request/ })).toHaveAttribute('href', '/admin/users');
  }, tierConfig.refreshIntervalMs + 5000);

  it.each(['Approve', 'Reject'] as const)('removes a request alert after an admin selects %s', async (action) => {
    window.localStorage.setItem(accountsKey, JSON.stringify([pendingAccount]));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /including 1 pending account request/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Current notifications' })).getByRole('link', { name: /1 pending account request/ }));
    await screen.findByRole('heading', { name: 'Users & Roles' });
    if (action === 'Approve') {
      fireEvent.click(screen.getByRole('combobox', { name: 'Review role for Jane Smith' }));
      fireEvent.click(screen.getByRole('option', { name: 'Operator' }));
    }
    fireEvent.click(screen.getByRole('button', { name: `${action} Jane Smith` }));
    const confirmation = screen.getByRole('dialog', { name: action === 'Approve' ? 'Approve account request?' : 'Reject account request?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: action === 'Approve' ? 'Approve request' : 'Reject request' }));
    await screen.findByText('No account requests are awaiting review.');
    await waitFor(() => expect(screen.getByRole('button', { name: /^\d+ open alerts?$/ })).not.toBeNull());
    fireEvent.click(screen.getByRole('link', { name: 'Alerts Center' }));
    await screen.findByRole('heading', { name: 'Alerts Center' });
    expect(screen.queryByRole('button', { name: /pending account request/ })).toBeNull();
  });

  it('does not fetch or display requests for a non-admin', async () => {
    window.localStorage.setItem(accountsKey, JSON.stringify([pendingAccount, operatorAccount]));
    window.sessionStorage.setItem(sessionKey, JSON.stringify({ userId: 'operator' }));
    const listRequests = vi.spyOn(authService, 'listPendingRequests');
    render(<App />);
    await screen.findByRole('heading', { name: 'Alerts Center' });
    expect(listRequests).not.toHaveBeenCalled();
    expect(screen.queryByText('New account request: Jane Smith')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Review account requests' })).toBeNull();
  });

  it('hides cached account requests when the session changes to an operator', async () => {
    window.localStorage.setItem(accountsKey, JSON.stringify([pendingAccount, operatorAccount]));
    const listRequests = vi.spyOn(authService, 'listPendingRequests');
    render(<App />);
    await screen.findByRole('button', { name: /including 1 pending account request/ });
    listRequests.mockClear();

    window.sessionStorage.setItem(sessionKey, JSON.stringify({ userId: 'operator' }));
    fireEvent(window, new Event('hydrosense:auth-change'));

    await waitFor(() => expect(screen.queryByRole('button', { name: /pending account request/ })).toBeNull());
    expect(listRequests).not.toHaveBeenCalled();
  });

  it('reports an error when account requests cannot be loaded', async () => {
    const listRequests = vi.spyOn(authService, 'listPendingRequests').mockRejectedValue(new Error('Account requests could not be loaded.'));
    render(<App />);
    expect(await screen.findByRole('button', { name: /account requests unavailable/ })).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Users & Roles' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Account requests could not be loaded.');
    listRequests.mockResolvedValue([]);
    fireEvent.click(within(error).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No account requests are awaiting review.')).toBeInTheDocument();
  });
});
