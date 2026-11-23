import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Camera, Eye, EyeOff, LoaderCircle, X } from 'lucide-react';
import { formatManilaDateTime, validatePasswordChange } from '@hydrosense/shared';
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const maintenanceTanks = scopedTanks;
  const saveAvatar = useMutation({
    mutationFn: (file: File) => authService.saveProfileAvatar(file),
    onSuccess: (url) => {
      setAvatarUrl(url);
      setAvatarLoadError(null);
    },
  });
  const changePassword = useMutation({
    mutationFn: () => authService.changePassword(currentPassword, newPassword, confirmPassword),
    onSuccess: () => {
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordError('');
      setPasswordSuccess(true);
    },
    onError: (error) => setPasswordError(error instanceof Error ? error.message : 'Could not change your password. Please try again.'),
  });

  function closePasswordDialog() {
    if (changePassword.isPending) return;
    setPasswordOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordError('');
  }

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
                  <div id="security" className="profile-security"><dt>Change Password</dt><dd><button className="button" type="button" onClick={() => { setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); setPasswordSuccess(false); setPasswordOpen(true); }}>Change password</button>{passwordSuccess && <p role="status">Password changed successfully.</p>}</dd></div>
                  <div><dt>Phone</dt><dd>{user.phone || 'N/A'}</dd></div>
                </dl>
              </section>
              <section className="profile-group" aria-labelledby="profile-emergency">
                <h3 id="profile-emergency">Emergency Contact</h3>
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
          <div className="profile-panel-heading"><h2 id="alerts-title">Alert Notifications</h2></div>
          <div className="profile-alert-row">
            <ToggleSwitch id="sms-alerts" label="SMS alerts" checked={false} onChange={() => {}} disabled />
          </div>
          <div className="profile-alert-row">
            <ToggleSwitch id="email-alerts" label="Email alerts" checked={false} onChange={() => {}} disabled />
          </div>
        </section>

        <AppearancePanel />

        <section id="device-maintenance" className="card profile-preferences" aria-labelledby="device-maintenance-title">
          <div className="profile-panel-heading"><h2 id="device-maintenance-title">Device Maintenance</h2></div>
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
      {passwordOpen && <div className="dialog-backdrop profile-password-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePasswordDialog();
      }}>
        <section className="dialog card stack profile-password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onKeyDown={(event) => { if (event.key === 'Escape') closePasswordDialog(); }}>
          {role === 'admin' && <button className="icon-button profile-password-close" type="button" aria-label="Close change password dialog" disabled={changePassword.isPending} onClick={closePasswordDialog}><X size={18} aria-hidden="true" /></button>}
          <h2 id="change-password-title">Change Password</h2>
          <form className="stack" noValidate onSubmit={(event) => {
            event.preventDefault();
            const issue = validatePasswordChange(currentPassword, newPassword, confirmPassword);
            if (issue) { setPasswordError(issue); return; }
            setPasswordError('');
            changePassword.mutate();
          }}>
            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <div className="password-control profile-password-control">
                <input id="current-password" autoFocus type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setPasswordError(''); }} disabled={changePassword.isPending} />
                <button className="password-toggle" type="button" aria-label={`${showCurrentPassword ? 'Hide' : 'Show'} current password`} aria-pressed={showCurrentPassword} onClick={() => setShowCurrentPassword((visible) => !visible)} disabled={changePassword.isPending}>
                  {showCurrentPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <div className="password-control profile-password-control">
                <input id="new-password" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setPasswordError(''); }} disabled={changePassword.isPending} />
                <button className="password-toggle" type="button" aria-label={`${showNewPassword ? 'Hide' : 'Show'} new password`} aria-pressed={showNewPassword} onClick={() => setShowNewPassword((visible) => !visible)} disabled={changePassword.isPending}>
                  {showNewPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <div className="password-control profile-password-control">
                <input id="confirm-new-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setPasswordError(''); }} disabled={changePassword.isPending} />
                <button className="password-toggle" type="button" aria-label={`${showConfirmPassword ? 'Hide' : 'Show'} confirm new password`} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword((visible) => !visible)} disabled={changePassword.isPending}>
                  {showConfirmPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <p className="small muted">Use at least 8 characters.</p>
            {passwordError && <p className="profile-password-error" role="alert">{passwordError}</p>}
            <div className="profile-password-actions">
              {role !== 'admin' && <button className="button" type="button" disabled={changePassword.isPending} onClick={closePasswordDialog}>Cancel</button>}
              <button className="button profile-password-submit" type="submit" disabled={changePassword.isPending}>{changePassword.isPending ? 'Changing...' : 'Confirm change'}</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}
