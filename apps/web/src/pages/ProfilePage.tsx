import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { formatManilaDateTime } from '@hydrosense/shared';
import { useAuth, useRole } from '../app/auth/RoleContext';
import { ROLE_LABELS } from '../app/config';
import { useProfileSite, useTanks } from '../app/data/hooks';
import { useSelectedTank } from '../app/tank/TankContext';
import { hatcheryLabel } from '../services/authService';
import { isValidForSms } from '../services/phone';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { AppearancePanel } from '../components/settings/AppearancePanel';
import ToggleSwitch from '../components/settings/ToggleSwitch';
import '../styles/profile.css';

export default function ProfilePage() {
  const { hash } = useLocation();
  const { role, userName } = useRole();
  const user = useAuth();
  const { tankId } = useSelectedTank();
  const tanks = useTanks();
  const tank = tanks.data?.find((item) => item.id === tankId);
  const site = useProfileSite();

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
              <div><h3>{userName.trim() || 'Not provided'}</h3><p>{ROLE_LABELS[role]}</p></div>
            </div>
            <div className="profile-groups">
              <section className="profile-group" aria-labelledby="profile-contact">
                <h3 id="profile-contact">Contact details</h3>
                <dl className="profile-details">
                  <div><dt>Email</dt><dd>{user.email || 'Not provided'} <small>(cannot be changed)</small></dd></div>
                  <div><dt>Phone</dt><dd>{user.phone || 'Not provided'}</dd></div>
                  <div><dt>Address</dt><dd>{user.address || 'Not provided'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-assignment">
                <h3 id="profile-assignment">Role &amp; assignment</h3>
                <dl className="profile-details">
                  <div><dt>Name</dt><dd>{userName.trim() || 'Not provided'}</dd></div>
                  <div><dt>Role</dt><dd>{ROLE_LABELS[role]}</dd></div>
                  <div><dt>Position</dt><dd>{user.position || 'Not provided'}</dd></div>
                  <div><dt>Hatchery / site</dt><dd>{site.isLoading ? 'Loading...' : site.isError ? <ErrorState error={site.error} onRetry={() => void site.refetch()} /> : site.data?.trim() ? hatcheryLabel(site.data) : 'Not provided'}</dd></div>
                  <div><dt>Employee ID</dt><dd>{user.employeeId || 'Not provided'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-emergency">
                <h3 id="profile-emergency">Emergency contact</h3>
                <dl className="profile-details">
                  <div><dt>Name</dt><dd>{user.emergencyContactName || 'Not provided'}</dd></div>
                  <div><dt>Phone</dt><dd>{user.emergencyContactPhone || 'Not provided'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-account">
                <h3 id="profile-account">Account</h3>
                <dl className="profile-details">
                  <div><dt>Account status</dt><dd>{user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : 'Not provided'}</dd></div>
                  <div><dt>Account created</dt><dd>{user.createdAt ? `${formatManilaDateTime(user.createdAt)} PHT` : 'Not provided'}</dd></div>
                </dl>
              </section>
            </div>
          </>}
        </section>

        <section id="alerts" className="card profile-preferences" aria-labelledby="alerts-title">
          <div className="profile-panel-heading"><h2 id="alerts-title">Alert notifications</h2></div>
          <div className="profile-alert-row">
            <ToggleSwitch id="sms-alerts" label="SMS alerts" checked={false} onChange={() => {}} disabled />
            <p className="profile-note">Phone on file: {user?.phone || 'Not provided'} <span className="profile-badge">{isValidForSms(user?.phone) ? 'Valid for SMS' : 'Not valid for SMS'}</span></p>
          </div>
          <div className="profile-alert-row">
            <ToggleSwitch id="email-alerts" label="Email alerts" checked={false} onChange={() => {}} disabled />
            <p className="profile-note">Email on file: {user?.email || 'Not provided'}</p>
          </div>
          <p className="profile-note">Coming soon: delivery preferences. Critical alerts always appear in the Alerts center.</p>
        </section>

        <AppearancePanel />

        <section id="security" className="card profile-preferences" aria-labelledby="security-title">
          <div className="profile-panel-heading"><h2 id="security-title">Security</h2></div>
          <p className="profile-note">Signed-in email: {user?.email || 'Not provided'}</p>
          <div className="profile-actions">
            <button className="button" type="button" disabled>Change password</button>
            <button className="button" type="button" disabled>Sign out other devices</button>
          </div>
          <p className="profile-note">Coming soon: password changes and signing out other devices.</p>
        </section>

        <section id="device-maintenance" className="card profile-preferences" aria-labelledby="device-maintenance-title">
          <div className="profile-panel-heading"><h2 id="device-maintenance-title">Device maintenance</h2></div>
          {tanks.isLoading ? <LoadingState label="Loading selected tank" /> : tanks.isError ? <ErrorState error={tanks.error} /> : (
            <dl className="profile-details">
              <div><dt>Selected tank</dt><dd>{tank?.name || 'Not provided'}</dd></div>
              <div><dt>Device ID</dt><dd>{tank?.deviceId || 'Not provided'}</dd></div>
            </dl>
          )}
          <div className="profile-actions">
            {role === 'operator' ? <>
              <button className="button" type="button" disabled>Request calibration</button>
              <button className="button" type="button" disabled>Request reboot</button>
            </> : <button className="button" type="button" disabled>Reboot device</button>}
          </div>
          <p className="profile-note">Coming soon: device actions. Nothing is sent to hardware yet.</p>
        </section>
      </div>
    </div>
  );
}
