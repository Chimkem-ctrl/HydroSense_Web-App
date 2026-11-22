import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpApiClient } from './httpClient';

afterEach(() => vi.unstubAllGlobals());

describe('HTTP API authorization errors', () => {
  it.each([401, 403])('surfaces a %s response instead of returning data', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Forbidden' }), {
      status, statusText: status === 401 ? 'Unauthorized' : 'Forbidden',
    })));
    const api = new HttpApiClient('https://example.test');
    await expect(api.listValidationRows()).rejects.toThrow(`HydroSense API ${status}`);
  });

  it('notifies the caller only when an authenticated request receives 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const onUnauthorized = vi.fn();
    const api = new HttpApiClient('https://example.test', () => 'current-token', undefined, onUnauthorized);
    await expect(api.listTanks()).rejects.toThrow('401');
    await expect(api.listTanks()).rejects.toThrow('403');
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledWith('current-token');
  });
});
