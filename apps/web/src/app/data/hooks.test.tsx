import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeviceStatuses, useLatestReading } from './hooks';

const mocks = vi.hoisted(() => ({
  listTanks: vi.fn(),
  listDeviceStatuses: vi.fn(),
  getLatestReading: vi.fn(),
}));

vi.mock('../config', () => ({ DATA_MODE: 'api', tierConfig: { refreshIntervalMs: 5_000 } }));
vi.mock('../api', () => ({
  api: mocks,
  liveClient: { subscribe: () => () => {} },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('monitor API refresh', () => {
  it('updates device status and readings without a WebSocket event', async () => {
    vi.useFakeTimers();
    const tank = { id: 'tank-1', name: 'Tank 1', site: 'Site', deviceId: 'device-1', rearingStartDate: '2026-01-01' };
    const status = { deviceId: 'device-1', online: false, lastSeen: '2026-01-01T00:00:00Z', batteryPct: 0, powerSource: 'grid', wifiRssi: -60, pendingSyncCount: 0 };
    const reading = { id: 'reading-1', tankId: tank.id, timestamp: '2026-01-01T00:00:00Z', temperature: 27, doMgL: 5, ph: 7 };
    mocks.listTanks.mockResolvedValue([tank]);
    mocks.listDeviceStatuses.mockResolvedValueOnce([status]).mockResolvedValue([{ ...status, online: true }]);
    mocks.getLatestReading.mockResolvedValueOnce(reading).mockResolvedValue({ ...reading, temperature: 28 });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const rendered = renderHook(() => {
      useDeviceStatuses();
      useLatestReading(tank.id);
    }, { wrapper });

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(client.getQueryData(['device-status'])).toEqual([status]);
    expect(client.getQueryData(['latest-reading', tank.id])).toEqual(reading);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(client.getQueryData(['device-status'])).toEqual([{ ...status, online: true }]);
    expect(client.getQueryData(['latest-reading', tank.id])).toEqual({ ...reading, temperature: 28 });

    rendered.unmount();
    client.clear();
  });
});
