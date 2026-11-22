import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ASSETS } from '../../config/assets';
import {
  Activity,
  AlertTriangle,
  Beaker,
  Bell,
  ClipboardList,
  Database,
  FileDown,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Users,
  Waves,
  Wifi,
  WifiOff,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessRole, hatcheryId } from '@hydrosense/shared';
import { liveClient } from '../../app/api';
import { NAV_ITEMS, ROLE_LABELS } from '../../app/config';
import { useAuth, useRole } from '../../app/auth/RoleContext';
import { signOut } from '../../services/authService';
import { useSelectedTank } from '../../app/tank/TankContext';
import { useLatestReading, useOpenAlerts, usePendingRequests, useProfileSite } from '../../app/data/hooks';
import { formatManilaDateTime } from '@hydrosense/shared';
import { CriticalAlertModal } from './CriticalAlertModal';
import { HatcherySelect } from '../common/HatcherySelect';
import { useChatThreads } from '../../hooks/useChatThreads';

const icons: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/tanks': Waves,
  '/trends': Activity,
  '/history': Database,
  '/alerts': AlertTriangle,
  '/entries': Beaker,
  '/calibration': FlaskConical,
  '/reports': FileDown,
  '/validation': Gauge,
  '/settings/thresholds': Settings,
  '/settings': Settings,
  '/admin/users': Users,
  '/admin/logs': ClipboardList,
  '/profile': UserRound,
};

const SIDEBAR_KEY = 'hydrosense.sidebarWidth';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 380;
const clampSidebar = (value: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)));

export type ShellOutletContext = { notifyActivityExport: () => void };

function readSidebarWidth() {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampSidebar(stored) : SIDEBAR_MIN;
  } catch {
    return SIDEBAR_MIN;
  }
}

export function AppShell() {
  const { role, userName } = useRole();
  const user = useAuth();
  if (!user) throw new Error('AppShell must be used by an authenticated user.');
  const { tankId, hatchery, tanks } = useSelectedTank();
  const latestReading = useLatestReading(tankId);
  const alerts = useOpenAlerts();
  const pendingRequests = usePendingRequests();
  const chatThreads = useChatThreads();
  const site = useProfileSite(role !== 'admin');
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [exportNotifications, setExportNotifications] = useState<Array<{ id: number; userId: string; createdAt: string }>>([]);
  const nextExportNotificationId = useRef(0);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState(liveClient.getConnectionState());
  const latestReadingIsRecent = Boolean(
    latestReading.data &&
    Date.now() - new Date(latestReading.data.timestamp).getTime() <= 15 * 60 * 1000,
  );
  const displayConnection = connection === 'connected' || latestReadingIsRecent ? 'connected' : connection;

  useEffect(() => {
    setExportNotifications([]);
  }, [user.id]);

  useEffect(() => {
    const unsubscribe = liveClient.subscribeConnection(setConnection);
    liveClient.connect();
    return () => {
      unsubscribe();
      liveClient.disconnect();
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!accountMenuOpen && !notificationsOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (accountMenuOpen && !accountRef.current?.contains(target)) setAccountMenuOpen(false);
      if (notificationsOpen && !notificationsRef.current?.contains(target)) setNotificationsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen, notificationsOpen]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let latest = startWidth;
    const onMove = (move: PointerEvent) => {
      latest = clampSidebar(startWidth + move.clientX - startX);
      setSidebarWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { window.localStorage.setItem(SIDEBAR_KEY, String(latest)); } catch { /* storage unavailable */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function resizeByKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = clampSidebar(sidebarWidth + (event.key === 'ArrowRight' ? 16 : -16));
    setSidebarWidth(next);
    try { window.localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* storage unavailable */ }
  }

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [accountMenuOpen]);

  const visibleItems = NAV_ITEMS.filter((item) => canAccessRole(role, item.roles));
  const openAlerts = (alerts.data ?? []).filter((alert) => alert.status === 'open' && tanks.some((tank) => tank.id === alert.tankId));
  const criticalAlerts = openAlerts.filter((alert) => alert.severity === 'critical');
  const pendingCount = role === 'admin' ? (pendingRequests.data ?? []).filter((request) => hatchery === 'all' || Boolean(request.hatcheryId && hatcheryId(request.hatcheryId) === hatchery)).length : 0;
  const alertCount = openAlerts.length + pendingCount;
  const visibleExportNotifications = exportNotifications.filter((notification) => notification.userId === user.id);
  const notificationCount = alertCount + visibleExportNotifications.length;
  const unreadMessages = (chatThreads.data ?? []).reduce((total, thread) => total + thread.unreadCount, 0);
  const alertLabel = `${alertCount} open ${alertCount === 1 ? 'alert' : 'alerts'}${role === 'admin' && pendingRequests.isError
    ? ', account requests unavailable'
    : role === 'admin' && pendingRequests.isLoading
      ? ', loading account requests'
      : pendingCount ? `, including ${pendingCount} pending account ${pendingCount === 1 ? 'request' : 'requests'}` : ''}${visibleExportNotifications.length ? `, ${visibleExportNotifications.length} export ${visibleExportNotifications.length === 1 ? 'notification' : 'notifications'}` : ''}`;
  const notifyActivityExport = () => {
    const notification = { id: nextExportNotificationId.current++, userId: user.id, createdAt: new Date().toISOString() };
    setExportNotifications((current) => [notification, ...current]);
  };
  return (
    <div className="app-shell glass-shell" data-role={role} style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
      {menuOpen && <button className="drawer-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="HydroSense home">
          <img src={ASSETS.logo} alt="" className="brand-logo" />
          <span>HydroSense</span>
        </Link>
        <button type="button" className="icon-button sidebar-close mobile-menu" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18} /></button>
        <nav className="side-nav">
          {(['Monitor', 'Records', 'Manage'] as const).map((group) => (
            <section key={group} aria-label={`${group} pages`}>
              <p className="nav-group">{group}</p>
              {visibleItems.filter((item) => item.group === group).map((item) => {
                const Icon = icons[item.path];
                return (
                  <NavLink key={item.path} to={item.path} end={item.path === '/'} className="nav-link" aria-label={item.label}>
                    <Icon size={18} aria-hidden="true" /><span>{item.label}</span>
                  </NavLink>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="small muted sidebar-role">{role.toUpperCase()} Workspace</span>
          <span className="small muted sidebar-copyright">© 2026 HydroSense</span>
        </div>
        <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={startResize} onKeyDown={resizeByKey} />
      </aside>

      <div className="main-area">
        {criticalAlerts.length > 0 && <CriticalAlertModal alert={criticalAlerts[0]} remaining={criticalAlerts.length} />}
        <main className="page-content glass-screen">
          <div className="page-controls" aria-label="Dashboard controls">
            <button type="button" className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
            {role === 'admin' && <HatcherySelect />}
            <span className={`connection-pill ${displayConnection === 'connected' ? 'connection-online' : 'connection-offline'}`} aria-label={`Connection ${displayConnection}`}>
              {displayConnection === 'connected' ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}<span>{displayConnection === 'connected' ? 'Live' : displayConnection === 'connecting' ? 'Connecting' : 'Offline'}</span>
            </span>
            <Link to="/chat" className="icon-button header-alert-link" aria-label={chatThreads.isError ? 'Chat, unread messages unavailable' : `Chat, ${unreadMessages} unread messages`} onClick={() => { setNotificationsOpen(false); setAccountMenuOpen(false); }}>
              <MessageCircle size={18} aria-hidden="true" />{unreadMessages > 0 && <span className="header-alert-count">{unreadMessages}</span>}
            </Link>
            <div className="notification-menu" ref={notificationsRef}>
              <button type="button" className="icon-button header-alert-link" aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-label={alertLabel} title={alertLabel} onClick={() => { setAccountMenuOpen(false); setNotificationsOpen((open) => !open); }}>
                <Bell size={18} /><span className="header-alert-count">{notificationCount}</span>
                {role === 'admin' && pendingRequests.isError && <span aria-hidden="true">!</span>}
                {role === 'admin' && pendingRequests.isLoading && <span aria-hidden="true">…</span>}
              </button>
              {notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Current notifications">
                <div className="notification-popover-head"><strong>Notifications</strong><span>{notificationCount} current</span></div>
                <ul className="notification-list">
                  {visibleExportNotifications.map((notification) => (
                    <li key={notification.id} className="notification-item notification-export">
                      <FileDown size={18} className="notification-icon notification-icon-info" aria-hidden="true" />
                      <span><strong>Activity logs exported.</strong><small>{formatManilaDateTime(notification.createdAt)} PHT</small></span>
                      <button type="button" className="notification-dismiss" aria-label="Dismiss activity logs export notification" onClick={() => setExportNotifications((current) => current.filter((item) => item.id !== notification.id))}><X size={16} aria-hidden="true" /></button>
                    </li>
                  ))}
                  {pendingCount > 0 && <li><Link to="/admin/users" className="notification-item"><UserRound size={18} className="notification-icon notification-icon-info" aria-hidden="true" /><span><strong>{pendingCount} pending account {pendingCount === 1 ? 'request' : 'requests'}</strong><small>Review in Users &amp; Roles</small></span></Link></li>}
                  {openAlerts.map((alert) => (
                    <li key={alert.id}><Link to="/alerts" className="notification-item">
                      <AlertTriangle size={18} className={`notification-icon notification-icon-${alert.severity}`} aria-hidden="true" />
                      <span><strong>{alert.parameter} {alert.severity}</strong><small>{alert.value} · {alert.threshold} · {formatManilaDateTime(alert.createdAt)}</small></span>
                    </Link></li>
                  ))}
                  {notificationCount === 0 && <li className="notification-empty">No current notifications.</li>}
                </ul>
                <Link to="/alerts" className="notification-view-all">View all</Link>
              </div>}
            </div>
            <div className="account-menu" ref={accountRef}>
              <button type="button" className="icon-button" aria-haspopup="menu" aria-expanded={accountMenuOpen} aria-label={`Account menu for ${userName}`} title={userName} onClick={() => { setNotificationsOpen(false); setAccountMenuOpen((open) => !open); }}>
                <UserRound size={19} aria-hidden="true" />
              </button>
              {accountMenuOpen && <div className="account-menu-popover" role="menu" aria-label="Account options">
                <div className="account-menu-identity" role="presentation">
                  <strong>{userName.trim() || 'User'}</strong>
                  <span>{ROLE_LABELS[role]}</span>
                </div>
                <Link to="/profile" role="menuitem"><UserRound size={15} />My Profile</Link>
                <Link to="/signin" role="menuitem" onClick={signOut}><LogOut size={15} />Sign out</Link>
              </div>}
            </div>
          </div>
          <div className="page-view">
            {role !== 'admin' && site.isError && <p className="state-error" role="alert">Hatchery assignment could not be loaded. <button type="button" className="button" onClick={() => void site.refetch()}>Retry</button></p>}
            {role !== 'admin' && site.isSuccess && !site.data?.trim() && <p className="state-error" role="status">Hatchery assignment unavailable. Contact an administrator.</p>}
            <Outlet context={{ notifyActivityExport } satisfies ShellOutletContext} />
          </div>
        </main>
      </div>
    </div>
  );
}
