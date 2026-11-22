import { getApiAccessToken, signOutIfTokenMatches } from './authService';

export type ChatContact = { id: string; name: string; role: 'operator' | 'manager' | 'admin' };
export type ChatThread = {
  id: string;
  kind: 'direct' | 'team';
  ownerId: string | null;
  name: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  unreadCount: number;
  chatEnabled: boolean;
};
export type ChatMessage = {
  id: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
};

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://iafooterjwbihuzwakoc.supabase.co/functions/v1/api';
const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const token = getApiAccessToken();
  if (!token) throw new Error('Your session has expired. Sign in again.');
  if (!apiKey) throw new Error('Supabase publishable key is not configured.');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: { apikey: apiKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result: unknown = await response.json();
  if (response.status === 401) signOutIfTokenMatches(token);
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error : `Chat request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return result as T;
}

export const chatService = {
  contacts: () => request<ChatContact[]>('/v1/chat/contacts'),
  threads: () => request<ChatThread[]>('/v1/chat/threads'),
  open: (userId: string) => request<{ id: string }>('/v1/chat/threads', 'POST', { userId }),
  messages: (id: string) => request<ChatMessage[]>(`/v1/chat/threads/${encodeURIComponent(id)}/messages`),
  send: (id: string, body: string) => request<{ id: string }>(`/v1/chat/threads/${encodeURIComponent(id)}/messages`, 'POST', { body }),
  read: (id: string, messageId: string) => request<{ success: boolean }>(`/v1/chat/threads/${encodeURIComponent(id)}/read`, 'POST', { messageId }),
  setEnabled: (id: string, enabled: boolean) => request<{ success: boolean }>(`/v1/admin/users/${encodeURIComponent(id)}/chat`, 'PATCH', { enabled }),
};
