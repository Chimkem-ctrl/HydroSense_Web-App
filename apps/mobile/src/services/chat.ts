import { authenticatedRequest } from './client';

export type ChatContact = { id: string; name: string; role: 'operator' | 'manager' | 'admin' };
export type ChatThread = {
  id: string; kind: 'direct' | 'team'; ownerId: string | null; name: string;
  lastMessage: string | null; lastMessageAt: string | null; createdAt: string;
  unreadCount: number; chatEnabled: boolean;
};
export type ChatMessage = { id: string; senderId: string | null; senderName: string; body: string; createdAt: string };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isContact(value: unknown): value is ChatContact {
  return object(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    (value.role === 'operator' || value.role === 'manager' || value.role === 'admin');
}

function isThread(value: unknown): value is ChatThread {
  return object(value) && typeof value.id === 'string' && (value.kind === 'team' || value.kind === 'direct') &&
    nullableString(value.ownerId) && typeof value.name === 'string' && nullableString(value.lastMessage) &&
    (value.lastMessageAt === null || timestamp(value.lastMessageAt)) && timestamp(value.createdAt) &&
    typeof value.unreadCount === 'number' && Number.isInteger(value.unreadCount) && value.unreadCount >= 0 &&
    typeof value.chatEnabled === 'boolean';
}

function isMessage(value: unknown): value is ChatMessage {
  return object(value) && typeof value.id === 'string' && nullableString(value.senderId) &&
    typeof value.senderName === 'string' && typeof value.body === 'string' && timestamp(value.createdAt);
}

async function list<T>(path: string, guard: (value: unknown) => value is T): Promise<T[]> {
  const result = await authenticatedRequest(path);
  if (!Array.isArray(result) || !result.every(guard)) throw new Error('The server returned invalid chat data.');
  return result;
}

async function post(path: string, body: object): Promise<unknown> {
  return authenticatedRequest(path, { method: 'POST', body: JSON.stringify(body) });
}

function threadPath(id: string) {
  return `/v1/chat/threads/${encodeURIComponent(id)}`;
}

export const mobileChat = {
  contacts: () => list('/v1/chat/contacts', isContact),
  threads: () => list('/v1/chat/threads', isThread),
  messages: (id: string) => list(`${threadPath(id)}/messages`, isMessage),
  async open(userId: string) {
    const result = await post('/v1/chat/threads', { userId });
    if (!object(result) || typeof result.id !== 'string') throw new Error('The server returned an invalid conversation.');
    return result.id;
  },
  async send(id: string, body: string) {
    const result = await post(`${threadPath(id)}/messages`, { body });
    if (!object(result) || typeof result.id !== 'string') throw new Error('The server returned an invalid message.');
    return result.id;
  },
  async read(id: string, messageId: string) {
    const result = await post(`${threadPath(id)}/read`, { messageId });
    if (!object(result) || result.success !== true) throw new Error('The server could not mark the conversation as read.');
  },
};
