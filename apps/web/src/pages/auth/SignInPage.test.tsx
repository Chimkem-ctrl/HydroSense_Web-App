import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
