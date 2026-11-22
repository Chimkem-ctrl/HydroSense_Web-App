import { changeSupabasePassword, formatSignupAddress, validatePasswordChange } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';
import { DATA_MODE } from '../app/config';
import type {
  AccountStatus,
  AuthUser,
  PendingRequest,
  RequestedRole,
  SignUpValues,
  StoredAccount,
} from '../types/auth.types';

export type AuthResult =
  | { status: 'approved'; user: AuthUser; redirectPath: '/' }
  | { status: 'pending'; redirectPath: '/pending-approval' }
  | { status: 'verify-email'; email: string; redirectPath: '/verify-email' };

export class EmailNotVerifiedError extends Error {
  constructor() {
    super('Please verify your email first.');
    this.name = 'EmailNotVerifiedError';
  }
}

export const SUBSCRIBED_HATCHERIES = [
  {
    id: 'camiguin-sagay',
    name: 'Camiguin, Sagay Multispecies Hatchery',
  },
  {
    id: 'camiguin-benoni',
    name: 'Camiguin, Benoni Experimental Station',
  },
] as const;

export function hatcheryLabel(site?: string | null): string {
  const value = site?.trim();
  return value ? SUBSCRIBED_HATCHERIES.find((hatchery) => hatchery.id === value)?.name ?? value : 'Unassigned';
}

export const DEMO_ADMIN_CREDENTIALS = {
  email: import.meta.env.VITE_ADMIN_EMAIL?.trim() || 'hydrosense.team@admin.com',
  password: import.meta.env.VITE_ADMIN_PASSWORD || 'hydrosense_team_2026',
} as const;

export const DEMO_ROLE_CREDENTIALS = [
  { role: 'operator', email: 'operator@demo.invalid', password: 'DemoOperator2026!' },
  { role: 'manager', email: 'manager@demo.invalid', password: 'DemoManager2026!' },
] as const;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  || 'https://iafooterjwbihuzwakoc.supabase.co';
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_Dagoxgq2hOU3RFsE8RJGaA_jUtn8oJn';

const ACCOUNTS_KEY = 'hydrosense.auth.accounts.v2';
const SESSION_KEY = 'hydrosense.auth.session.v2';
const ADMIN_AVATAR_KEY = 'hydrosense.auth.admin-avatar.v1';
const DEMO_ROLES_SEEDED_KEY = 'hydrosense.auth.demo-roles-seeded.v1';
const ADMIN_ID = 'demo-admin';
const ADMIN_SALT = 'hydrosense-demo-admin-v2';
const ADMIN_PASSWORD_KEY = 'hydrosense.auth.admin-password.v1';
const DUMMY_SALT = 'hydrosense-auth-invalid-account-v2';
const AUTH_CHANGE_EVENT = 'hydrosense:auth-change';
const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_AVATAR_INPUT_MAX_BYTES = 10 * 1024 * 1024;
const PROFILE_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type ReviewRole = Exclude<Role, 'admin'>;

export function getApiAccessToken(): string | null {
  return window.localStorage.getItem('hydrosense.auth.access-token');
}

const adminUser: AuthUser & { role: 'admin'; status: 'approved' } = {
  id: ADMIN_ID,
  firstName: 'Dario',
  lastName: 'Minoza',
  email: DEMO_ADMIN_CREDENTIALS.email.trim().toLowerCase(),
  role: 'admin',
  requestedRole: null,
  status: 'approved',
  position: 'System Administrator',
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function listApiAdminProfiles(status: 'pending' | 'approved'): Promise<AuthUser[]> {
  const token = window.localStorage.getItem('hydrosense.auth.access-token');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/api/v1/admin/users?status=${status}`, {
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const profiles = await response.json();
  if (!response.ok) throw new Error(profiles.error ?? 'Unable to load users.');
  return (profiles as Array<Record<string, unknown>>).map((profile) => ({
    id: String(profile.id),
    firstName: String(profile.firstName ?? ''),
    lastName: String(profile.lastName ?? ''),
    email: String(profile.email ?? ''),
    role: profile.role as Role,
    requestedRole: isRequestedRole(profile.requestedRole) ? profile.requestedRole : null,
    status,
    position: profile.position as string | undefined,
    employeeId: profile.employeeId as string | undefined,
    phone: profile.phone as string | undefined,
    address: profile.address as string | undefined,
    emergencyContactName: profile.emergencyContactName as string | undefined,
    emergencyContactPhone: profile.emergencyContactPhone as string | undefined,
    hatcheryId: profile.site as string | undefined,
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : undefined,
    createdAt: String(profile.createdAt ?? ''),
  }));
}

async function prepareProfileAvatar(file: File): Promise<Blob> {
  if (file.size <= 300 * 1024) return file;
  if (typeof createImageBitmap !== 'function') {
    if (file.size <= PROFILE_AVATAR_MAX_BYTES) return file;
    throw new Error('This browser cannot resize the selected image. Choose an image no larger than 2 MB.');
  }

  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the profile picture.');
    context.drawImage(image, 0, 0, width, height);
    const optimized = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Your browser could not prepare the profile picture.'));
      }, 'image/webp', 0.8);
    });
    if (!PROFILE_AVATAR_TYPES.has(optimized.type) || optimized.size === 0 || optimized.size > PROFILE_AVATAR_MAX_BYTES) {
      throw new Error('The optimized profile picture is not valid or is still too large.');
    }
    return optimized;
  } finally {
    image.close();
  }
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected profile picture could not be read.'));
        return;
      }
      resolve(reader.result);
    }, { once: true });
    reader.addEventListener('error', () => reject(new Error('The selected profile picture could not be read.')), { once: true });
    reader.readAsDataURL(file);
  });
}

async function updateApiProfile(userId: string, status: AccountStatus, role: Role | null): Promise<AuthUser> {
  const token = window.localStorage.getItem('hydrosense.auth.access-token');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      apikey: API_KEY,
      Authorization: "Bearer " + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status,
      role,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? result.message ?? 'Unable to update account request.');
  const profile = Array.isArray(result) ? result[0] : result;
  return {
    id: String(profile.id),
    firstName: String(profile.first_name ?? ''),
    lastName: String(profile.last_name ?? ''),
    email: String(profile.email ?? ''),
    role: profile.role as Role,
    requestedRole: profile.requested_role as RequestedRole | null,
    status: profile.status as AccountStatus,
    position: profile.position as string | undefined,
    createdAt: String(profile.created_at ?? ''),
  };
}

function isRequestedRole(value: unknown): value is RequestedRole {
  return value === 'operator' || value === 'manager' || value === 'admin';
}

async function removeApiAccount(userId: string): Promise<void> {
  const token = window.localStorage.getItem('hydrosense.auth.access-token');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${token ?? ''}`,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? result.message ?? 'Unable to remove account.');
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== 'object' || value === null ||
      !('user' in value) || !('passwordSalt' in value) || !('passwordHash' in value)) {
    return false;
  }
  const account = value as {
    user?: Partial<AuthUser>;
    passwordSalt?: unknown;
    passwordHash?: unknown;
  };
  const user = account.user;
  if (typeof user !== 'object' || user === null ||
      typeof account.passwordSalt !== 'string' || typeof account.passwordHash !== 'string') {
    return false;
  }
  const roleMatchesStatus = user.status === 'approved'
    ? user.role === 'operator' || user.role === 'manager' || user.role === 'admin'
    : user.role === null;
  return typeof user.id === 'string' &&
    typeof user.firstName === 'string' &&
    typeof user.lastName === 'string' &&
    typeof user.email === 'string' &&
    typeof user.status === 'string' &&
    ['pending', 'approved', 'rejected'].includes(user.status) &&
    (user.role === null || user.role === 'operator' || user.role === 'manager' || user.role === 'admin') &&
    (user.requestedRole === null || isRequestedRole(user.requestedRole)) &&
    roleMatchesStatus &&
    typeof user.createdAt === 'string';
}

function readAccounts(): StoredAccount[] {
  const saved = window.localStorage.getItem(ACCOUNTS_KEY);
  if (saved === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    throw new Error('Saved demo accounts could not be read. Clear this site’s local storage and try again.');
  }
  if (!Array.isArray(parsed) || !parsed.every(isStoredAccount)) {
    throw new Error('Saved demo account data is invalid. Clear this site’s local storage and try again.');
  }
  return parsed;
}

function writeAccounts(accounts: StoredAccount[]) {
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (error) {
    throw new Error(`Could not save this demo account in the browser: ${String(error)}`);
  }
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

async function hashPassword(password: string, salt: string): Promise<string> {
  if (!window.crypto?.subtle) {
    throw new Error('Secure browser storage is unavailable. Use localhost or HTTPS to sign in.');
  }
  const passwordBytes = new TextEncoder().encode(password);
  const key = await window.crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
  const digest = await window.crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: new TextEncoder().encode(salt),
    iterations: 100_000,
    hash: 'SHA-256',
  }, key, 256);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function seedDemoRoleAccounts(): Promise<void> {
  if (window.localStorage.getItem(DEMO_ROLES_SEEDED_KEY) === 'true') return;
  const seeded = await Promise.all(DEMO_ROLE_CREDENTIALS.map(async ({ role, email, password }): Promise<StoredAccount> => {
    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const passwordSalt = Array.from(saltBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      user: {
        id: `account-${window.crypto.randomUUID()}`,
        firstName: 'Demo',
        lastName: role === 'operator' ? 'Operator' : 'Manager',
        email,
        role,
        requestedRole: null,
        status: 'approved',
        hatcheryId: SUBSCRIBED_HATCHERIES[0].id,
        createdAt: new Date().toISOString(),
      },
      passwordSalt,
      passwordHash: await hashPassword(password, passwordSalt),
    };
  }));
  if (window.localStorage.getItem(DEMO_ROLES_SEEDED_KEY) === 'true') return;
  const accounts = readAccounts();
  for (const account of seeded) {
    if (account.user.email !== adminUser.email && !accounts.some((existing) => existing.user.email.toLowerCase() === account.user.email)) {
      accounts.push(account);
    }
  }
  writeAccounts(accounts);
  window.localStorage.setItem(DEMO_ROLES_SEEDED_KEY, 'true');
}

function secureEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function saveSession(userId: string) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
  } catch (error) {
    throw new Error(`Could not save your demo sign-in session: ${String(error)}`);
  }
  notifyAuthChanged();
}

function readSessionUserId(): string | null {
  const saved = window.localStorage.getItem(SESSION_KEY);
  if (saved === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    throw new Error('The saved sign-in session is invalid. Sign in again.');
  }
  if (typeof parsed !== 'object' || parsed === null ||
      !('userId' in parsed) || typeof parsed.userId !== 'string') {
    throw new Error('The saved sign-in session is invalid. Sign in again.');
  }
  return parsed.userId;
}

function assertAdmin() {
  if (getCurrentUser()?.role !== 'admin') {
    throw new Error('Only the administrator may review account requests.');
  }
}

function validReviewRole(role: Role): role is ReviewRole {
  return role === 'operator' || role === 'manager';
}

function assertStatusRole(status: AccountStatus, role: Role | null) {
  if (status === 'approved' && role === null) {
    throw new Error('An approved account must have an assigned role.');
  }
  if (status !== 'approved' && role !== null) {
    throw new Error('Only approved accounts can have an assigned role.');
  }
}

export function getCurrentUser(): AuthUser | null {
  if (DATA_MODE === 'api') {
    const stored = window.localStorage.getItem('hydrosense.auth.user');
    if (!stored || !window.localStorage.getItem('hydrosense.auth.access-token')) return null;
    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  }
  const userId = readSessionUserId();
  if (!userId) return null;
  if (userId === ADMIN_ID) {
    return { ...adminUser, avatarUrl: window.localStorage.getItem(ADMIN_AVATAR_KEY) ?? undefined };
  }
  const account = readAccounts().find((item) => item.user.id === userId);
  if (!account || account.user.status !== 'approved' || account.user.role === null) return null;
  return { ...account.user };
}

export function signOut() {
  if (DATA_MODE === 'api') {
    window.localStorage.removeItem('hydrosense.auth.access-token');
    window.localStorage.removeItem('hydrosense.auth.user');
    notifyAuthChanged();
    return;
  }
  window.localStorage.removeItem(SESSION_KEY);
  notifyAuthChanged();
}

export const authService = {
  async changePassword(current: string, next: string, confirmation: string): Promise<void> {
    const issue = validatePasswordChange(current, next, confirmation);
    if (issue) throw new Error(issue);
    const user = getCurrentUser();
    if (!user) throw new Error('Your session has expired. Sign in again.');
    if (DATA_MODE === 'api') {
      const token = getApiAccessToken();
      if (!token) throw new Error('Your session has expired. Sign in again.');
      await changeSupabasePassword({
        url: SUPABASE_URL, apiKey: API_KEY, token, userId: user.id, email: user.email, current, next,
        isCurrentSession: () => getApiAccessToken() === token,
      });
      return;
    }
    const accounts = readAccounts();
    const index = accounts.findIndex((account) => account.user.id === user.id);
    const account = index >= 0 ? accounts[index] : null;
    const salt = user.id === ADMIN_ID ? ADMIN_SALT : account?.passwordSalt;
    const expected = user.id === ADMIN_ID
      ? window.localStorage.getItem(ADMIN_PASSWORD_KEY) ?? await hashPassword(DEMO_ADMIN_CREDENTIALS.password, ADMIN_SALT)
      : account?.passwordHash;
    if (!salt || !expected) throw new Error('Your demo account could not be found.');
    if (!secureEquals(await hashPassword(current, salt), expected)) throw new Error('Current password is incorrect.');
    const passwordHash = await hashPassword(next, salt);
    if (getCurrentUser()?.id !== user.id) throw new Error('Your session changed. Sign in again before changing your password.');
    if (user.id === ADMIN_ID) {
      try { window.localStorage.setItem(ADMIN_PASSWORD_KEY, passwordHash); }
      catch (error) { throw new Error(`Could not save your demo password: ${String(error)}`); }
    } else {
      const latest = readAccounts();
      const latestIndex = latest.findIndex((item) => item.user.id === user.id && item.passwordHash === expected);
      if (latestIndex < 0) throw new Error('Your account changed. Please try again.');
      latest[latestIndex] = { ...latest[latestIndex], passwordHash };
      writeAccounts(latest);
    }
  },

  async getProfileAvatarUrl(): Promise<string | undefined> {
    const user = getCurrentUser();
    if (!user) throw new Error('Sign in to view your profile picture.');
    if (DATA_MODE !== 'api') return user.avatarUrl;

    const token = window.localStorage.getItem('hydrosense.auth.access-token');
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/api/v1/profile`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? result.message ?? 'Unable to load your profile picture.');
    if (result.avatarUrl !== null && result.avatarUrl !== undefined && typeof result.avatarUrl !== 'string') {
      throw new Error('Your profile picture URL is invalid.');
    }
    return result.avatarUrl ?? undefined;
  },

  async saveProfileAvatar(file: File): Promise<string> {
    const user = getCurrentUser();
    if (!user) throw new Error('Sign in to update your profile picture.');
    if (!PROFILE_AVATAR_TYPES.has(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
    if (file.size === 0 || file.size > PROFILE_AVATAR_INPUT_MAX_BYTES) {
      throw new Error('Choose an image no larger than 10 MB.');
    }
    const image = await prepareProfileAvatar(file);

    if (DATA_MODE === 'api') {
      const token = window.localStorage.getItem('hydrosense.auth.access-token');
      if (!token) throw new Error('Your session has expired. Sign in again.');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/api/v1/profile/avatar`, {
        method: 'PUT',
        headers: {
          apikey: API_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': image.type || file.type,
        },
        body: image,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? result.message ?? 'Unable to save your profile picture.');
      if (typeof result.avatarUrl !== 'string') throw new Error('The saved profile picture URL is invalid.');
      window.localStorage.setItem('hydrosense.auth.user', JSON.stringify({ ...user, avatarUrl: result.avatarUrl }));
      notifyAuthChanged();
      return result.avatarUrl;
    }

    const avatarUrl = await readFileAsDataUrl(image);
    if (user.id === ADMIN_ID) {
      try {
        window.localStorage.setItem(ADMIN_AVATAR_KEY, avatarUrl);
      } catch (error) {
        throw new Error(`Could not save your profile picture in the browser: ${String(error)}`);
      }
    } else {
      const accounts = readAccounts();
      const index = accounts.findIndex((account) => account.user.id === user.id);
      if (index < 0) throw new Error('Your account could not be found.');
      accounts[index] = { ...accounts[index], user: { ...accounts[index].user, avatarUrl } };
      writeAccounts(accounts);
    }
    notifyAuthChanged();
    return avatarUrl;
  },

  async getProfileSite(user: AuthUser): Promise<string | undefined> {
    if (DATA_MODE !== 'api') return user.hatcheryId;
    const token = window.localStorage.getItem('hydrosense.auth.access-token');
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=site`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${token}` },
    });
    const profiles = await response.json();
    if (!response.ok) throw new Error(profiles.message ?? 'Unable to load your hatchery assignment.');
    if (!Array.isArray(profiles) || !profiles[0]) throw new Error('Your account profile was not found.');
    if (profiles[0].site !== null && typeof profiles[0].site !== 'string') throw new Error('Your hatchery assignment is invalid.');
    return profiles[0].site ?? undefined;
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    if (DATA_MODE === 'api') {
      if (!API_KEY) throw new Error('Supabase publishable key is not configured.');
      const supabaseUrl = SUPABASE_URL;

      const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: API_KEY,
          Authorization: "Bearer " + API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const authResult = await authResponse.json();
      if (!authResponse.ok) {
        if (authResult.code === 'email_not_confirmed') {
          throw new EmailNotVerifiedError();
        }
        throw new Error(authResult.error_description ?? authResult.error ?? 'Email or password is incorrect.');
      }

      const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authResult.user.id)}&select=*`, {
        headers: {
          apikey: API_KEY,
          Authorization: "Bearer " + authResult.access_token,
        },
      });
      const profiles = await profileResponse.json();
      if (!profileResponse.ok) throw new Error(profiles.message ?? 'Unable to load your account status.');
      const profile = Array.isArray(profiles) ? profiles[0] : undefined;
      if (!profile) throw new Error('Your account profile was not found.');
      if (profile.status === 'rejected') throw new Error('Request not approved.');
      if (profile.status === 'pending') {
        return { status: 'pending', redirectPath: '/pending-approval' };
      }
      if (profile.status !== 'approved' || !['operator', 'manager', 'admin'].includes(profile.role)) {
        throw new Error('This account does not have a valid approved role.');
      }

      const user: AuthUser = {
        id: profile.id,
        firstName: profile.first_name ?? '',
        lastName: profile.last_name ?? '',
        email: profile.email,
        role: profile.role,
        requestedRole: profile.requested_role,
        status: profile.status,
        position: profile.position ?? undefined,
        employeeId: profile.employee_id ?? undefined,
        phone: profile.phone ?? undefined,
        address: profile.address ?? undefined,
        emergencyContactName: profile.emergency_contact_name ?? undefined,
        emergencyContactPhone: profile.emergency_contact_phone ?? undefined,
        hatcheryId: profile.site ?? undefined,
        createdAt: profile.created_at,
      };
      window.localStorage.setItem('hydrosense.auth.access-token', authResult.access_token);
      window.localStorage.setItem('hydrosense.auth.user', JSON.stringify(user));
      notifyAuthChanged();
      return { status: 'approved', user, redirectPath: '/' };
    }
    await seedDemoRoleAccounts();
    const normalizedEmail = email.trim().toLowerCase();
    const accounts = readAccounts();
    const isAdmin = normalizedEmail === adminUser.email;
    const account = isAdmin
      ? {
        user: adminUser,
        passwordSalt: ADMIN_SALT,
        passwordHash: window.localStorage.getItem(ADMIN_PASSWORD_KEY) ?? await hashPassword(DEMO_ADMIN_CREDENTIALS.password, ADMIN_SALT),
      }
      : accounts.find((item) => item.user.email.toLowerCase() === normalizedEmail);

    const passwordSalt = account?.passwordSalt ?? DUMMY_SALT;
    const expectedHash = account?.passwordHash ?? await hashPassword('invalid-account-password', DUMMY_SALT);
    const suppliedHash = await hashPassword(password, passwordSalt);
    if (!account || !secureEquals(suppliedHash, expectedHash)) {
      throw new Error('Email or password is incorrect.');
    }

    if (account.user.status === 'pending') {
      return { status: 'pending', redirectPath: '/pending-approval' };
    }
    if (account.user.status === 'rejected') {
      throw new Error('Request not approved.');
    }
    saveSession(account.user.id);
    return { status: 'approved', user: { ...account.user }, redirectPath: '/' };
  },

  async signUp(values: SignUpValues): Promise<AuthResult> {
    const address = formatSignupAddress(values.address);
    if (!address) throw new Error('Select a valid country, province, city and barangay, and enter a street address.');
    if (DATA_MODE === 'api') {
      if (!API_KEY) throw new Error('Supabase publishable key is not configured.');
      const supabaseUrl = SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/api/v1/auth/signup`, {
        method: 'POST',
        headers: {
          apikey: API_KEY,
          Authorization: "Bearer " + API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          password: values.password,
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          employeeId: values.employeeId.trim(),
          phone: values.phone.trim(),
          address: values.address,
          emergencyContactName: values.emergencyContactName.trim(),
          emergencyContactPhone: values.emergencyContactPhone.trim(),
          hatcheryId: values.hatcheryId,
          requestedRole: values.requestedRole,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429 || result.error_code === 'over_email_send_rate_limit') {
          throw new Error('Too many signup attempts. Wait a few minutes before trying again.');
        }
        throw new Error(result.error ?? result.msg ?? 'Unable to create account.');
      }
      if (result.status !== 'verify-email') {
        throw new Error('Unable to start email verification.');
      }
      return {
        status: 'verify-email',
        email: typeof result.email === 'string' ? result.email : values.email.trim().toLowerCase(),
        redirectPath: '/verify-email',
      };
    }
    const normalizedEmail = values.email.trim().toLowerCase();
    const accounts = readAccounts();
    if (!normalizedEmail || normalizedEmail === adminUser.email ||
        DEMO_ROLE_CREDENTIALS.some((account) => account.email === normalizedEmail) ||
        accounts.some((account) => account.user.email.toLowerCase() === normalizedEmail)) {
      throw new Error('An account with this email already exists. Sign in instead.');
    }
    if (!SUBSCRIBED_HATCHERIES.some((hatchery) => hatchery.id === values.hatcheryId)) {
      throw new Error('Select a subscribed hatchery to continue.');
    }

    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const passwordSalt = Array.from(saltBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const user: AuthUser = {
      id: `account-${window.crypto.randomUUID()}`,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: normalizedEmail,
      role: null,
      requestedRole: values.requestedRole,
      status: 'pending',
      employeeId: values.employeeId.trim(),
      phone: values.phone.trim(),
      hatcheryId: values.hatcheryId,
      address,
      emergencyContactName: values.emergencyContactName.trim(),
      emergencyContactPhone: values.emergencyContactPhone.trim(),
      createdAt: new Date().toISOString(),
    };

    accounts.push({
      user,
      passwordSalt,
      passwordHash: await hashPassword(values.password, passwordSalt),
    });
    writeAccounts(accounts);
    return { status: 'pending', redirectPath: '/pending-approval' };
  },

  async resendVerification(email: string): Promise<void> {
    if (!email.trim()) throw new Error('Enter the email address for your account.');
    if (DATA_MODE !== 'api') throw new Error('Email verification is unavailable in demo mode.');
    if (!API_KEY) throw new Error('Supabase publishable key is not configured.');

    const response = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
      method: 'POST',
      headers: {
        apikey: API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'signup', email: email.trim().toLowerCase() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Please wait before requesting another email.');
      }
      throw new Error(result.msg ?? result.message ?? result.error_description ?? result.error ?? 'Unable to resend verification email.');
    }
  },

  async listPendingRequests(): Promise<PendingRequest[]> {
    assertAdmin();
    if (DATA_MODE === 'api') {
      const users = await listApiAdminProfiles('pending');
      return users.filter((user): user is PendingRequest => user.status === 'pending' && user.role === null);
    }
    return readAccounts()
      .map(({ user }) => user)
      .filter((user): user is PendingRequest => user.status === 'pending' && user.role === null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async listApprovedUsers(): Promise<Array<AuthUser & { role: Role; status: 'approved' }>> {
    assertAdmin();
    if (DATA_MODE === 'api') {
      const users = await listApiAdminProfiles('approved');
      return users.filter((user): user is AuthUser & { role: Role; status: 'approved' } =>
        user.status === 'approved' && user.role !== null);
    }
    return [
      { ...adminUser },
      ...readAccounts()
        .map(({ user }) => user)
        .filter((user): user is AuthUser & { role: Role; status: 'approved' } => user.status === 'approved' && user.role !== null),
    ];
  },

  async updateApprovedUserRole(userId: string, role: Role): Promise<AuthUser> {
    assertAdmin();
    if (!validReviewRole(role)) {
      throw new Error('Users may only be assigned the Operator or Manager role.');
    }
    if (userId === ADMIN_ID) {
      throw new Error('The administrator role cannot be changed.');
    }
    if (DATA_MODE === 'api') throw new Error('Use the role management API for approved accounts.');
    const accounts = readAccounts();
    const index = accounts.findIndex((account) => account.user.id === userId);
    if (index < 0 || accounts[index].user.status !== 'approved') {
      throw new Error('Approved account was not found.');
    }
    const user = { ...accounts[index].user, role };
    accounts[index] = { ...accounts[index], user };
    writeAccounts(accounts);
    notifyAuthChanged();
    return { ...user };
  },

  removeAccount(userId: string): Promise<void> | void {
    assertAdmin();
    if (userId === ADMIN_ID) {
      throw new Error('The administrator account cannot be removed.');
    }
    if (DATA_MODE === 'api') return removeApiAccount(userId);
    const accounts = readAccounts();
    const index = accounts.findIndex((account) => account.user.id === userId);
    if (index < 0) {
      throw new Error('Account was not found.');
    }
    writeAccounts(accounts.filter((account) => account.user.id !== userId));
    notifyAuthChanged();
  },

  async approveRequest(userId: string, role: Role): Promise<AuthUser> {
    assertAdmin();
    if (role !== 'operator' && role !== 'manager' && role !== 'admin') {
      throw new Error('Select an approval role.');
    }
    if (DATA_MODE === 'api') return updateApiProfile(userId, 'approved', role);
    const accounts = readAccounts();
    const index = accounts.findIndex((account) => account.user.id === userId);
    if (index < 0 || accounts[index].user.status !== 'pending') {
      throw new Error('Pending account request was not found.');
    }
    const user = { ...accounts[index].user, status: 'approved' as const, role };
    assertStatusRole(user.status, user.role);
    accounts[index] = { ...accounts[index], user };
    writeAccounts(accounts);
    notifyAuthChanged();
    return { ...user };
  },

  async rejectRequest(userId: string): Promise<AuthUser> {
    assertAdmin();
    if (DATA_MODE === 'api') return updateApiProfile(userId, 'rejected', null);
    const accounts = readAccounts();
    const index = accounts.findIndex((account) => account.user.id === userId);
    if (index < 0 || accounts[index].user.status !== 'pending') {
      throw new Error('Pending account request was not found.');
    }
    const user = { ...accounts[index].user, status: 'rejected' as const, role: null };
    assertStatusRole(user.status, user.role);
    accounts[index] = { ...accounts[index], user };
    writeAccounts(accounts);
    notifyAuthChanged();
    return { ...user };
  },

  requestPasswordReset(email: string): Promise<{ message: string }> {
    if (!email.trim()) {
      return Promise.reject(new Error('Enter the email address for your account.'));
    }
    if (DATA_MODE === 'api') {
      if (!API_KEY) return Promise.reject(new Error('Supabase publishable key is not configured.'));
      const supabaseUrl = SUPABASE_URL;
      return fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          apikey: API_KEY,
          Authorization: "Bearer " + API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      }).then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error_description ?? result.error ?? 'Unable to send password reset.');
        return { message: 'Password reset instructions have been sent.' };
      });
    }
    return Promise.resolve({
      message: 'Demo mode: password reset is not connected to an email service.',
    });
  },
};
