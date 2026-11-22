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

async function establishSession(id: string, role: 'operator' | 'manager') {
  window.localStorage.setItem('hydrosense.auth.access-token', 'current-token');
  window.localStorage.setItem('hydrosense.auth.user', JSON.stringify({
    id,
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.test',
    role,
    requestedRole: null,
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  return import('./authService');
}

describe('API account review', () => {
  it('changes the authenticated account password without replacing its session', async () => {
    const { authService, getApiAccessToken } = await establishSession('1', 'operator');
    const token = getApiAccessToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: 'verification-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '1' })));
    vi.stubGlobal('fetch', fetchMock);
    await authService.changePassword('old-password', 'new-password', 'new-password');
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/auth/v1/user'), expect.objectContaining({
      method: 'PUT', headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
    }));
    expect(getApiAccessToken()).toBe(token);
  });

  it('returns the verification route and email after API signup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'verify-email',
      email: 'jane@example.test',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { authService } = await import('./authService');
    const result = await authService.signUp({
      firstName: 'Jane',
      lastName: 'Smith',
      employeeId: 'EMP-123',
      phone: '+639175550100',
      email: 'jane@example.test',
      password: 'TestPass123',
      hatcheryId: 'camiguin-sagay',
      requestedRole: 'operator',
      address: { country: 'PH', province: '1001800000', city: '1001805000', barangay: '1001805001', street: 'Main Street' },
      emergencyContactName: 'John Smith',
      emergencyContactPhone: '+639175550101',
      confirmPassword: 'TestPass123',
      termsAccepted: true,
    });

    expect(result).toEqual({
      status: 'verify-email',
      email: 'jane@example.test',
      redirectPath: '/verify-email',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ requestedRole: 'operator' });
  });

  it('resends signup verification emails through Supabase Auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { authService } = await import('./authService');

    await authService.resendVerification('Jane@Example.test');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/resend'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: expect.any(String),
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ type: 'signup', email: 'jane@example.test' }),
      }),
    );
  });

  it('maps resend rate limits to the verification cooldown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    const { authService } = await import('./authService');

    await expect(authService.resendVerification('jane@example.test'))
      .rejects.toThrow('Please wait before requesting another email.');
  });

  it('throws a typed error when Supabase reports an unconfirmed email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'email_not_confirmed',
      msg: 'Email not confirmed',
    }), { status: 400 })));
    const { authService, EmailNotVerifiedError } = await import('./authService');

    await expect(authService.signIn('jane@example.test', 'password'))
      .rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('loads and saves the signed-in user profile picture', async () => {
    window.localStorage.setItem('hydrosense.auth.user', JSON.stringify({
      id: '1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test',
      role: 'operator', requestedRole: null, status: 'approved', createdAt: '2026-01-01',
    }));
    window.localStorage.setItem('hydrosense.auth.access-token', 'token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ avatarUrl: 'https://storage.example/old-avatar' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ avatarUrl: 'https://storage.example/new-avatar' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { authService, getCurrentUser } = await import('./authService');
    expect(await authService.getProfileAvatarUrl()).toBe('https://storage.example/old-avatar');
    const file = new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' });
    expect(await authService.saveProfileAvatar(file)).toBe('https://storage.example/new-avatar');
    expect(fetchMock.mock.calls[1][0]).toContain('/v1/profile/avatar');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[1][1].headers['Content-Type']).toBe('image/png');
    expect(getCurrentUser()?.avatarUrl).toBe('https://storage.example/new-avatar');
  });

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
    expect(pending[0].requestedRole).toBe('operator');
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
    if (result.status !== 'approved') throw new Error('Expected the account to be approved.');
    expect(result.user.hatcheryId).toBe('Original site');
    expect(getCurrentUser()?.hatcheryId).toBe('Original site');
    expect(await authService.getProfileSite(result.user)).toBe('Updated site');
    expect(fetchMock.mock.calls[2][0]).toContain('/rest/v1/profiles?id=eq.1&select=site');
  });

  it('routes verified sign-ins with pending profiles to admin approval', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: '1',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.test',
        status: 'pending',
        role: null,
        created_at: '2026-01-01',
      }]), { status: 200 })));
    const { authService } = await import('./authService');

    await expect(authService.signIn('jane@example.test', 'password'))
      .resolves.toEqual({ status: 'pending', redirectPath: '/pending-approval' });
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
