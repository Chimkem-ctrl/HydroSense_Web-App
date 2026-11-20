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
      role: 'manager', requested_role: 'operator', status: 'approved', site: 'camiguin-sagay', employee_id: 'EMP-1',
      emergency_contact_phone: '123',
    }])));
    vi.stubGlobal('fetch', fetchMock);
    const { getAccountProfile, setMobileAccessToken } = await import('./client');
    setMobileAccessToken('token');
    const profile = await getAccountProfile('1');
    expect(profile).toMatchObject({ name: 'Test User', site: 'camiguin-sagay', employeeId: 'EMP-1', requestedRole: 'operator', emergencyContactPhone: '123' });
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

  it('rejects the obsolete demo configuration rather than displaying sample data', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'mock');
    await expect(import('./client')).rejects.toThrow('Mobile sample data is no longer supported');
  });

  it('rejects missing or invalid thresholds instead of substituting sample limits', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'api');
    const { getConfiguredThreshold } = await import('./client');
    expect(getConfiguredThreshold([{ parameter: 'do', min: 5 }], 'do')).toEqual({ parameter: 'do', min: 5 });
    expect(() => getConfiguredThreshold([], 'do')).toThrow('Threshold configuration is missing or invalid');
    expect(() => getConfiguredThreshold([{ parameter: 'do' }], 'do')).toThrow('Threshold configuration is missing or invalid');
    expect(() => getConfiguredThreshold([{ parameter: 'do', min: 8, max: 5 }], 'do')).toThrow('Threshold configuration is missing or invalid');
    expect(() => getConfiguredThreshold([{ parameter: 'do', min: 5 }, { parameter: 'do', min: 6 }], 'do')).toThrow('Threshold configuration is missing or invalid');
  });

  it('requires all configured thresholds when loading data for analysis', async () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_MODE', 'api');
    const { api, listConfiguredThresholds } = await import('./client');
    const list = vi.spyOn(api, 'listThresholds');
    list.mockResolvedValueOnce([{ parameter: 'temperature', min: 28 }, { parameter: 'do', min: 5 }]);
    await expect(listConfiguredThresholds()).rejects.toThrow('ph');
    const configured = [{ parameter: 'temperature' as const, min: 28 }, { parameter: 'do' as const, min: 5 }, { parameter: 'ph' as const, min: 7, max: 8 }];
    list.mockResolvedValueOnce(configured);
    await expect(listConfiguredThresholds()).resolves.toEqual(configured);
    list.mockRestore();
  });
});
