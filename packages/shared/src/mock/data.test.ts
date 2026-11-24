import { expect, it, vi } from 'vitest';

it('generates ISO rearing dates even when the locale formats dates differently', async () => {
  vi.resetModules();
  const localeDate = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('11/07/2026');
  try {
    const { mockTanks } = await import('./data');
    expect(mockTanks.every((tank) => /^\d{4}-\d{2}-\d{2}$/.test(tank.rearingStartDate))).toBe(true);
  } finally {
    localeDate.mockRestore();
  }
});
