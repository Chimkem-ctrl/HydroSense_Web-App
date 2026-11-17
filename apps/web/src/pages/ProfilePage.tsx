import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatManilaDateTime } from '@hydrosense/shared';
import { useAuth, useRole } from '../app/auth/RoleContext';
import { ROLE_LABELS } from '../app/config';
import { useProfileSite, useTanks } from '../app/data/hooks';
import { hatcheryLabel } from '../services/authService';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { AppearancePanel } from '../components/settings/AppearancePanel';
import ToggleSwitch from '../components/settings/ToggleSwitch';
import '../styles/profile.css';

function isTankOne(name: string) {
  return /^tank\s+0?1\b/i.test(name.trim());
}

export default function ProfilePage() {
  const { hash } = useLocation();
  const { role, userName } = useRole();
  const user = useAuth();
  const tanks = useTanks();
  const site = useProfileSite();
  const [maintenanceHatchery, setMaintenanceHatchery] = useState('');
  const [maintenanceTankId, setMaintenanceTankId] = useState('');
  const allTanks = tanks.data ?? [];
  const hatcheries = Array.from(new Set(allTanks.map((item) => item.site.trim()).filter(Boolean)));
  const selectedHatchery = role === 'admin' ? maintenanceHatchery : site.data ?? '';
  const maintenanceTanks = selectedHatchery.trim()
    ? allTanks.filter((item) => isTankOne(item.name) &&
      hatcheryLabel(item.site).toLowerCase() === hatcheryLabel(selectedHatchery).toLowerCase())
    : [];

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);

  return (
    <div className="stack profile-page">
      <PageHeading title="My profile" description="View your account, role, hatchery, and alert preferences." />
      <div className="profile-layout">
        <section id="profile" className="card profile-card" aria-labelledby="profile-title">
          <div className="profile-panel-heading"><h2 id="profile-title">Profile</h2></div>
          {!user ? <EmptyState>Profile details are not available for this account.</EmptyState> : <>
            <div className="profile-summary">
              <span className="avatar profile-avatar" aria-hidden="true">{userName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
              <div><h3>{userName.trim() || 'N/A'}</h3><p>{ROLE_LABELS[role]}</p></div>
            </div>
            <div className="profile-groups">
              <section className="profile-group" aria-labelledby="profile-contact">
                <h3 id="profile-contact">Contact details</h3>
                <dl className="profile-details">
                  <div><dt>Email</dt><dd>{user.email || 'N/A'}</dd></div>
                  <div><dt>Phone</dt><dd>{user.phone || 'N/A'}</dd></div>
                  <div><dt>Address</dt><dd>{user.address || 'N/A'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-assignment">
                <h3 id="profile-assignment">Role &amp; assignment</h3>
                <dl className="profile-details">
                  <div><dt>Name</dt><dd>{userName.trim() || 'N/A'}</dd></div>
                  <div><dt>Role</dt><dd>{ROLE_LABELS[role]}</dd></div>
                  <div><dt>Requested role</dt><dd>{user.requestedRole ? ROLE_LABELS[user.requestedRole] : 'N/A'}</dd></div>
                  <div><dt>Position</dt><dd>{user.position || 'N/A'}</dd></div>
                  <div><dt>Hatchery / site</dt><dd>{site.isLoading ? 'Loading...' : site.isError ? <ErrorState error={site.error} onRetry={() => void site.refetch()} /> : site.data?.trim() ? hatcheryLabel(site.data) : 'N/A'}</dd></div>
                  <div><dt>Employee ID</dt><dd>{user.employeeId || 'N/A'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-emergency">
                <h3 id="profile-emergency">Emergency contact</h3>
                <dl className="profile-details">
                  <div><dt>Name</dt><dd>{user.emergencyContactName || 'N/A'}</dd></div>
                  <div><dt>Phone</dt><dd>{user.emergencyContactPhone || 'N/A'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-account">
                <h3 id="profile-account">Account</h3>
                <dl className="profile-details">
                  <div><dt>Account status</dt><dd>{user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : 'N/A'}</dd></div>
                  <div><dt>Account created</dt><dd>{user.createdAt ? `${formatManilaDateTime(user.createdAt)} PHT` : 'N/A'}</dd></div>
                </dl>
              </section>
            </div>
          </>}
        </section>

        <section id="alerts" className="card profile-preferences" aria-labelledby="alerts-title">
          <div className="profile-panel-heading"><h2 id="alerts-title">Alert notifications</h2></div>
          <div className="profile-alert-row">
            <ToggleSwitch id="sms-alerts" label="SMS alerts" checked={false} onChange={() => {}} disabled />
          </div>
          <div className="profile-alert-row">
            <ToggleSwitch id="email-alerts" label="Email alerts" checked={false} onChange={() => {}} disabled />
          </div>
        </section>

        <AppearancePanel />

        <section id="security" className="card profile-preferences" aria-labelledby="security-title">
          <div className="profile-panel-heading"><h2 id="security-title">Security</h2></div>
          <div className="profile-actions">
            <button className="button" type="button" disabled>Change password</button>
          </div>
        </section>

        <section id="device-maintenance" className="card profile-preferences" aria-labelledby="device-maintenance-title">
          <div className="profile-panel-heading"><h2 id="device-maintenance-title">Device maintenance</h2></div>
          {tanks.isLoading ? <LoadingState label="Loading available tanks" /> : tanks.isError ? <ErrorState error={tanks.error} onRetry={() => void tanks.refetch()} /> : <>
            {role === 'admin' && <label className="field">Hatchery
              <select value={maintenanceHatchery} onChange={(event) => {
                setMaintenanceHatchery(event.target.value);
                setMaintenanceTankId('');
              }}>
                <option value="">Select a hatchery</option>
                {hatcheries.map((name) => <option key={name} value={name}>{hatcheryLabel(name)}</option>)}
              </select>
            </label>}
            <label className="field">Tank
              <select value={maintenanceTankId} disabled={!selectedHatchery || maintenanceTanks.length === 0} onChange={(event) => setMaintenanceTankId(event.target.value)}>
                <option value="">Select Tank 01</option>
                {maintenanceTanks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {role === 'admin' && !maintenanceHatchery ? <p className="small muted">Select a hatchery to view its Tank 01 device.</p> :
              selectedHatchery && maintenanceTanks.length === 0 ? <p className="small muted">Tank 01 is not available for this hatchery.</p> : null}
          </>}
          <div className="profile-actions">
            {role === 'operator' ? <>
              <button className="button" type="button" disabled>Request calibration</button>
              <button className="button" type="button" disabled>Request reboot</button>
            </> : <button className="button" type="button" disabled>Reboot device</button>}
          </div>
        </section>
      </div>
    </div>
  );
}
