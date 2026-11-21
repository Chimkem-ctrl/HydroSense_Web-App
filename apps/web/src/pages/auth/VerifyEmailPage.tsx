import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import PrimaryButton from '../../components/common/PrimaryButton';
import AuthSplitLayout from '../../components/auth/AuthSplitLayout';
import { authService } from '../../services/authService';

type VerificationFeedback = {
  status: 'success' | 'error';
  message: string;
};

export default function VerifyEmailPage() {
  const location = useLocation();
  const routeEmail = (location.state as { email?: unknown } | null)?.email;
  const email = typeof routeEmail === 'string' ? routeEmail.trim() : '';
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<VerificationFeedback | null>(null);

  useEffect(() => {
    if (!email || cooldownSeconds === 0) return undefined;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((remaining) => Math.max(remaining - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds, email]);

  if (!email) return <Navigate to="/signup" replace />;

  const isGmailAddress = /@(gmail\.com|googlemail\.com)$/i.test(email);

  async function handleResend() {
    if (isSending || cooldownSeconds > 0) return;
    setIsSending(true);
    setCooldownSeconds(60);
    setFeedback(null);
    try {
      await authService.resendVerification(email);
      setFeedback({ status: 'success', message: 'Verification email sent.' });
    } catch (error) {
      setFeedback({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unable to resend verification email.',
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AuthSplitLayout
      introTitle="Check your inbox"
      introDescription={`We sent a verification link to ${email}.`}
      formTitle="Verify your email"
    >
      <div className="verify-email-content">
        <p className="auth-verification-note">
          The link expires in 24 hours. Check your spam folder if you don&apos;t see it.
        </p>
        {isGmailAddress && (
          <a className="primary-button" href="https://mail.google.com" target="_blank" rel="noopener">
            Open Gmail
          </a>
        )}
        <PrimaryButton
          type="button"
          loading={isSending}
          disabled={cooldownSeconds > 0}
          onClick={handleResend}
        >
          {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : 'Resend verification email'}
        </PrimaryButton>
        {feedback && (
          <p
            className="form-status auth-verification-feedback"
            role="status"
            aria-live="polite"
            data-status={feedback.status}
          >
            {feedback.message}
          </p>
        )}
        <p className="auth-split-footer">
          <Link to="/signin">Back to sign in</Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
