import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeSupabasePassword, validatePasswordChange } from './password';

const options = {
  url: 'https://example.test/', apiKey: 'key', token: 'session-token', userId: 'user-1',
  email: 'User@example.test', current: 'old-password', next: 'new-password',
  isCurrentSession: () => true,
};

afterEach(() => vi.unstubAllGlobals());

describe('password change', () => {
  it('validates required fields, length, difference and confirmation', () => {
    expect(validatePasswordChange('', 'new-password', 'new-password')).toMatch(/current password/i);
    expect(validatePasswordChange('old', '', '')).toMatch(/new password/i);
    expect(validatePasswordChange('old', 'short', 'short')).toMatch(/8 characters/i);
    expect(validatePasswordChange('same-password', 'same-password', 'same-password')).toMatch(/different/i);
    expect(validatePasswordChange('old', 'new-password', '')).toMatch(/confirm/i);
    expect(validatePasswordChange('old', 'new-password', 'different')).toMatch(/do not match/i);
    expect(validatePasswordChange('old', 'new-password', 'new-password')).toBeNull();
  });

  it('verifies the current account and updates with the original session token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'user-1' }, access_token: 'verification-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' })));
    vi.stubGlobal('fetch', fetchMock);
    await changeSupabasePassword(options);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.test/auth/v1/token?grant_type=password', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'user@example.test', password: 'old-password' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.test/auth/v1/user', expect.objectContaining({
      method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      body: JSON.stringify({ password: 'new-password' }),
    }));
  });

  it('does not update after a rejected password, mismatched account, or changed session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error_description: 'Invalid login credentials' }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'other' }, access_token: 'verified' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'user-1' }, access_token: 'verified' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(changeSupabasePassword(options)).rejects.toThrow('Invalid login credentials');
    await expect(changeSupabasePassword(options)).rejects.toThrow('did not match');
    await expect(changeSupabasePassword({ ...options, isCurrentSession: () => false })).rejects.toThrow('session changed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces update errors and rejects unconfirmed responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'user-1' }, access_token: 'verified' })))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 'user-1' }, access_token: 'verified' })))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(changeSupabasePassword(options)).rejects.toThrow('HTTP 503');
    await expect(changeSupabasePassword(options)).rejects.toThrow('did not confirm');
  });
});
