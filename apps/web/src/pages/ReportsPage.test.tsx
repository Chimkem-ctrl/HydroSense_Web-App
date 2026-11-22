import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getManilaDateString } from '@hydrosense/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../app/api';
import { tierConfig } from '../app/config';
import ReportsPage from './ReportsPage';

const selectedTankContext = vi.hoisted(() => ({ hatchery: 'all' }));
vi.mock('../app/auth/RoleContext', () => ({ useRole: () => ({ role: 'admin', userName: 'Test Admin' }) }));
vi.mock('../app/tank/TankContext', () => ({ useSelectedTank: () => ({ tankId: 'tank-1', hatchery: selectedTankContext.hatchery, setHatchery: vi.fn(), locations: [{ id: 'camiguin-sagay', name: 'Sagay' }, { id: 'camiguin-benoni', name: 'Benoni' }] }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  selectedTankContext.hatchery = 'all';
  vi.spyOn(api, 'listTanks').mockResolvedValue([{ id: 'tank-1', name: 'Tank 01', site: 'Test site', rearingStartDate: '2025-01-01', deviceId: 'device-1' }]);
  vi.spyOn(api, 'listReadings').mockResolvedValue([{
    id: 'reading-1', tankId: 'tank-1', timestamp: new Date().toISOString(), temperature: 28, doMgL: 5, ph: 7.4,
  }]);
  vi.spyOn(api, 'listAlerts').mockResolvedValue([]);
  vi.spyOn(api, 'listThresholds').mockResolvedValue([]);
  vi.spyOn(api, 'listActivityLogs').mockResolvedValue([]);
  vi.spyOn(api, 'listCalibrationLogs').mockResolvedValue([]);
  vi.spyOn(api, 'listDeviceStatuses').mockResolvedValue([]);
  vi.spyOn(api, 'listValidationRows').mockResolvedValue([]);
});

function renderReportsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ReportsPage /></QueryClientProvider>);
}

describe('ReportsPage filters dropdown', () => {
  it('shows a clean empty state when Benoni has no tanks', async () => {
    selectedTankContext.hatchery = 'camiguin-benoni';
    vi.mocked(api.listTanks).mockResolvedValue([]);
    vi.mocked(api.listThresholds).mockRejectedValue(new Error('Thresholds should not be requested without tanks.'));
    renderReportsPage();
    expect(await screen.findByText('No tanks are available for the selected hatchery.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.listThresholds).not.toHaveBeenCalled();
  });

  it('prepares reports without requesting unused device status', async () => {
    renderReportsPage();
    expect(await screen.findByText('Water Quality Report')).toBeInTheDocument();
    expect(api.listDeviceStatuses).not.toHaveBeenCalled();
  });

  it('sets the current print-header time and restores the previous value after printing', () => {
    const root = document.documentElement;
    const property = '--report-print-header-time';
    root.style.setProperty(property, '"previous"');
    const { unmount } = renderReportsPage();
    window.dispatchEvent(new Event('beforeprint'));
    expect(JSON.parse(root.style.getPropertyValue(property))).toBe(new Date().toLocaleString(undefined, {
      year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }));
    window.dispatchEvent(new Event('afterprint'));
    expect(root.style.getPropertyValue(property)).toBe('"previous"');
    window.dispatchEvent(new Event('beforeprint'));
    unmount();
    expect(root.style.getPropertyValue(property)).toBe('"previous"');
    root.style.removeProperty(property);
  });

  it('prepares report headings for the selected sections and opens the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderReportsPage();
    const preview = await screen.findByRole('region', { name: 'Report preview' });
    await within(preview).findByText('Water Quality Report');
    expect(within(preview).getByText('Executive Summary')).toHaveClass('report-print-only');
    expect(within(preview).getByText('Water Quality Statistics')).toHaveClass('report-print-only');
    expect(within(preview).getByText('Operations And Data Quality')).toHaveClass('report-print-only');
    expect(within(preview).getByText('Reading Sample')).toHaveClass('report-print-only');
    fireEvent.click(within(preview).getByRole('button', { name: 'Print / Save PDF' }));
    expect(print).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Filters 9/9' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Report filters' })).getByRole('checkbox', { name: 'Statistics' }));
    expect(within(preview).queryByText('Water Quality Statistics')).not.toBeInTheDocument();
  });

  it('shows valid in-range percentages in the report chart and hides it with statistics', async () => {
    renderReportsPage();
    const chart = await screen.findByRole('img', { name: /Readings in range: Temperature 100.0%/ });
    expect(within(chart).getByText('DO')).toBeInTheDocument();
    expect(within(chart).getAllByText('100.0%')).toHaveLength(3);
    expect(within(chart).getByText('Temperature · 100.0% in range')).toHaveAttribute('aria-hidden', 'true');
    expect(chart.querySelectorAll('.report-bar-fill[style="width: 100%;"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Filters 9/9' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Report filters' })).getByRole('checkbox', { name: 'Statistics' }));
    expect(screen.queryByRole('img', { name: /Readings in range:/ })).not.toBeInTheDocument();
  });

  it('shows no-data labels rather than treating missing measurements as zero', async () => {
    vi.mocked(api.listReadings).mockResolvedValue([]);
    renderReportsPage();
    const chart = await screen.findByRole('img', { name: /Temperature no data/ });
    expect(within(chart).getAllByText('No data')).toHaveLength(3);
    expect(within(chart).getByText('Temperature · No data')).toHaveAttribute('aria-hidden', 'true');
    expect(chart.querySelectorAll('.report-bar-fill[style="width: 0%;"]')).toHaveLength(3);
  });

  it('exports the activity dataset with its hatchery and full activity columns', async () => {
    vi.mocked(api.listTanks).mockResolvedValue([{ id: 'tank-1', name: 'Tank 01', site: 'Benoni', rearingStartDate: '2025-01-01', deviceId: 'device-1' }]);
    vi.mocked(api.listActivityLogs).mockResolvedValue([{ id: 'log', tankId: 'hatchery', hatcheryId: 'camiguin-benoni', kind: 'ENVIRONMENT', type: 'Rainfall', occurredAt: new Date().toISOString(), operator: 'Operator', notes: 'Heavy rain', waterSource: 'Sea' }]);
    const createUrl = vi.fn((_blob: Blob) => 'blob:report');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderReportsPage();
    await screen.findByRole('button', { name: 'Download CSV' });
    fireEvent.click(screen.getByRole('combobox', { name: 'CSV dataset' }));
    fireEvent.click(screen.getByRole('option', { name: 'Activity logs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const blob = createUrl.mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toContain('"Hatchery","Timestamp (PHT)"');
    expect(text).toContain('"Benoni"');
    expect(text).toContain('"Water source"');
    expect(text).toContain('"Sea"');
    expect(text).toContain('"Heavy rain"');
  });
  it('shows selected section count and preserves the filter controls in the dropdown', async () => {
    renderReportsPage();
    const trigger = screen.getByRole('button', { name: 'Filters 9/9' });
    const download = await screen.findByRole('button', { name: 'Download CSV' });
    expect(download).toHaveClass('button-primary');
    expect(download.parentElement?.lastElementChild).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    const panel = await screen.findByRole('dialog', { name: 'Report filters' });
    expect(panel.parentElement).toBe(document.body);
    await within(panel).findByRole('checkbox', { name: 'Tank 01' });
    const tanks = within(panel).getByRole('group', { name: 'Tanks' });
    const sections = within(panel).getByRole('group', { name: 'Report sections' });
    expect(within(tanks).getByRole('checkbox', { name: 'Tank 01' })).toBeDisabled();
    expect(within(sections).getAllByRole('checkbox')).toHaveLength(9);
    expect(within(panel).getByText('Tanks and sections apply to the report preview and PDF.')).toBeInTheDocument();

    const summary = within(sections).getByRole('checkbox', { name: 'Executive summary' });
    await waitFor(() => expect(summary).toHaveFocus());
    fireEvent.click(summary);
    expect(trigger).toHaveAccessibleName('Filters 8/9');
  });

  describe('ReportsPage reading limits', () => {
    it('loads all readings across limited requests without duplicating boundary readings', async () => {
      const now = Date.now();
      const from = getManilaDateString(new Date(now - Math.min(7, tierConfig.retentionDays) * 86_400_000));
      const to = getManilaDateString(new Date(now));
      const start = Date.parse(`${from}T00:00:00+08:00`);
      const end = Date.parse(`${to}T23:59:59.999+08:00`);
      const midpoint = start + Math.floor((end - start) / 2);
      const readings = Array.from({ length: 1201 }, (_, index) => ({
        id: `reading-${index}`, tankId: 'tank-1', timestamp: new Date(midpoint + (index - 600) * 1000).toISOString(),
        temperature: 28, doMgL: 5, ph: 7.4,
      }));
      const listReadings = vi.mocked(api.listReadings).mockImplementation(async (query = {}) => readings
        .filter((reading) => Date.parse(reading.timestamp) >= Date.parse(query.from!) && Date.parse(reading.timestamp) <= Date.parse(query.to!))
        .slice(0, query.limit));
      renderReportsPage();

      expect(await screen.findByText('Showing first 10 of 1201 readings')).toBeInTheDocument();
      expect(listReadings.mock.calls.length).toBeGreaterThan(1);
      expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
    });

    it('reports an error when a timestamp cannot be split below the reading limit', async () => {
      const timestamp = new Date().toISOString();
      const readings = Array.from({ length: 500 }, (_, index) => ({
        id: `reading-${index}`, tankId: 'tank-1', timestamp, temperature: 28, doMgL: 5, ph: 7.4,
      }));
      vi.mocked(api.listReadings).mockImplementation(async (query = {}) =>
        Date.parse(timestamp) >= Date.parse(query.from!) && Date.parse(timestamp) <= Date.parse(query.to!) ? readings : []);
      renderReportsPage();

      expect(await screen.findByRole('alert')).toHaveTextContent('Too many readings occur within one millisecond to produce a complete report.');
      expect(screen.queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
    });
  });

  it('closes on Escape and outside click, returning focus on Escape', async () => {
    renderReportsPage();
    const trigger = screen.getByRole('button', { name: 'Filters 9/9' });
    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Report filters' });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Report filters' })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Report filters' });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Report filters' })).not.toBeInTheDocument());
  });
});
