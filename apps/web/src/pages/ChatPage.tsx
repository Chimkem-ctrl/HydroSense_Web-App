import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getManilaDateString } from '@hydrosense/shared';
import { ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '../app/auth/RoleContext';
import { DATA_MODE } from '../app/config';
import { PageHeading } from '../components/common/PageHeading';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { useChatThreads } from '../hooks/useChatThreads';
import { chatService } from '../services/chatService';
import type { ChatContact } from '../services/chatService';
import '../styles/chat.css';

const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true });

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function messageDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : getManilaDateString(date);
}

function messageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : timeFormat.format(date);
}

export default function ChatPage() {
  const user = useAuth();
  const queryClient = useQueryClient();
  const threads = useChatThreads();
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contacts = useQuery({
    queryKey: ['chat-contacts', user?.id], queryFn: chatService.contacts,
    enabled: DATA_MODE === 'api' && Boolean(user),
    refetchInterval: 30_000,
  });
  const messages = useQuery({
    queryKey: ['chat-messages', user?.id, selected], queryFn: () => chatService.messages(selected),
    enabled: Boolean(selected) && DATA_MODE === 'api', refetchInterval: 10_000,
  });
  const thread = threads.data?.find((item) => item.id === selected);
  const refreshThreads = () => queryClient.invalidateQueries({ queryKey: ['chat-threads', user?.id] });
  const open = useMutation({
    mutationFn: async (contact: ChatContact) => {
      if (user?.role === 'admin' || contact.role === 'admin') {
        const owner = user?.role === 'admin' ? contact.id : user?.id;
        const team = threads.data?.find((item) => item.kind === 'team' && item.ownerId === owner);
        if (!team) throw new Error('The team conversation is unavailable.');
        return team.id;
      }
      return (await chatService.open(contact.id)).id;
    },
    onSuccess: async (id) => { setSelected(id); setSearch(''); setBody(''); await refreshThreads(); },
  });
  const send = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => chatService.send(id, text),
    onSuccess: async (_result, variables) => {
      setBody('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat-messages', user?.id, variables.id] }),
        refreshThreads(),
      ]);
    },
  });
  const markRead = useMutation({
    mutationFn: ({ id, messageId }: { id: string; messageId: string }) => chatService.read(id, messageId),
    onSuccess: refreshThreads,
  });
  useEffect(() => {
    const lastMessage = messages.data?.[messages.data.length - 1];
    if (selected && messages.isSuccess && lastMessage && thread && thread.unreadCount > 0 && !markRead.isPending) {
      markRead.mutate({ id: selected, messageId: lastMessage.id });
    }
  }, [selected, messages.dataUpdatedAt, messages.isSuccess, thread?.unreadCount]);

  const lastMessageId = messages.data?.[messages.data.length - 1]?.id;
  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [selected, thread?.id, lastMessageId]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [body, selected, thread?.id]);

  const length = Array.from(body).length;
  const filteredContacts = search.trim()
    ? (contacts.data ?? []).filter((contact) => contact.name.toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const visibleThreads = (threads.data ?? []).filter((item) => user?.role !== 'admin' || item.lastMessage !== null);
  return <div className="stack">
    <PageHeading title="Chat" description="Coordinate with your team and contact HydroSense support." />
    {DATA_MODE !== 'api' ? <EmptyState>Chat is available when connected to the backend.</EmptyState> :
      <div className={`chat-layout card${thread ? ' has-selection' : ''}`}>
        <section className="chat-list" aria-label="Conversations">
          <label className="field"><span>Find a contact</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts" /></label>
          {contacts.isError && <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />}
          {open.isError && <ErrorState error={open.error} />}
          {filteredContacts.map((contact) => <button type="button" className="chat-contact" key={contact.id} disabled={open.isPending || send.isPending} onClick={() => open.mutate(contact)}>
            <span className={`chat-avatar${contact.role === 'admin' ? ' is-team' : ''}`} aria-hidden="true">{initials(contact.name)}</span>
            <span className="chat-row-content"><strong>{contact.name}</strong> {contact.role === 'admin' && <span className="chat-admin-badge">Admin</span>}</span>
          </button>)}
          {threads.isLoading ? <LoadingState /> : threads.isError ? <ErrorState error={threads.error} onRetry={() => void threads.refetch()} /> :
            visibleThreads.map((item) => <button type="button" className={`chat-thread${item.id === selected ? ' is-selected' : ''}`} key={item.id} aria-current={item.id === selected ? 'true' : undefined} disabled={send.isPending} onClick={() => { setSelected(item.id); setBody(''); }}>
              <span className={`chat-avatar${item.kind === 'team' && user?.role !== 'admin' ? ' is-team' : ''}`} aria-hidden="true">{initials(item.name)}</span>
              <span className="chat-row-content">
                <span className="chat-row-heading"><strong>{item.name}</strong> {item.kind === 'team' && user?.role !== 'admin' && <span className="chat-admin-badge">Admin</span>}</span>
                <small>{item.lastMessage ?? 'No messages yet'}</small>
              </span>
              <span className="chat-row-meta">
                {item.lastMessageAt && <time dateTime={item.lastMessageAt}>{messageTime(item.lastMessageAt)}</time>}
                {item.unreadCount > 0 && <span className="chat-unread" aria-label={`${item.unreadCount} unread`}>{item.unreadCount}</span>}
              </span>
            </button>)}
        </section>
        <section className="chat-conversation" aria-label="Messages">
          {!thread ? <EmptyState>Select a conversation to view messages.</EmptyState> : <>
            <header className="chat-header">
              <button type="button" className="chat-back" aria-label="Back to conversations" disabled={send.isPending} onClick={() => setSelected('')}><ArrowLeft size={20} aria-hidden="true" /></button>
              <span className={`chat-avatar${thread.kind === 'team' && user?.role !== 'admin' ? ' is-team' : ''}`} aria-hidden="true">{initials(thread.name)}</span>
              <h2>{thread.name} {thread.kind === 'team' && user?.role !== 'admin' && <span className="chat-admin-badge">Admin</span>}</h2>
            </header>
            <div className="chat-messages" ref={messagesRef} aria-live="polite">
              {messages.isLoading ? <LoadingState /> : messages.isError ? <ErrorState error={messages.error} onRetry={() => void messages.refetch()} /> :
                (messages.data ?? []).map((message, index, all) => {
                  const date = new Date(message.createdAt);
                  const day = messageDay(message.createdAt);
                  const previousDay = index > 0 ? messageDay(all[index - 1].createdAt) : null;
                  const own = message.senderId === user?.id;
                  return <Fragment key={message.id}>
                    {day !== previousDay && <div className="chat-day"><time dateTime={day}>{day === 'Invalid date' ? day : dateFormat.format(date)}</time></div>}
                    <article className={`chat-message${own ? ' is-own' : ''}`}>
                      <div className="chat-bubble">{!own && <strong>{message.senderName}</strong>}<p>{message.body}</p></div>
                      <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                    </article>
                  </Fragment>;
                })}
            </div>
            {markRead.isError && <ErrorState error={markRead.error} />}
            {!thread.chatEnabled && <p role="status">Chat sending is disabled for your account. You can still read existing messages.</p>}
            <form className="chat-compose" onSubmit={(event) => {
              event.preventDefault();
              if (body.trim() && length <= 600 && thread.chatEnabled && !send.isPending) send.mutate({ id: selected, text: body });
            }}>
              <div className="chat-compose-control">
                <textarea ref={textareaRef} aria-label="Message" placeholder="Write a message..." rows={1} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }} disabled={!thread.chatEnabled} />
                <span className="chat-counter">{length}/600</span>
                <button type="submit" className="chat-send" aria-label="Send" disabled={!thread.chatEnabled || !body.trim() || length > 600 || send.isPending}><Send size={19} aria-hidden="true" /></button>
              </div>
              {send.isError && <ErrorState error={send.error} />}
            </form>
          </>}
        </section>
      </div>}
  </div>;
}
