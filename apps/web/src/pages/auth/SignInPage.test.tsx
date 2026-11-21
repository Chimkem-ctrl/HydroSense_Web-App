import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authService, EmailNotVerifiedError } from '../../services/authService';
import SignInPage from './SignInPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SignInPage email verification', () => {
  it('offers to resend verification after an unconfirmed email error', async () => {
    vi.spyOn(authService, 'signIn').mockRejectedValue(new EmailNotVerifiedError());
    const resend = vi.spyOn(authService, 'resendVerification').mockResolvedValue();
    render(<MemoryRouter><SignInPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Please verify your email first.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith('jane@example.test'));
    expect(await screen.findByText('Verification email sent.')).toBeInTheDocument();
  });

  it('shows the verified confirmation banner from the redirect query', () => {
    render(<MemoryRouter initialEntries={['/signin?verified=1']}><SignInPage /></MemoryRouter>);

    expect(screen.getByRole('status')).toHaveTextContent('Email verified. You can now sign in.');
  });
});

describe('SignInPage redirects', () => {
  const user = {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.test',
    role: 'operator' as const,
    requestedRole: 'operator' as const,
    status: 'approved' as const,
    createdAt: '2026-01-01',
  };

  function LocationProbe() {
    const location = useLocation();
    return <output data-testid="destination">{location.pathname}{location.search}{location.hash}</output>;
  }

  async function signInFrom(from: unknown) {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/signin', state: { from } }]}>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    return screen.findByTestId('destination');
  }

  it('returns approved users to a safe in-app path', async () => {
    vi.spyOn(authService, 'signIn').mockResolvedValue({ status: 'approved', user, redirectPath: '/' });
    expect(await signInFrom('/tanks?view=all#details')).toHaveTextContent('/tanks?view=all#details');
  });

  it.each([undefined, null, '', 'https://example.test', '//example.test', '/\\example.test', '/\n/example.test', 42])(
    'falls back to the default route for an unsafe destination: %s',
    async (from) => {
      vi.spyOn(authService, 'signIn').mockResolvedValue({ status: 'approved', user, redirectPath: '/' });
      expect(await signInFrom(from)).toHaveTextContent(/^\/$/);
    },
  );

  it('uses the pending approval route instead of the requested path', async () => {
    vi.spyOn(authService, 'signIn').mockResolvedValue({ status: 'pending', redirectPath: '/pending-approval' });
    expect(await signInFrom('/tanks')).toHaveTextContent('/pending-approval');
  });
});
