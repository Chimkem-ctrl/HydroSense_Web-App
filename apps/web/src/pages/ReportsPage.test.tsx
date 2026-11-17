import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../app/api';
import ReportsPage from './ReportsPage';

vi.mock('../app/auth/RoleContext', () => ({ useRole: () => ({ role: 'admin', userName: 'Test Admin' }) }));
vi.mock('../app/tank/TankContext', () => ({ useSelectedTank: () => ({ tankId: 'tank-1' }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
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
