export function validatePasswordChange(current: string, next: string, confirmation: string): string | null {
  if (!current) return 'Enter your current password.';
  if (!next) return 'Enter a new password.';
  if (next.length < 8) return 'Use at least 8 characters for your new password.';
  if (next === current) return 'Choose a password different from your current password.';
  if (!confirmation) return 'Confirm your new password.';
  if (next !== confirmation) return 'New passwords do not match.';
  return null;
}

async function authResponse(response: Response, action: string): Promise<unknown> {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`${action}: invalid server response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (typeof result === 'object' && result !== null) {
      for (const key of ['error_description', 'msg', 'message', 'error']) {
        if (key in result && typeof result[key as keyof typeof result] === 'string') {
          message = String(result[key as keyof typeof result]);
          break;
        }
      }
    }
    throw new Error(`${action}: ${message}`);
  }
  return result;
}

export async function changeSupabasePassword(options: {
  url: string; apiKey: string; token: string; userId: string; email: string;
  current: string; next: string; isCurrentSession: () => boolean;
}): Promise<void> {
  const { url, apiKey, token, userId, email, current, next, isCurrentSession } = options;
  if (!url || !apiKey || !token || !userId || !email.trim()) throw new Error('Your account or authentication configuration is unavailable.');
  const base = url.replace(/\/$/, '');
  const verification = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password: current }),
  });
  const verified = await authResponse(verification, 'Could not verify your current password');
  if (typeof verified !== 'object' || verified === null ||
      !('access_token' in verified) || typeof verified.access_token !== 'string' || !verified.access_token.trim() || !('user' in verified) ||
      typeof verified.user !== 'object' || verified.user === null || !('id' in verified.user) || verified.user.id !== userId) {
    throw new Error('The password verification response did not match your account.');
  }
  if (!isCurrentSession()) throw new Error('Your session changed. Sign in again before changing your password.');
  const response = await fetch(`${base}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: next }),
  });
  const updated = await authResponse(response, 'Could not change your password');
  if (typeof updated !== 'object' || updated === null || !('id' in updated) || updated.id !== userId) {
    throw new Error('The server did not confirm the password change for your account.');
  }
}
