import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('splash routing', () => {
  it('skips the splash for a deep link', async () => {
    window.history.replaceState({}, '', '/reports');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'HydroSense' })).not.toBeInTheDocument();
  });

  it('stays until clicked and then routes a signed-out user to sign-in', async () => {
    window.history.replaceState({}, '', '/');
    vi.useFakeTimers();
    render(<App />);

    expect(screen.getByRole('heading', { name: 'HYDROSENSE' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/splash');
    act(() => vi.advanceTimersByTime(10_000));
    const getStarted = screen.getByRole('button', { name: 'Get Started' });
    expect(getStarted).toBeInTheDocument();
    expect(window.location.pathname).toBe('/splash');
    fireEvent.click(getStarted);
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signin');
  });

  it('routes a signed-in user to the dashboard when clicked', async () => {
    const user = {
      id: 'splash-admin',
      firstName: 'Splash',
      lastName: 'Admin',
      email: 'splash-admin@example.com',
      role: 'admin',
      requestedRole: null,
      status: 'approved',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    window.localStorage.setItem('hydrosense.auth.accounts.v2', JSON.stringify([{ user, passwordSalt: 'salt', passwordHash: 'hash' }]));
    window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    window.history.replaceState({}, '', '/');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'HYDROSENSE' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(await screen.findByRole('heading', { name: 'Live monitor', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});
