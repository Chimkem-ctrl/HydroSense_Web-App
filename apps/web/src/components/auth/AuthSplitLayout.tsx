import type { PropsWithChildren } from 'react';
import AuthHeader from './AuthHeader';
import AuthLayout from './AuthLayout';

interface AuthSplitLayoutProps extends PropsWithChildren {
  introTitle: string;
  introDescription: string;
  formTitle: string;
}

export default function AuthSplitLayout({
  introTitle,
  introDescription,
  formTitle,
  children,
}: AuthSplitLayoutProps) {
  return (
    <AuthLayout className="auth-background--split">
      <div className="auth-page auth-split-page page-enter">
        <div className="glass-panel auth-split-card">
          <section className="auth-split-intro">
            <AuthHeader autoWidthLogo showBrand />
            <div className="auth-split-intro-copy">
              <h1>{introTitle}</h1>
              <p>{introDescription}</p>
            </div>
          </section>
          <section className="auth-split-form-panel" aria-labelledby="auth-split-form-title">
            <div className="auth-split-form-content">
              <h2 id="auth-split-form-title" className="auth-split-form-title">{formTitle}</h2>
              {children}
            </div>
          </section>
        </div>
      </div>
    </AuthLayout>
  );
}
