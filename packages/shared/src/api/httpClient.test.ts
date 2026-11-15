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
});
