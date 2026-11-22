import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('mobile chat', () => {
  it('uses the authenticated API to load and send messages and mark them read', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://example.test/api');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm', senderId: null, senderName: 'Deleted user', body: 'Hello', createdAt: '2026-01-01T00:00:00Z' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sent' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetchMock);
    const { setMobileAccessToken } = await import('./client');
    const { mobileChat } = await import('./chat');
    setMobileAccessToken('token');
    expect(await mobileChat.messages('thread')).toMatchObject([{ senderName: 'Deleted user' }]);
    expect(await mobileChat.send('thread', 'Hello')).toBe('sent');
    await mobileChat.read('thread', 'm');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.test/api/v1/chat/threads/thread/messages', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token', apikey: 'public-key' }), body: JSON.stringify({ body: 'Hello' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://example.test/api/v1/chat/threads/thread/read', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ messageId: 'm' }),
    }));
  });

  it('rejects malformed chat data and surfaces server errors', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://example.test/api');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'm', senderId: null, senderName: 'User', body: 'Hello', createdAt: 'invalid' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Chat sending is disabled.' }), { status: 403 })));
    const { setMobileAccessToken } = await import('./client');
    const { mobileChat } = await import('./chat');
    setMobileAccessToken('token');
    await expect(mobileChat.messages('thread')).rejects.toThrow('invalid chat data');
    await expect(mobileChat.send('thread', 'Hello')).rejects.toThrow('Chat sending is disabled.');
  });
});
