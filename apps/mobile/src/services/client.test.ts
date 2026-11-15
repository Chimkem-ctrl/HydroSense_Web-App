import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('mobile pending account review', () => {
  it('loads the signed-in profile and rejects invalid hatchery data', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://example.test/api');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '1', name: 'Test User', email: 'test@example.test', role: 'manager', status: 'approved', site: 'camiguin-sagay', phone: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '1', name: 'Test User', email: 'test@example.test', role: 'manager', status: 'approved', site: 123 })));
    vi.stubGlobal('fetch', fetchMock);
    const { getAccountProfile, setMobileAccessToken } = await import('./client');
    setMobileAccessToken('token');
    const profile = await getAccountProfile('1');
    expect(profile.site).toBe('camiguin-sagay');
    expect(profile.phone).toBeNull();
    expect(profile.address).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/profile', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }));
    await expect(getAccountProfile('1')).rejects.toThrow('profile field site');
  });

  it('reads the signed-in Supabase profile directly and maps its fields', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://example.test/functions/v1/api');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: '1', first_name: 'Test', last_name: 'User', email: 'test@example.test',
      role: 'manager', status: 'approved', site: 'camiguin-sagay', employee_id: 'EMP-1',
      emergency_contact_phone: '123',
    }])));
    vi.stubGlobal('fetch', fetchMock);
    const { getAccountProfile, setMobileAccessToken } = await import('./client');
    setMobileAccessToken('token');
    const profile = await getAccountProfile('1');
    expect(profile).toMatchObject({ name: 'Test User', site: 'camiguin-sagay', employeeId: 'EMP-1', emergencyContactPhone: '123' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/rest/v1/profiles?id=eq.1&select=*', expect.objectContaining({
      headers: { apikey: 'public-key', Authorization: 'Bearer token' },
    }));
  });

  it('reports Supabase authorization and missing profile errors without using a fallback', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://example.test/functions/v1/api');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'JWT expired' }), { status: 401 }))
      .mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);
    const { getAccountProfile, setMobileAccessToken } = await import('./client');
    setMobileAccessToken('token');
    await expect(getAccountProfile('1')).rejects.toThrow('JWT expired');
    await expect(getAccountProfile('1')).rejects.toThrow('profile was not found');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the signed-in token to list and review requests, including admin approval', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'api');
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://example.test/api');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const { setMobileAccessToken, listPendingAccounts, reviewPendingAccount } = await import('./client');
    setMobileAccessToken('token');
    expect(await listPendingAccounts()).toHaveLength(1);
    await reviewPendingAccount('1', 'admin');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.test/api/v1/admin/users/1', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      body: JSON.stringify({ status: 'approved', role: 'admin' }),
    }));
    await expect(reviewPendingAccount('1', null)).rejects.toThrow('Forbidden.');
  });

  it('reports that review is unavailable in demo mode instead of pretending success', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'mock');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { listPendingAccounts, reviewPendingAccount } = await import('./client');
    await expect(listPendingAccounts()).rejects.toThrow('unavailable in mobile demo mode');
    await expect(reviewPendingAccount('1', 'operator')).rejects.toThrow('unavailable in mobile demo mode');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
