import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  authService,
  DEMO_ADMIN_CREDENTIALS,
  DEMO_ROLE_CREDENTIALS,
  getCurrentUser,
  signOut,
  SUBSCRIBED_HATCHERIES,
} from './authService';
import type { SignUpValues } from '../types/auth.types';

const ACCOUNT_KEY = 'hydrosense.auth.accounts.v2';
const SESSION_KEY = 'hydrosense.auth.session.v2';

function signupValues(overrides: Partial<SignUpValues> = {}): SignUpValues {
  return {
    firstName: 'Taylor',
    lastName: 'Rivera',
    employeeId: 'EMP-123',
    phone: '+63 917 555 0100',
    email: 'taylor@example.com',
    password: 'TestPass!2026',
    hatcheryId: SUBSCRIBED_HATCHERIES[0].id,
    requestedRole: 'operator',
    address: { country: 'PH', province: '1001800000', city: '1001805000', barangay: '1001805001', street: 'Main Street' },
    emergencyContactName: 'Alex Rivera',
    emergencyContactPhone: '+63 917 555 0101',
    confirmPassword: 'TestPass!2026',
    termsAccepted: true,
    ...overrides,
  };
}

async function createPendingRequest(values = signupValues()) {
  await authService.signUp(values);
  return JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) ?? '[]')[0].user.id as string;
}

async function signInAsAdmin() {
  await authService.signIn(DEMO_ADMIN_CREDENTIALS.email, DEMO_ADMIN_CREDENTIALS.password);
}

describe('authService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'crypto', { configurable: true, value: webcrypto });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('signs in the configured admin and stores only the user ID in the session', async () => {
    const result = await authService.signIn(DEMO_ADMIN_CREDENTIALS.email, DEMO_ADMIN_CREDENTIALS.password);

    expect(result).toMatchObject({ status: 'approved', redirectPath: '/' });
    expect(getCurrentUser()).toMatchObject({ id: 'demo-admin', role: 'admin', status: 'approved' });
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? '{}')).toEqual({ userId: 'demo-admin' });
  });

  it.each(DEMO_ROLE_CREDENTIALS)('signs in the $role demo account and restores its session', async ({ role, email, password }) => {
    await expect(authService.signIn(email, 'wrong-password')).rejects.toThrow('Email or password is incorrect.');
    await expect(authService.signIn(email, password)).resolves.toMatchObject({ status: 'approved', user: { role, email } });
    expect(getCurrentUser()).toMatchObject({ role, email });
    signOut();
    expect(getCurrentUser()).toBeNull();
  });

  it('does not overwrite existing demo accounts or recreate a removed account', async () => {
    await signInAsAdmin();
    const [operator] = DEMO_ROLE_CREDENTIALS;
    const account = (await authService.listApprovedUsers()).find((user) => user.email === operator.email);
    expect(account).toBeDefined();
    await authService.removeAccount(account!.id);
    signOut();
    await expect(authService.signIn(operator.email, operator.password)).rejects.toThrow('Email or password is incorrect.');
  });

  it('does not sign in pending accounts and checks the password before reporting pending status', async () => {
    await authService.signUp(signupValues());
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();

    await expect(authService.signIn('taylor@example.com', 'incorrect-password'))
      .rejects.toThrow('Email or password is incorrect.');
    await expect(authService.signIn('taylor@example.com', 'TestPass!2026'))
      .resolves.toMatchObject({ status: 'pending', redirectPath: '/pending-approval' });
    expect(getCurrentUser()).toBeNull();
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('stores the requested role, selected hatchery, and employee ID', async () => {
    const values = signupValues({ hatcheryId: SUBSCRIBED_HATCHERIES[1].id, requestedRole: 'admin' });
    await authService.signUp(values);
    await signInAsAdmin();
    const [request] = await authService.listPendingRequests();
    expect(request).toMatchObject({
      requestedRole: 'admin',
      hatcheryId: 'camiguin-benoni',
    });
    expect(request.employeeId).toBe('EMP-123');
  });

  it('blocks rejected accounts after verifying the password', async () => {
    const userId = await createPendingRequest();
    await signInAsAdmin();
    await authService.rejectRequest(userId);
    signOut();

    await expect(authService.signIn('taylor@example.com', 'incorrect-password'))
      .rejects.toThrow('Email or password is incorrect.');
    await expect(authService.signIn('taylor@example.com', 'TestPass!2026'))
      .rejects.toThrow('Request not approved.');
  });

  it('approves with the selected role instead of the requested role', async () => {
    const userId = await createPendingRequest();
    await signInAsAdmin();
    await authService.approveRequest(userId, 'manager');
    signOut();

    await expect(authService.signIn('taylor@example.com', 'TestPass!2026'))
      .resolves.toMatchObject({ status: 'approved', user: { role: 'manager', requestedRole: 'operator' } });
    expect(getCurrentUser()?.role).toBe('manager');

    const accounts = JSON.parse(window.localStorage.getItem(ACCOUNT_KEY) ?? '[]');
    accounts[0].user.role = 'operator';
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
    expect(getCurrentUser()?.role).toBe('operator');
    accounts[0].user.role = null;
    accounts[0].user.status = 'rejected';
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
    expect(getCurrentUser()).toBeNull();
  });

  it('allows administrators to approve requests as admin', async () => {
    const userId = await createPendingRequest();
    await signInAsAdmin();

    await authService.approveRequest(userId, 'admin');
    expect(await authService.listPendingRequests()).toHaveLength(0);
    signOut();
    await expect(authService.signIn('taylor@example.com', 'TestPass!2026')).resolves.toMatchObject({ user: { role: 'admin' } });
  });

  it('allows only the admin to list and review requests', async () => {
    const firstRequestId = await createPendingRequest();
    const secondRequestId = await createPendingRequest(signupValues({ email: 'second@example.com' }));
    await expect(authService.listPendingRequests()).rejects.toThrow('Only the administrator may review account requests.');

    await signInAsAdmin();
    await authService.approveRequest(firstRequestId, 'operator');
    signOut();
    await authService.signIn('taylor@example.com', 'TestPass!2026');

    await expect(authService.listPendingRequests()).rejects.toThrow('Only the administrator may review account requests.');
    await expect(authService.approveRequest(secondRequestId, 'manager')).rejects.toThrow('Only the administrator may review account requests.');
    await expect(authService.rejectRequest(secondRequestId)).rejects.toThrow('Only the administrator may review account requests.');
  });

  it('rejects duplicate emails, including the admin email', async () => {
    await createPendingRequest();
    await expect(authService.signUp(signupValues({ email: 'TAYLOR@example.com' })))
      .rejects.toThrow('An account with this email already exists.');
    await expect(authService.signUp(signupValues({ email: DEMO_ADMIN_CREDENTIALS.email })))
      .rejects.toThrow('An account with this email already exists.');
  });
});
