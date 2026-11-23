import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function tokenFor(id: string, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return `header.${btoa(JSON.stringify({ sub: id, exp: expiresAt }))}.signature`;
}

async function establishSession(id: string, role: 'operator' | 'manager' | 'admin') {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id }, access_token: tokenFor(id) }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{
      id, first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
      status: 'approved', role, created_at: '2026-01-01',
    }]), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const service = await import('./authService');
  await service.authService.signIn('jane@example.test', 'password');
  return service;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_DATA_MODE', 'api');
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

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
    const { authService, getCurrentUser } = await establishSession('1', 'operator');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ avatarUrl: 'https://storage.example/old-avatar' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ avatarUrl: 'https://storage.example/new-avatar' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await authService.getProfileAvatarUrl()).toBe('https://storage.example/old-avatar');
    const file = new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' });
    expect(await authService.saveProfileAvatar(file)).toBe('https://storage.example/new-avatar');
    expect(fetchMock.mock.calls[1][0]).toContain('/v1/profile/avatar');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[1][1].headers['Content-Type']).toBe('image/png');
    expect(getCurrentUser()?.avatarUrl).toBe('https://storage.example/new-avatar');
  });

  it('maps pending and approved profile sites from the API', async () => {
    const { authService, hatcheryLabel } = await establishSession('admin', 'admin');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', firstName: 'Pending', lastName: 'User', email: 'pending@example.test', role: null, requestedRole: 'operator', site: 'camiguin-sagay', createdAt: '2026-01-01' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '2', firstName: 'Approved', lastName: 'User', email: 'approved@example.test', role: 'operator', site: 'camiguin-sagay', createdAt: '2026-01-01' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: tokenFor('1') }), { status: 200 }))
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: tokenFor('1') }), { status: 200 }))
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
    const { authService } = await establishSession('1', 'operator');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Access denied' }), { status: 403 })));
    await expect(authService.getProfileSite({
      id: '1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test',
      role: 'operator', requestedRole: null, status: 'approved', createdAt: '2026-01-01',
    })).rejects.toThrow('Access denied');
  });

  it('lists unassigned pending requests and sends the selected admin role', async () => {
    const { authService } = await establishSession('admin', 'admin');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test', status: 'pending', role: null, requestedRole: null, createdAt: '2026-01-01' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '1', status: 'approved', role: 'admin' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await authService.listPendingRequests()).toMatchObject([{ firstName: 'Jane', lastName: 'Smith', role: null }]);
    await authService.approveRequest('1', 'admin');
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ status: 'approved', role: 'admin' }));
  });

  it('does not present a rejected account as pending', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: tokenFor('1') }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', status: 'rejected', role: null }]), { status: 200 })));
    const { authService } = await import('./authService');
    await expect(authService.signIn('jane@example.test', 'password')).rejects.toThrow('Request not approved.');
  });

  it('restores a session after a reload using the server-verified profile', async () => {
    await establishSession('1', 'operator');
    window.sessionStorage.setItem('hydrosense.auth.user', JSON.stringify({ id: '1', role: 'admin' }));
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
      status: 'approved', role: 'operator', created_at: '2026-01-01',
    }]))));
    const { restoreSessionOnLaunch, getCurrentUser, getApiAccessToken, signOut } = await import('./authService');
    await restoreSessionOnLaunch();
    expect(getCurrentUser()).toMatchObject({ id: '1', role: 'operator' });
    expect(getApiAccessToken()).toBe(tokenFor('1'));
    signOut();
    await restoreSessionOnLaunch();
    expect(getCurrentUser()).toBeNull();
  });

  it('preserves saved credentials when session verification cannot reach the server', async () => {
    await establishSession('1', 'operator');
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    const { restoreSessionOnLaunch } = await import('./authService');
    await expect(restoreSessionOnLaunch()).rejects.toThrow('Network unavailable');
    expect(window.sessionStorage.getItem('hydrosense.auth.access-token')).not.toBeNull();
  });

  it('clears a session rejected by the server on reload', async () => {
    await establishSession('1', 'operator');
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const { restoreSessionOnLaunch, getCurrentUser } = await import('./authService');
    await restoreSessionOnLaunch();
    expect(getCurrentUser()).toBeNull();
    expect(window.sessionStorage.getItem('hydrosense.auth.access-token')).toBeNull();
  });

  it('renews an expired session before restoring it on reload', async () => {
    window.sessionStorage.setItem('hydrosense.auth.access-token', tokenFor('1', 1));
    window.sessionStorage.setItem('hydrosense.auth.refresh-token', 'old-refresh');
    window.sessionStorage.setItem('hydrosense.auth.user', JSON.stringify({ id: '1' }));
    const newToken = tokenFor('1');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: newToken, refresh_token: 'new-refresh' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
        status: 'approved', role: 'operator', created_at: '2026-01-01',
      }])));
    vi.stubGlobal('fetch', fetchMock);
    const { restoreSessionOnLaunch, getCurrentUser, getApiAccessToken } = await import('./authService');
    await restoreSessionOnLaunch();
    expect(fetchMock.mock.calls[0][0]).toContain('grant_type=refresh_token');
    expect(getCurrentUser()).toMatchObject({ id: '1', role: 'operator' });
    expect(getApiAccessToken()).toBe(newToken);
    expect(window.sessionStorage.getItem('hydrosense.auth.refresh-token')).toBe('new-refresh');
  });

  it('renews the access token before it expires without signing out', async () => {
    vi.useFakeTimers();
    try {
      const oldToken = tokenFor('1');
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: oldToken, refresh_token: 'old-refresh' })))
        .mockResolvedValueOnce(new Response(JSON.stringify([{
          id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
          status: 'approved', role: 'operator', created_at: '2026-01-01',
        }])));
      vi.stubGlobal('fetch', fetchMock);
      const { authService, getCurrentUser, getApiAccessToken, signOut } = await import('./authService');
      await authService.signIn('jane@example.test', 'password');
      const newToken = tokenFor('1', Math.floor(Date.now() / 1000) + 7200);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: newToken, refresh_token: 'new-refresh' })));
      await vi.advanceTimersByTimeAsync(3_540_000);
      expect(getCurrentUser()?.id).toBe('1');
      expect(getApiAccessToken()).toBe(newToken);
      signOut();
      expect(window.sessionStorage.getItem('hydrosense.auth.refresh-token')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not immediately loop when the server issues short-lived tokens', async () => {
    vi.useFakeTimers();
    try {
      const shortToken = tokenFor('1', Math.floor(Date.now() / 1000) + 30);
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: shortToken, refresh_token: 'refresh' })))
        .mockResolvedValueOnce(new Response(JSON.stringify([{
          id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
          status: 'approved', role: 'operator', created_at: '2026-01-01',
        }])));
      vi.stubGlobal('fetch', fetchMock);
      const { authService, signOut } = await import('./authService');
      await authService.signIn('jane@example.test', 'password');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      signOut();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not restore a session if sign-out happens during renewal', async () => {
    window.sessionStorage.setItem('hydrosense.auth.access-token', tokenFor('1', 1));
    window.sessionStorage.setItem('hydrosense.auth.refresh-token', 'old-refresh');
    window.sessionStorage.setItem('hydrosense.auth.user', JSON.stringify({ id: '1' }));
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { respond = resolve; })));
    const { restoreSessionOnLaunch, getCurrentUser, signOut } = await import('./authService');
    const restoring = restoreSessionOnLaunch();
    signOut();
    respond(new Response(JSON.stringify({ access_token: tokenFor('1'), refresh_token: 'new-refresh' })));
    await restoring;
    expect(getCurrentUser()).toBeNull();
    expect(window.sessionStorage.getItem('hydrosense.auth.refresh-token')).toBeNull();
  });

  it('keeps the session and retries when renewal fails temporarily', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const oldToken = tokenFor('1');
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: oldToken, refresh_token: 'old-refresh' })))
        .mockResolvedValueOnce(new Response(JSON.stringify([{
          id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test',
          status: 'approved', role: 'operator', created_at: '2026-01-01',
        }])))
        .mockRejectedValueOnce(new Error('Network unavailable'));
      vi.stubGlobal('fetch', fetchMock);
      const { authService, getCurrentUser, getApiAccessToken, signOutIfTokenMatches, signOut } = await import('./authService');
      await authService.signIn('jane@example.test', 'password');
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(getCurrentUser()?.id).toBe('1');
      expect(getApiAccessToken()).toBeNull();
      signOutIfTokenMatches(oldToken);
      expect(getCurrentUser()?.id).toBe('1');
      const newToken = tokenFor('1');
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: newToken, refresh_token: 'new-refresh' })));
      await vi.advanceTimersByTimeAsync(15_001);
      expect(getApiAccessToken()).toBe(newToken);
      expect(consoleError).toHaveBeenCalled();
      signOut();
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it.each(['invalid', tokenFor('1', 1)])('rejects a malformed or expired sign-in token', async (token) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: '1' }, access_token: token }), { status: 200 })));
    const { authService, getCurrentUser } = await import('./authService');
    await expect(authService.signIn('jane@example.test', 'password')).rejects.toThrow('invalid or expired');
    expect(getCurrentUser()).toBeNull();
  });

  it('does not create a session when the server rejects the access token', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' }, access_token: tokenFor('1') }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401 })));
    const { authService, getCurrentUser } = await import('./authService');
    await expect(authService.signIn('jane@example.test', 'password')).rejects.toThrow('Invalid token');
    expect(getCurrentUser()).toBeNull();
    expect(window.sessionStorage.getItem('hydrosense.auth.access-token')).toBeNull();
  });

  it.each(['missing', 'replaced'])('clears a session when its token is %s', async (change) => {
    const { getCurrentUser } = await establishSession('1', 'operator');
    expect(getCurrentUser()).not.toBeNull();
    if (change === 'missing') window.sessionStorage.removeItem('hydrosense.auth.access-token');
    else window.sessionStorage.setItem('hydrosense.auth.access-token', tokenFor('other'));
    expect(getCurrentUser()).toBeNull();
    expect(window.sessionStorage.getItem('hydrosense.auth.user')).toBeNull();
  });

  it('signs out an active session when the token expires', async () => {
    vi.useFakeTimers();
    try {
      const { getCurrentUser } = await establishSession('1', 'operator');
      expect(getCurrentUser()).not.toBeNull();
      vi.advanceTimersByTime(3_600_000);
      expect(getCurrentUser()).toBeNull();
      expect(window.sessionStorage.getItem('hydrosense.auth.access-token')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('signs out only when a rejected request used the current token', async () => {
    const { getCurrentUser, getApiAccessToken, signOutIfTokenMatches } = await establishSession('1', 'operator');
    const token = getApiAccessToken();
    if (!token) throw new Error('Expected a signed-in session.');
    signOutIfTokenMatches('older-token');
    expect(getCurrentUser()).not.toBeNull();
    signOutIfTokenMatches(token);
    expect(getCurrentUser()).toBeNull();
  });
});
