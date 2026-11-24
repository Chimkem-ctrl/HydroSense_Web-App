import { useCallback, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ROLE_ACCESS } from './config';
import { RoleGuard } from './auth/RoleGuard';
import { PublicOnly, RequireAuth } from './auth/RouteGuards';
import { useAuth } from './auth/RoleContext';
import { AppShell } from '../components/shell/AppShell';
import LiveMonitorPage from '../pages/LiveMonitorPage';
import TankOverviewPage from '../pages/TankOverviewPage';
import TrendsPage from '../pages/TrendsPage';
import ProfilePage from '../pages/ProfilePage';
import ChatPage from '../pages/ChatPage';
import {
  AlertsPage,
  CalibrationPage,
  HistoryPage,
  ActivityLogsPage,
  ReportsPage,
  ValidationPage,
} from '../pages/RecordPages';
import { AdminLogsPage, AdminUsersPage } from '../pages/AdminPages';
import SignInPage from '../pages/auth/SignInPage';
import SignUpPage from '../pages/auth/SignUpPage';
import VerifyEmailPage from '../pages/auth/VerifyEmailPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import PendingApprovalPage from '../pages/auth/PendingApprovalPage';
import SplashScreen from '../pages/auth/SplashScreen';

function Guarded({ path, children }: { path: keyof typeof ROLE_ACCESS; children: ReactNode }) {
  return <RoleGuard roles={ROLE_ACCESS[path]}>{children}</RoleGuard>;
}

function SplashRoute({ onSeen }: { onSeen: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth();
  const completed = useRef(false);
  const continueToApp = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onSeen();
    navigate(user?.role ? '/' : location.state?.verified ? '/signin?verified=1' : '/signin', { replace: true });
  }, [location.state, navigate, onSeen, user]);

  return <SplashScreen onGetStarted={continueToApp} />;
}

function ProtectedAppShell({ splashSeen }: { splashSeen: boolean }) {
  const location = useLocation();
  const user = useAuth();
  if (!splashSeen && (location.pathname === '/' || !user?.role)) {
    return <Navigate to="/splash" replace />;
  }
  return <RequireAuth><AppShell /></RequireAuth>;
}

export default function AppRoutes() {
  const location = useLocation();
  const user = useAuth();
  const [splashSeen, setSplashSeen] = useState(() => Boolean(user?.role && location.pathname !== '/splash'));
  const markSplashSeen = useCallback(() => setSplashSeen(true), []);

  if (!splashSeen && !user?.role && location.pathname !== '/splash') {
    const verified = location.pathname === '/signin' && new URLSearchParams(location.search).get('verified') === '1';
    return <Navigate to="/splash" replace state={{ verified }} />;
  }

  return (
    <Routes>
      <Route path="/splash" element={<SplashRoute onSeen={markSplashSeen} />} />
      <Route path="/signin" element={!splashSeen && !user?.role ? <Navigate to="/splash" replace /> : <PublicOnly><SignInPage /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUpPage /></PublicOnly>} />
      <Route path="/verify-email" element={<PublicOnly><VerifyEmailPage /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />
      <Route element={<ProtectedAppShell splashSeen={splashSeen} />}>
        <Route index element={<LiveMonitorPage />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="live-monitor" element={<Navigate to="/" replace />} />
        <Route path="tanks" element={<TankOverviewPage />} />
        <Route path="health" element={<Navigate to="/tanks" replace />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="history" element={<Guarded path="history"><HistoryPage /></Guarded>} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="entries" element={<ActivityLogsPage />} />
        <Route path="activity-logs" element={<Navigate to="/entries" replace />} />
        <Route path="calibration" element={<Guarded path="calibration"><CalibrationPage /></Guarded>} />
        <Route path="reports" element={<Guarded path="reports"><ReportsPage /></Guarded>} />
        <Route path="validation" element={<Guarded path="validation"><ValidationPage /></Guarded>} />
        <Route path="settings/thresholds" element={<Navigate to="/calibration" replace />} />
        <Route path="settings" element={<Navigate to="/profile" replace />} />
        <Route path="admin/users" element={<Guarded path="users"><AdminUsersPage /></Guarded>} />
        <Route path="admin/logs" element={<Guarded path="logs"><AdminLogsPage /></Guarded>} />
        <Route path="settings/notifications" element={<Navigate to="/profile" replace />} />
        <Route path="profile" element={<Guarded path="profile"><ProfilePage /></Guarded>} />
        <Route path="chat" element={<Guarded path="chat"><ChatPage /></Guarded>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}