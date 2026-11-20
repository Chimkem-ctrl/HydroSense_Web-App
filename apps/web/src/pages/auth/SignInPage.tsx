import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthSplitLayout from '../../components/auth/AuthSplitLayout';
import PasswordInput from '../../components/auth/PasswordInput';
import FormInput from '../../components/common/FormInput';
import PrimaryButton from '../../components/common/PrimaryButton';
import { useAuthForm } from '../../hooks/useAuthForm';
import { authService, EmailNotVerifiedError } from '../../services/authService';
import type { SignInValues } from '../../types/auth.types';

const initialValues: SignInValues = { email: '', password: '' };

function validate(values: SignInValues) {
  const errors: Partial<Record<keyof SignInValues, string>> = {};
  if (!values.email.trim()) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.password) errors.password = 'Password is required.';
  return errors;
}

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const from = getSafeInAppPath(location.state?.from);
  const emailWasVerified = new URLSearchParams(location.search).get('verified') === '1';
  const form = useAuthForm({
    initialValues,
    validate,
    onSubmit: async (values) => {
      try {
        const result = await authService.signIn(values.email, values.password);
        navigate(result.status === 'approved' ? (from ?? result.redirectPath) : result.redirectPath, { replace: true });
      } catch (error) {
        if (error instanceof EmailNotVerifiedError) {
          setUnverifiedEmail(values.email.trim().toLowerCase());
          setResendMessage('');
        }
        throw error;
      }
    },
  });

  async function handleResendVerification() {
    if (!unverifiedEmail || isResending) return;
    setIsResending(true);
    setResendMessage('');
    try {
      await authService.resendVerification(unverifiedEmail);
      setResendMessage('Verification email sent.');
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : 'Unable to resend verification email.');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthSplitLayout
      introTitle="Welcome Back"
      introDescription="Sign in to manage water quality monitoring and keep your hatchery records up to date."
      formTitle="Sign in"
    >
      {emailWasVerified && (
        <p className="form-status auth-verification-banner" role="status">
          Email verified. You can now sign in.
        </p>
      )}
      <form onSubmit={form.handleSubmit} noValidate>
        <FormInput
          label="Email"
          name="email"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          value={form.values.email}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setUnverifiedEmail('');
            setResendMessage('');
            form.setField('email', event.target.value);
          }}
          error={form.errors.email}
          required
        />
        <PasswordInput
          label="Password"
          name="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={form.values.password}
          onChange={(event) => form.setField('password', event.target.value)}
          error={form.errors.password}
          required
        />
        <div className="forgot-link-row">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <PrimaryButton type="submit" loading={form.isSubmitting}>
          Sign in
        </PrimaryButton>
        {form.statusMessage && (
          <p className="form-status" role="status">
            {form.statusMessage}
          </p>
        )}
        {unverifiedEmail && (
          <div className="auth-resend-prompt">
            <button
              type="button"
              className="inline-link auth-resend-link"
              onClick={handleResendVerification}
              disabled={isResending}
            >
              {isResending ? 'Sending…' : 'Resend verification email'}
            </button>
            {resendMessage && (
              <p className="form-status" role="status" aria-live="polite">
                {resendMessage}
              </p>
            )}
          </div>
        )}
      </form>
      <p className="auth-split-footer">
        New here? <Link to="/signup">Sign up</Link>
      </p>
    </AuthSplitLayout>
  );
}
