import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Camera, LoaderCircle } from 'lucide-react';
import { formatManilaDateTime } from '@hydrosense/shared';
import { useAuth, useRole } from '../app/auth/RoleContext';
import { ROLE_LABELS } from '../app/config';
import { useProfileSite, useTanks } from '../app/data/hooks';
import { useSelectedTank } from '../app/tank/TankContext';
import { authService, hatcheryLabel } from '../services/authService';
import { PageHeading } from '../components/common/PageHeading';
import { Select } from '../components/common/Select';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { AppearancePanel } from '../components/settings/AppearancePanel';
import ToggleSwitch from '../components/settings/ToggleSwitch';
import '../styles/profile.css';

export default function ProfilePage() {
  const { hash } = useLocation();
  const { role, userName } = useRole();
  const user = useAuth();
  const tanks = useTanks();
  const site = useProfileSite();
  const { hatchery, tanks: scopedTanks } = useSelectedTank();
  const [maintenanceTankId, setMaintenanceTankId] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [avatarLoadError, setAvatarLoadError] = useState<Error | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const maintenanceTanks = scopedTanks;
  const saveAvatar = useMutation({
    mutationFn: (file: File) => authService.saveProfileAvatar(file),
    onSuccess: (url) => {
      setAvatarUrl(url);
      setAvatarLoadError(null);
    },
  });

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);

  useEffect(() => {
    let active = true;
    setAvatarUrl(user?.avatarUrl);
    setAvatarLoadError(null);
    if (user) {
      void authService.getProfileAvatarUrl().then((url) => {
        if (active) setAvatarUrl(url);
      }).catch((error: unknown) => {
        if (active) setAvatarLoadError(error instanceof Error ? error : new Error(String(error)));
      });
    }
    return () => { active = false; };
  }, [user?.id, user?.avatarUrl]);

  function selectAvatar(file?: File) {
    if (file) saveAvatar.mutate(file);
  }

  return (
    <div className="stack profile-page">
      <PageHeading title="My Profile" description="View your account, role, hatchery, and alert preferences." />
      <div className="profile-layout">
        <section id="profile" className="card profile-card" aria-label="Profile">
          {!user ? <EmptyState>Profile details are not available for this account.</EmptyState> : <>
            <div className="profile-summary">
              <div className="profile-avatar-wrap">
                {avatarUrl
                  ? <img className="avatar profile-avatar" src={avatarUrl} alt={`${userName.trim() || 'User'} profile picture`} />
                  : <span className="avatar profile-avatar" aria-hidden="true">{userName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}
                <button className="profile-avatar-upload" type="button" aria-label="Upload profile picture" title="Upload profile picture" disabled={saveAvatar.isPending} onClick={() => avatarInput.current?.click()}>
                  {saveAvatar.isPending ? <LoaderCircle className="profile-avatar-upload-spinner" size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                </button>
              </div>
              <div className="profile-summary-details">
                <h2>{userName.trim() || 'N/A'}</h2>
                <p className="profile-summary-role">{ROLE_LABELS[role]}</p>
                <input
                  ref={avatarInput}
                  className="sr-only"
                  type="file"
                  aria-label="Choose profile picture"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    selectAvatar(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                {saveAvatar.isPending && <p className="small muted" role="status">Preparing and uploading… JPG, PNG, or WebP; up to 10 MB.</p>}
                {saveAvatar.isError && <ErrorState error={saveAvatar.error} />}
                {avatarLoadError && <ErrorState error={avatarLoadError} />}
                {saveAvatar.isSuccess && <p className="small" role="status">Profile picture updated.</p>}
              </div>
            </div>
            <div className="profile-groups">
              <section className="profile-group profile-group-main" aria-labelledby="profile-details-title">
                <h3 id="profile-details-title">Contact Details &amp; Assignment</h3>
                <dl className="profile-details">
                  <div><dt>Name</dt><dd>{userName.trim() || 'N/A'}</dd></div>
                  <div><dt>Role</dt><dd>{ROLE_LABELS[role]}</dd></div>
                  <div><dt>Employee ID</dt><dd>{user.employeeId || 'N/A'}</dd></div>
                  {role !== 'admin' && <div><dt>Hatchery / site</dt><dd>{site.isLoading ? 'Loading...' : site.isError ? <ErrorState error={site.error} onRetry={() => void site.refetch()} /> : site.data?.trim() ? hatcheryLabel(site.data) : 'N/A'}</dd></div>}
                  <div><dt>Position</dt><dd>{user.position || 'N/A'}</dd></div>
                  <div><dt>Email</dt><dd>{user.email || 'N/A'}</dd></div>
                  <div><dt>Address</dt><dd>{user.address || 'N/A'}</dd></div>
                  <div id="security" className="profile-security"><dt>Change Password</dt><dd><button className="button button-danger" type="button" disabled>Change password</button></dd></div>
                  <div><dt>Phone</dt><dd>{user.phone || 'N/A'}</dd></div>
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

        <section id="device-maintenance" className="card profile-preferences" aria-labelledby="device-maintenance-title">
          <div className="profile-panel-heading"><h2 id="device-maintenance-title">Device maintenance</h2></div>
          <div className="profile-maintenance-fields">
          {tanks.isLoading || (role !== 'admin' && site.isLoading) ? <LoadingState label="Loading available tanks" /> : tanks.isError ? <ErrorState error={tanks.error} onRetry={() => void tanks.refetch()} /> : role !== 'admin' && site.isError ? <ErrorState error={site.error} onRetry={() => void site.refetch()} /> : <>
            <label className="field">Tank
              <Select value={maintenanceTanks.some((item) => item.id === maintenanceTankId) ? maintenanceTankId : ''} disabled={maintenanceTanks.length === 0} onChange={(event) => setMaintenanceTankId(event.target.value)}>
                <option value="">Select a tank</option>
                {maintenanceTanks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </label>
            {hatchery && maintenanceTanks.length === 0 && <p className="small muted">No tanks are available for this hatchery.</p>}
          </>}
          <div className="profile-actions">
            {role === 'operator' ? <>
              <button className="button" type="button" disabled>Request calibration</button>
              <button className="button" type="button" disabled>Request reboot</button>
            </> : <button className="button" type="button" disabled>Reboot device</button>}
          </div>
          </div>
        </section>
      </div>
    </div>
  );
}
