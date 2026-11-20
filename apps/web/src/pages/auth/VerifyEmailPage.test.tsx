import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../../services/authService';
import VerifyEmailPage from './VerifyEmailPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderVerifyEmail(email: string | null) {
  const initialEntry = email
    ? { pathname: '/verify-email', state: { email } }
    : '/verify-email';

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/signup" element={<p>Sign up</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmailPage', () => {
  it.each(['jane@gmail.com', 'jane@googlemail.com'])('shows the verification email and opens Gmail for %s', (email) => {
    renderVerifyEmail(email);

    expect(screen.getByText(`We sent a verification link to ${email}.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Gmail' })).toHaveAttribute('href', 'https://mail.google.com');
    expect(screen.getByRole('link', { name: 'Open Gmail' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Open Gmail' })).toHaveAttribute('rel', 'noopener');
  });

  it('does not show the Gmail button for other email domains', () => {
    renderVerifyEmail('jane@example.test');

    expect(screen.queryByRole('link', { name: 'Open Gmail' })).not.toBeInTheDocument();
  });

  it('redirects to signup when no email is in router state', () => {
    renderVerifyEmail(null);

    expect(screen.getByText('Sign up')).toBeInTheDocument();
  });

  it('disables resend during the cooldown and restarts it after a resend', async () => {
    vi.useFakeTimers();
    const resend = vi.spyOn(authService, 'resendVerification').mockResolvedValue();
    renderVerifyEmail('jane@example.test');

    expect(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled();
    for (let second = 0; second < 18; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(screen.getByRole('button', { name: 'Resend in 42s' })).toBeDisabled();

    for (let second = 0; second < 42; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    const resendButton = screen.getByRole('button', { name: 'Resend verification email' });
    expect(resendButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(resendButton);
      await Promise.resolve();
    });
    expect(resend).toHaveBeenCalledWith('jane@example.test');
    expect(screen.getByRole('status')).toHaveTextContent('Verification email sent.');
    expect(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled();
  });
});
