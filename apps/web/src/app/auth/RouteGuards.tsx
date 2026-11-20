import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './RoleContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth();
  if (user?.role) return children;
  return <Navigate to="/signin" replace />;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const user = useAuth();
  return user?.role ? <Navigate to="/" replace /> : children;
}
