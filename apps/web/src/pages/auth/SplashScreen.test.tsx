import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { authService, resetSessionOnLaunch } from '../../services/authService';
import { queryClient } from '../../app/query';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('splash routing', () => {
  it.each(['/', '/signin', '/signup', '/verify-email', '/forgot-password', '/pending-approval', '/dashboard', '/live-monitor', '/reports', '/alerts', '/activity-logs', '/entries', '/admin/users', '/unknown'])('guards a direct visit to %s', async (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'HYDROSENSE' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/splash');
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signin');
  });

  it('retains the email-verification confirmation through the splash screen', async () => {
    window.history.replaceState({}, '', '/signin?verified=1');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get Started' }));
    expect(await screen.findByText('Email verified. You can now sign in.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signin');
  });

  it('only opens the dashboard after a successful sign-in', async () => {
    window.history.replaceState({}, '', '/reports');
    const signIn = vi.spyOn(authService, 'signIn').mockRejectedValueOnce(new Error('Invalid credentials')).mockImplementationOnce(async () => {
      window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
      window.dispatchEvent(new Event('hydrosense:auth-change'));
      return { status: 'approved', user: { id: 'demo-admin', firstName: 'Demo', lastName: 'Admin', email: 'admin@example.test', role: 'admin', requestedRole: null, status: 'approved', createdAt: '2026-01-01' }, redirectPath: '/' };
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signin');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Live Monitor', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(signIn).toHaveBeenCalledTimes(2);
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
    window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: user.id }));
    window.history.replaceState({}, '', '/');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'HYDROSENSE' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(await screen.findByRole('heading', { name: 'Live Monitor', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('does not restore an admin session after a fresh launch', async () => {
    window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
    window.localStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
    resetSessionOnLaunch();
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'HYDROSENSE' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signin');
  });

  it.each([
    ['/dashboard', 'Live Monitor', '/'],
    ['/live-monitor', 'Live Monitor', '/'],
    ['/activity-logs', 'Activity Logs', '/entries'],
  ])('opens %s for a signed-in user', async (path, title, destination) => {
    window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe(destination);
  });

  it('leaves protected content when a session ends', async () => {
    window.sessionStorage.setItem('hydrosense.auth.session.v2', JSON.stringify({ userId: 'demo-admin' }));
    window.history.replaceState({}, '', '/alerts');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Alerts Center', level: 1 })).toBeInTheDocument();
    act(() => {
      window.sessionStorage.removeItem('hydrosense.auth.session.v2');
      window.dispatchEvent(new Event('hydrosense:auth-change'));
    });
    expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signin');
  });
});
