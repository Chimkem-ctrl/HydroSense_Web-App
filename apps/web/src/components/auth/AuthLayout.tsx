import type { PropsWithChildren } from 'react';
import BackgroundLayout from '../common/BackgroundLayout';

interface AuthLayoutProps extends PropsWithChildren {
  className?: string;
}

export default function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <BackgroundLayout className={className}>
      <div className="auth-content">{children}</div>
    </BackgroundLayout>
  );
}
