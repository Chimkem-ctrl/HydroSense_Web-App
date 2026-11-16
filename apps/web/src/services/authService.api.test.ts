import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_DATA_MODE', 'api');
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('API account review', () => {
  it('maps pending and approved profile sites from the API', async () => {
    window.localStorage.setItem('hydrosense.auth.user', JSON.stringify({ id: 'admin', role: 'admin' }));
    window.localStorage.setItem('hydrosense.auth.access-token', 'token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', firstName: 'Pending', lastName: 'User', email: 'pending@example.test', role: null, requestedRole: 'operator', site: 'camiguin-sagay', createdAt: '2026-01-01' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '2', firstName: 'Approved', lastName: 'User', email: 'approved@example.test', role: 'operator', site: 'camiguin-sagay', createdAt: '2026-01-01' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { authService, hatcheryLabel } = await import('./authService');
    const pending = await authService.listPendingRequests();
    const approved = await authService.listApprovedUsers();
    expect(pending[0].hatcheryId).toBe('camiguin-sagay');
    expect(approved[0].hatcheryId).toBe('camiguin-sagay');
    expect(hatcheryLabel(pending[0].hatcheryId)).toBe('Camiguin, Sagay Multispecies Hatchery');
    expect(fetchMock.mock.calls[0][0]).toContain('status=pending');
    expect(fetchMock.mock.calls[1][0]).toContain('status=approved');
  });

  it('stores the sign-in site and fetches the latest profile assignment', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
        status: 'approved', role: 'operator', site: 'Original site', created_at: '2026-01-01',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ site: 'Updated site' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { authService, getCurrentUser } = await import('./authService');
    const result = await authService.signIn('jane@example.test', 'password');
    expect(result.user?.hatcheryId).toBe('Original site');
    expect(getCurrentUser()?.hatcheryId).toBe('Original site');
    expect(await authService.getProfileSite(result.user!)).toBe('Updated site');
    expect(fetchMock.mock.calls[2][0]).toContain('/rest/v1/profiles?id=eq.1&select=site');
  });

  it('reports a profile site lookup failure', async () => {
    window.localStorage.setItem('hydrosense.auth.access-token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Access denied' }), { status: 403 })));
    const { authService } = await import('./authService');
    await expect(authService.getProfileSite({
      id: '1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test',
      role: 'operator', requestedRole: null, status: 'approved', createdAt: '2026-01-01',
    })).rejects.toThrow('Access denied');
  });

  it('lists unassigned pending requests and sends the selected admin role', async () => {
    window.localStorage.setItem('hydrosense.auth.user', JSON.stringify({ id: 'admin', role: 'admin' }));
    window.localStorage.setItem('hydrosense.auth.access-token', 'token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test', status: 'pending', role: null, requestedRole: null, createdAt: '2026-01-01' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '1', status: 'approved', role: 'admin' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { authService } = await import('./authService');
    expect(await authService.listPendingRequests()).toMatchObject([{ firstName: 'Jane', lastName: 'Smith', role: null }]);
    await authService.approveRequest('1', 'admin');
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ status: 'approved', role: 'admin' }));
  });

  it('does not present a rejected account as pending', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ status: 'rejected', role: null }]), { status: 200 })));
    const { authService } = await import('./authService');
    await expect(authService.signIn('jane@example.test', 'password')).rejects.toThrow('Request not approved.');
  });
});
