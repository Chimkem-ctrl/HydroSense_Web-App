import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatPage from './ChatPage';

const service = vi.hoisted(() => ({
  contacts: vi.fn(),
  threads: vi.fn(),
  messages: vi.fn(),
  open: vi.fn(),
  send: vi.fn(),
  read: vi.fn(),
  setEnabled: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: 'operator' as 'operator' | 'admin' }));
vi.mock('../services/chatService', () => ({ chatService: service }));
vi.mock('../app/config', () => ({ DATA_MODE: 'api' }));
vi.mock('../app/auth/RoleContext', () => ({ useAuth: () => ({ id: 'alice', role: auth.role }) }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  auth.role = 'operator';
});

function renderChat(enabled: boolean) {
  service.contacts.mockResolvedValue([]);
  service.threads.mockResolvedValue([{
    id: 'thread', kind: 'direct', ownerId: 'alice', name: 'Deleted user',
    lastMessage: 'Hello', lastMessageAt: null, createdAt: '2026-01-01', unreadCount: 0, chatEnabled: enabled,
  }]);
  service.messages.mockResolvedValue([{
    id: 'message', senderId: null, senderName: 'Deleted user', body: 'Hello', createdAt: '2026-01-01',
  }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>);
}

describe('chat', () => {
  it('shows admin conversations only after a message and does not label users as admins', async () => {
    auth.role = 'admin';
    const active = { id: 'active', kind: 'team', ownerId: 'bob', name: 'Bob', lastMessage: 'Hello', lastMessageAt: null, createdAt: '2026-01-01', unreadCount: 0, chatEnabled: true };
    const empty = { ...active, id: 'empty', ownerId: 'carol', name: 'Carol', lastMessage: null };
    service.contacts.mockResolvedValue([{ id: 'carol', name: 'Carol', role: 'operator' }]);
    service.threads.mockResolvedValue([active, empty]);
    service.messages.mockResolvedValue([]);
    service.send.mockImplementation(async () => {
      service.threads.mockResolvedValue([active, { ...empty, lastMessage: 'Hi Carol' }]);
      return { id: 'new' };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>);

    const list = screen.getByRole('region', { name: 'Conversations' });
    const bob = await within(list).findByRole('button', { name: /Bob/ });
    expect(bob).not.toHaveTextContent('Admin');
    expect(within(list).queryByText('Carol')).not.toBeInTheDocument();
    fireEvent.click(bob);
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search contacts'), { target: { value: 'Carol' } });
    fireEvent.click(await within(list).findByRole('button', { name: 'Carol' }));
    await screen.findByRole('heading', { name: 'Carol' });
    expect(within(list).queryByText('Carol')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi Carol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await within(list).findByRole('button', { name: /Carol/ })).toBeInTheDocument();
  });

  it('keeps the empty team thread and Admin badge visible to non-admins', async () => {
    service.contacts.mockResolvedValue([]);
    service.threads.mockResolvedValue([{
      id: 'team', kind: 'team', ownerId: 'alice', name: 'HydroSense Team',
      lastMessage: null, lastMessageAt: null, createdAt: '2026-01-01', unreadCount: 0, chatEnabled: true,
    }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>);
    expect(await screen.findByRole('button', { name: /HydroSense Team.*Admin/ })).toBeInTheDocument();
  });

  it('shows deleted senders and blocks empty or overlong messages', async () => {
    renderChat(true);
    fireEvent.click(await screen.findByRole('button', { name: /Deleted user/ }));
    expect(await within(screen.getByRole('region', { name: 'Messages' })).findByText('Hello')).toBeInTheDocument();
    expect(screen.getAllByText('Deleted user').length).toBeGreaterThan(0);
    const input = screen.getByLabelText('Message');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: 'x'.repeat(601) } });
    expect(screen.getByText('601/600')).toBeInTheDocument();
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: 'hello' } });
    service.send.mockResolvedValue({ id: 'new' });
    fireEvent.click(send);
    await waitFor(() => expect(service.send).toHaveBeenCalledWith('thread', 'hello'));
  });

  it('lets disabled users read but not send', async () => {
    renderChat(false);
    fireEvent.click(await screen.findByRole('button', { name: /Deleted user/ }));
    expect(await within(screen.getByRole('region', { name: 'Messages' })).findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/Chat sending is disabled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('groups messages by Manila day and shows sender names only for received messages', async () => {
    renderChat(true);
    service.messages.mockResolvedValue([
      { id: 'one', senderId: 'bob', senderName: 'Bob', body: 'First', createdAt: '2026-01-01T15:59:00Z' },
      { id: 'two', senderId: 'alice', senderName: 'Alice', body: 'Second', createdAt: '2026-01-01T16:01:00Z' },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: /Deleted user/ }));
    const messages = screen.getByRole('region', { name: 'Messages' });
    expect(await within(messages).findByText('First')).toBeInTheDocument();
    expect(within(messages).getByText('Jan 1, 2026')).toBeInTheDocument();
    expect(within(messages).getByText('Jan 2, 2026')).toBeInTheDocument();
    expect(within(messages).getByText('Bob')).toBeInTheDocument();
    expect(within(messages).queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deleted user/ })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(screen.queryByRole('heading', { name: 'Deleted user' })).not.toBeInTheDocument();
  });

  it('submits on Enter but not Shift+Enter', async () => {
    renderChat(true);
    service.send.mockResolvedValue({ id: 'new' });
    fireEvent.click(await screen.findByRole('button', { name: /Deleted user/ }));
    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(service.send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(service.send).toHaveBeenCalledWith('thread', 'hello'));
  });
});
