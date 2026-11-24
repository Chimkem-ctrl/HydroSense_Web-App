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

  it('saves report metadata through the reports endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = new HttpApiClient('https://example.test', () => 'current-token');
    const report = {
      id: 'RPT-20261124-ABC234',
      reportType: 'pdf' as const,
      tankIds: ['tank-a'],
      rangeFrom: '2026-11-01T16:00:00.000Z',
      rangeTo: '2026-11-02T15:59:59.999Z',
    };

    await api.saveReport(report);

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/v1/reports', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(report),
    }));
  });
  it('identifies the failing endpoint without exposing query parameters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Internal server error."}', { status: 500 })));
    const api = new HttpApiClient('https://example.test');
    await expect(api.listAlerts('tank-1')).rejects.toThrow('HydroSense API 500 (/v1/alerts): {"error":"Internal server error."}');
  });
});

describe('HTTP API list responses', () => {
  it('treats null and empty list payloads as empty collections', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('null', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 })));
    const api = new HttpApiClient('https://example.test');
    await expect(api.listTanks()).resolves.toEqual([]);
    await expect(api.listActivityLogs()).resolves.toEqual([]);
    await expect(api.listThresholds()).resolves.toEqual([]);
  });

  it('surfaces a non-list response instead of hiding a malformed payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const api = new HttpApiClient('https://example.test');
    await expect(api.listDeviceStatuses()).rejects.toThrow('invalid list for /v1/devices/status');
  });
});
