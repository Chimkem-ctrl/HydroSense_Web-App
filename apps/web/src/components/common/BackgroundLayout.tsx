import type { CSSProperties, PropsWithChildren } from 'react';
import { ASSETS } from '../../config/assets';

interface BackgroundLayoutProps extends PropsWithChildren {
  className?: string;
}

export default function BackgroundLayout({ children, className = '' }: BackgroundLayoutProps) {
  return (
    <main
      className={`auth-background ${className}`.trim()}
      style={
        { '--auth-background-image': `url("${ASSETS.background}")` } as CSSProperties
      }
    >
      {children}
    </main>
  );
}
