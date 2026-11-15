import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { formatManilaDateTime } from '@hydrosense/shared';
import { useAuth, useRole } from '../app/auth/RoleContext';
import { ROLE_LABELS } from '../app/config';
import { useTanks } from '../app/data/hooks';
import { useSelectedTank } from '../app/tank/TankContext';
import { SUBSCRIBED_HATCHERIES } from '../services/authService';
import { isValidForSms } from '../services/phone';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { AppearancePanel } from '../components/settings/AppearancePanel';
import ToggleSwitch from '../components/settings/ToggleSwitch';
import '../styles/profile.css';

function ComingSoonAction({ children, explanation }: { children: string; explanation: string }) {
  return (
    <div className="profile-action">
      <div><button className="button" type="button" disabled>{children}</button> <small>Coming soon</small></div>
      <p className="profile-note">{explanation}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { hash } = useLocation();
  const { role, userName } = useRole();
  const user = useAuth();
  const { tankId } = useSelectedTank();
  const tanks = useTanks();
  const tank = tanks.data?.find((item) => item.id === tankId);
  const hatcheryName = user?.hatcheryId
    ? SUBSCRIBED_HATCHERIES.find((hatchery) => hatchery.id === user.hatcheryId)?.name ?? user.hatcheryId
    : 'Not provided';

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
                  <div><dt>Hatchery / site</dt><dd>{hatcheryName}</dd></div>
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
            {role !== 'admin' && <ComingSoonAction explanation="Profile change requests are not available yet.">Request a change</ComingSoonAction>}
          </>}
        </section>

        <section id="alerts" className="card profile-preferences" aria-labelledby="alerts-title">
          <div className="profile-panel-heading"><h2 id="alerts-title">Alert notifications</h2></div>
          <div className="profile-alert-row">
            <ToggleSwitch id="sms-alerts" label="SMS alerts" checked={false} onChange={() => {}} disabled />
            <p className="profile-note">Phone on file: {user?.phone || 'Not provided'} <span className="profile-badge">{isValidForSms(user?.phone) ? 'Valid for SMS' : 'Not valid for SMS'}</span></p>
            <p className="profile-note"><small>Coming soon</small> · SMS delivery preferences cannot be changed yet.</p>
          </div>
          <div className="profile-alert-row">
            <ToggleSwitch id="email-alerts" label="Email alerts" checked={false} onChange={() => {}} disabled />
            <p className="profile-note">Email on file: {user?.email || 'Not provided'}</p>
            <p className="profile-note"><small>Coming soon</small> · Email delivery preferences cannot be changed yet.</p>
          </div>
          <p className="profile-note">Critical alerts always appear in the Alerts center. Your delivery preferences will be saved to your account once available.</p>
        </section>

        <AppearancePanel />

        <section id="security" className="card profile-preferences" aria-labelledby="security-title">
          <div className="profile-panel-heading"><h2 id="security-title">Security</h2></div>
          <p className="profile-note">Signed-in email: {user?.email || 'Not provided'}</p>
          <p className="profile-note">Current session</p>
          <ComingSoonAction explanation="Changing your password here is not available yet.">Change password</ComingSoonAction>
          <ComingSoonAction explanation="Signing out other devices is not available yet.">Sign out other devices</ComingSoonAction>
        </section>

        <section id="device-maintenance" className="card profile-preferences" aria-labelledby="device-maintenance-title">
          <div className="profile-panel-heading"><h2 id="device-maintenance-title">Device maintenance</h2></div>
          {tanks.isLoading ? <LoadingState label="Loading selected tank" /> : tanks.isError ? <ErrorState error={tanks.error} /> : (
            <dl className="profile-details">
              <div><dt>Selected tank</dt><dd>{tank?.name || 'Not provided'}</dd></div>
              <div><dt>Device ID</dt><dd>{tank?.deviceId || 'Not provided'}</dd></div>
            </dl>
          )}
          {role === 'operator' ? <>
            <ComingSoonAction explanation="Calibration requests are not available yet.">Request calibration</ComingSoonAction>
            <ComingSoonAction explanation="Reboot requests are not available yet.">Request reboot</ComingSoonAction>
          </> : <ComingSoonAction explanation="Device reboot is not available yet.">Reboot device</ComingSoonAction>}
          <p className="profile-note">Device actions are not connected yet. Nothing is sent to hardware.</p>
        </section>
      </div>
    </div>
  );
}
