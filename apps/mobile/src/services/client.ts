import {
  HttpApiClient,
  MockApiClient,
  MockLiveClient,
  WebSocketLiveClient,
} from '@hydrosense/shared';
import type { LiveClient } from '@hydrosense/shared';
import type { Role } from '@hydrosense/shared';

export const DATA_MODE: 'mock' | 'api' = process.env.EXPO_PUBLIC_DATA_MODE === 'mock' ? 'mock' : 'api';
const DEFAULT_API_URL = 'https://iafooterjwbihuzwakoc.supabase.co/functions/v1/api';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_URL;
export const API_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  (API_BASE_URL.replace(/\/$/, '') === DEFAULT_API_URL ? 'sb_publishable_Dagoxgq2hOU3RFsE8RJGaA_jUtn8oJn' : undefined);
const wsUrl = process.env.EXPO_PUBLIC_WS_URL?.trim();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '') ||
  API_BASE_URL.match(/^(https?:\/\/[^/]+)\/functions\/v1\/api\/?$/)?.[1];

let accessToken: string | null = null;
export function setMobileAccessToken(token: string | null) {
  accessToken = token;
}

export interface PendingAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string | null;
  site: string | null;
  phone: string | null;
  createdAt: string;
}

export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  site: string | null;
  createdAt: string | null;
  employeeId: string | null;
  phone: string | null;
  position: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

async function authenticatedRequest(path: string, init?: RequestInit): Promise<unknown> {
  if (DATA_MODE !== 'api') throw new Error('This action is unavailable in mobile demo mode.');
  if (!accessToken) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(API_KEY ? { apikey: API_KEY } : {}), Authorization: `Bearer ${accessToken}` },
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string' ? result.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return result;
}

export async function getAccountProfile(userId: string): Promise<AccountProfile> {
  if (!userId.trim()) throw new Error('Sign in to load your profile.');
  let result: unknown;
  if (supabaseUrl) {
    if (!accessToken) throw new Error('Your session has expired. Sign in again.');
    if (!API_KEY) throw new Error('Supabase publishable key is not configured.');
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${accessToken}` },
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error(`The profile server returned an invalid response (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
        ? body.message : `HTTP ${response.status}`;
      throw new Error(`Could not load your profile: ${message}`);
    }
    if (!Array.isArray(body) || body.length !== 1 || typeof body[0] !== 'object' || body[0] === null) {
      throw new Error('Your account profile was not found or is invalid.');
    }
    const profile: Record<string, unknown> = body[0];
    if (profile.id !== userId) throw new Error('The server returned a different account profile.');
    if (typeof profile.first_name !== 'string' || typeof profile.last_name !== 'string') throw new Error('The profile name is invalid.');
    result = {
      id: profile.id, name: `${profile.first_name} ${profile.last_name}`.trim(), email: profile.email,
      role: profile.role, status: profile.status, site: profile.site, createdAt: profile.created_at,
      employeeId: profile.employee_id, phone: profile.phone, position: profile.position, address: profile.address,
      emergencyContactName: profile.emergency_contact_name, emergencyContactPhone: profile.emergency_contact_phone,
    };
  } else {
    result = await authenticatedRequest('/v1/profile');
  }
  if (typeof result !== 'object' || result === null || !('id' in result) || typeof result.id !== 'string' ||
      !('role' in result) || (result.role !== 'operator' && result.role !== 'manager' && result.role !== 'admin') ||
      !('name' in result) || typeof result.name !== 'string' || !('email' in result) || typeof result.email !== 'string' ||
      !('status' in result) || typeof result.status !== 'string') {
    throw new Error('The server returned an invalid account profile.');
  }
  if (result.id !== userId) throw new Error('The server returned a different account profile.');
  const optionalString = (key: string) => {
    if (!(key in result)) return null;
    const field = result[key as keyof typeof result];
    if (field === null || field === undefined) return null;
    if (typeof field !== 'string') throw new Error(`The profile field ${key} is invalid.`);
    return field;
  };
  return {
    id: result.id, name: result.name, email: result.email, role: result.role, status: result.status,
    site: optionalString('site'), createdAt: optionalString('createdAt'), employeeId: optionalString('employeeId'),
    phone: optionalString('phone'), position: optionalString('position'), address: optionalString('address'),
    emergencyContactName: optionalString('emergencyContactName'), emergencyContactPhone: optionalString('emergencyContactPhone'),
  };
}

export async function listPendingAccounts(): Promise<PendingAccount[]> {
  const result = await authenticatedRequest('/v1/admin/users?status=pending');
  if (!Array.isArray(result) || !result.every((item) => item && typeof item.id === 'string' && typeof item.firstName === 'string' && typeof item.lastName === 'string' && typeof item.email === 'string')) {
    throw new Error('The server returned an invalid account list.');
  }
  return result;
}

export async function reviewPendingAccount(id: string, role: Role | null): Promise<void> {
  await authenticatedRequest(`/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ status: role ? 'approved' : 'rejected', role }),
  });
}

export async function removeAccount(id: string): Promise<void> {
  await authenticatedRequest(`/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const api = DATA_MODE === 'api' ? new HttpApiClient(API_BASE_URL, () => accessToken, API_KEY) : new MockApiClient();
export const liveClient: LiveClient | null = DATA_MODE === 'mock'
  ? new MockLiveClient(10_000)
  : wsUrl ? new WebSocketLiveClient(wsUrl) : null;
