import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getManilaDateString } from '@hydrosense/shared';
import { ArrowLeft, Search, Send } from 'lucide-react-native';
import { mobileChat } from './services/chat';
import type { ChatContact } from './services/chat';
import { useSession } from './state';
import { uiScale, useTheme } from './theme';
import type { Palette } from './theme';

const timeFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true });
const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function Avatar({ name, team, colors }: { name: string; team?: boolean; colors: Palette }) {
  const styles = createStyles(colors);
  return <View style={[styles.avatar, team && styles.teamAvatar]}><Text style={[styles.avatarText, team && styles.onAccent]}>{initials(name)}</Text></View>;
}

function AdminBadge({ colors }: { colors: Palette }) {
  const styles = createStyles(colors);
  return <View style={styles.badge}><Text style={styles.badgeText}>Admin</Text></View>;
}

export function ChatScreen() {
  const { colors } = useTheme();
  const { user } = useSession();
  const focused = useIsFocused();
  const queryClient = useQueryClient();
  const styles = createStyles(colors);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [searchFocused, setSearchFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const threads = useQuery({
    queryKey: ['mobile-chat', 'threads', user?.id], queryFn: mobileChat.threads,
    enabled: focused && Boolean(user), refetchInterval: 10_000,
  });
  const contacts = useQuery({
    queryKey: ['mobile-chat', 'contacts', user?.id], queryFn: mobileChat.contacts,
    enabled: focused && Boolean(user), refetchInterval: 30_000,
  });
  const messages = useQuery({
    queryKey: ['mobile-chat', 'messages', user?.id, selected], queryFn: () => mobileChat.messages(selected),
    enabled: focused && Boolean(user && selected), refetchInterval: 10_000,
  });
  const thread = threads.data?.find((item) => item.id === selected);
  const refreshThreads = () => queryClient.invalidateQueries({ queryKey: ['mobile-chat', 'threads', user?.id] });
  const open = useMutation({
    mutationKey: ['mobile-chat', 'open'],
    mutationFn: async (contact: ChatContact) => {
      if (user?.role === 'admin' || contact.role === 'admin') {
        const owner = user?.role === 'admin' ? contact.id : user?.id;
        const team = threads.data?.find((item) => item.kind === 'team' && item.ownerId === owner);
        if (!team) throw new Error('The team conversation is unavailable.');
        return team.id;
      }
      return mobileChat.open(contact.id);
    },
    onSuccess: async (id) => {
      await refreshThreads();
      setSelected(id); setSearch(''); setBody('');
    },
  });
  const send = useMutation({
    mutationKey: ['mobile-chat', 'send'],
    mutationFn: ({ id, text }: { id: string; text: string }) => mobileChat.send(id, text),
    onSuccess: async (_result, { id }) => {
      setBody('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-chat', 'messages', user?.id, id] }),
        refreshThreads(),
      ]);
    },
  });
  const markRead = useMutation({
    mutationKey: ['mobile-chat', 'read'],
    mutationFn: ({ id, messageId }: { id: string; messageId: string }) => mobileChat.read(id, messageId),
    onSuccess: refreshThreads,
  });
  useEffect(() => {
    const last = messages.data?.[messages.data.length - 1];
    if (focused && selected && messages.isSuccess && last && thread && thread.unreadCount > 0 && !markRead.isPending) {
      markRead.mutate({ id: selected, messageId: last.id });
    }
  }, [focused, selected, messages.dataUpdatedAt, messages.isSuccess, thread?.unreadCount]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selected) return false;
      if (!send.isPending) setSelected('');
      return true;
    });
    return () => subscription.remove();
  }, [selected, send.isPending]));

  const length = Array.from(body).length;
  const disabled = !thread?.chatEnabled || !body.trim() || length > 600 || send.isPending;
  const filteredContacts = search.trim()
    ? (contacts.data ?? []).filter((contact) => contact.name.toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const visibleThreads = (threads.data ?? []).filter((item) => user?.role !== 'admin' || item.lastMessage !== null);
  const team = thread?.kind === 'team' && user?.role !== 'admin';
  const error = (message: string, retry?: () => void) => <View style={styles.errorBox}>
    <Text accessibilityRole="alert" style={styles.errorText}>{message}</Text>
    {retry && <Pressable accessibilityRole="button" onPress={retry}><Text style={styles.retry}>Retry</Text></Pressable>}
  </View>;

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.panel}>
      {!selected ? <>
        <View style={styles.listHeader}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.muted}>Coordinate with your team and HydroSense support.</Text>
          <View style={[styles.search, searchFocused && styles.focused]}>
            <Search size={19} color={colors.muted} />
            <TextInput accessibilityLabel="Search contacts" placeholder="Search contacts" placeholderTextColor={colors.muted}
              value={search} onChangeText={setSearch} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} autoCorrect={false} style={styles.searchInput} />
          </View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          {contacts.isError && error(contacts.error.message, () => void contacts.refetch())}
          {search.trim() && contacts.isPaused && !contacts.data && <Text style={styles.muted}>Waiting for a connection to load contacts.</Text>}
          {open.isError && error(open.error.message)}
          {open.isPaused && <Text accessibilityLiveRegion="polite" style={styles.muted}>Waiting for a connection to open the conversation.</Text>}
          {filteredContacts.map((contact) => <Pressable key={contact.id} accessibilityRole="button" disabled={open.isPending}
            onPress={() => open.mutate(contact)} style={styles.row}>
            <Avatar name={contact.name} team={contact.role === 'admin'} colors={colors} />
            <View style={styles.rowText}><View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{contact.name}</Text>{contact.role === 'admin' && <AdminBadge colors={colors} />}</View></View>
          </Pressable>)}
          {threads.isPaused && !threads.data ? <Text style={styles.muted}>Waiting for a connection to load conversations.</Text> :
            threads.isLoading ? <Text style={styles.muted}>Loading conversations...</Text> :
            threads.isError ? error(threads.error.message, () => void threads.refetch()) :
              visibleThreads.length === 0 ? <Text style={styles.muted}>No conversations yet. Search for a contact to start one.</Text> :
                visibleThreads.map((item) => <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.lastMessage ?? 'No messages yet'}${item.unreadCount ? `, ${item.unreadCount} unread` : ''}`}
                  onPress={() => { setSelected(item.id); setBody(''); }} style={styles.row}>
                  <Avatar name={item.name} team={item.kind === 'team' && user?.role !== 'admin'} colors={colors} />
                  <View style={styles.rowText}><View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{item.name}</Text>{item.kind === 'team' && user?.role !== 'admin' && <AdminBadge colors={colors} />}</View>
                    <Text style={styles.preview} numberOfLines={1}>{item.lastMessage ?? 'No messages yet'}</Text></View>
                  <View style={styles.rowMeta}>
                    {item.lastMessageAt && <Text style={styles.caption}>{timeFormat.format(new Date(item.lastMessageAt))}</Text>}
                    {item.unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View>}
                  </View>
                </Pressable>)}
        </ScrollView>
      </> : !thread ? <View style={styles.list}>
        <Pressable accessibilityRole="button" onPress={() => setSelected('')}><Text style={styles.retry}>Back to conversations</Text></Pressable>
        {threads.isError ? error(threads.error.message, () => void threads.refetch()) : <Text style={styles.muted}>Loading conversation...</Text>}
      </View> : <>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" disabled={send.isPending} onPress={() => setSelected('')} style={styles.iconButton}><ArrowLeft size={22} color={colors.ink} /></Pressable>
          <Avatar name={thread.name} team={team} colors={colors} />
          <View style={styles.nameLine}><Text style={styles.headerName} numberOfLines={1}>{thread.name}</Text>{team && <AdminBadge colors={colors} />}</View>
        </View>
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messageContent} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          <View accessibilityLiveRegion="polite">
            {messages.isPaused && !messages.data ? <Text style={styles.muted}>Waiting for a connection to load messages.</Text> :
              messages.isLoading ? <Text style={styles.muted}>Loading messages...</Text> :
              messages.isError ? error(messages.error.message, () => void messages.refetch()) :
                (messages.data ?? []).map((message, index, all) => {
                  const date = new Date(message.createdAt);
                  const day = getManilaDateString(date);
                  const previousDay = index ? getManilaDateString(new Date(all[index - 1].createdAt)) : null;
                  const own = message.senderId === user?.id;
                  return <Fragment key={message.id}>
                    {day !== previousDay && <Text style={styles.day}>{dateFormat.format(date)}</Text>}
                    <View style={[styles.message, own && styles.ownMessage]}>
                      <View style={[styles.bubble, own && styles.ownBubble]}>
                        {!own && <Text style={styles.sender}>{message.senderName}</Text>}
                        <Text style={[styles.body, own && styles.onAccent]}>{message.body}</Text>
                      </View>
                      <Text style={[styles.caption, own && styles.ownTime]}>{timeFormat.format(date)}</Text>
                    </View>
                  </Fragment>;
                })}
          </View>
        </ScrollView>
        {markRead.isError && error(markRead.error.message, () => {
          const last = messages.data?.[messages.data.length - 1];
          if (last) markRead.mutate({ id: selected, messageId: last.id });
        })}
        {!thread.chatEnabled && <Text accessibilityRole="alert" style={styles.notice}>Chat sending is disabled for your account. You can still read existing messages.</Text>}
        {send.isPaused && <Text accessibilityLiveRegion="polite" style={styles.notice}>Waiting for a connection to send your message.</Text>}
        {send.isError && error(send.error.message)}
        <View style={[styles.composer, inputFocused && styles.focused]}>
          <TextInput accessibilityLabel="Message" multiline placeholder="Write a message..." placeholderTextColor={colors.muted}
            value={body} onChangeText={setBody} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} editable={thread.chatEnabled && !send.isPending}
            onContentSizeChange={(event) => setInputHeight(Math.max(40, Math.min(120, event.nativeEvent.contentSize.height)))}
            style={[styles.input, { height: inputHeight }]} />
          <Text style={styles.caption}>{length}/600</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled }} disabled={disabled}
            onPress={() => { if (!disabled) send.mutate({ id: selected, text: body }); }} style={[styles.send, disabled && styles.disabled]}>
            <Send size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      </>}
    </View>
  </KeyboardAvoidingView>;
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, padding: uiScale.spacing[3] },
  panel: { flex: 1, minHeight: 0, borderRadius: uiScale.radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  listHeader: { padding: 16, gap: 8 },
  title: { color: colors.ink, fontSize: uiScale.type.title, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: uiScale.radius.control, backgroundColor: colors.glassControl, paddingHorizontal: 12, marginTop: 8 },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 16, paddingVertical: 8 },
  focused: { borderColor: colors.teal },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 4 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: uiScale.radius.control },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glassControl },
  teamAvatar: { backgroundColor: colors.teal, borderColor: colors.teal },
  avatarText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  name: { color: colors.ink, fontWeight: '700', flexShrink: 1 },
  preview: { color: colors.muted, fontSize: 13 },
  rowMeta: { alignItems: 'flex-end', gap: 5 },
  caption: { color: colors.muted, fontSize: 11 },
  badge: { borderRadius: uiScale.radius.pill, backgroundColor: colors.teal, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderColor: colors.border },
  headerName: { color: colors.ink, fontWeight: '700', fontSize: 18, flexShrink: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  messages: { flex: 1 },
  messageContent: { flexGrow: 1, padding: 16 },
  day: { color: colors.muted, textAlign: 'center', fontSize: 12, marginVertical: 12 },
  message: { alignSelf: 'flex-start', maxWidth: '70%', marginBottom: 12, gap: 4 },
  ownMessage: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glassControl, paddingHorizontal: 12, paddingVertical: 9, gap: 4 },
  ownBubble: { backgroundColor: colors.teal, borderColor: colors.teal },
  sender: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 15 },
  onAccent: { color: colors.onPrimary },
  ownTime: { textAlign: 'right' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, margin: 12, padding: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.glassControl },
  input: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 15, paddingHorizontal: 8, paddingVertical: 8, textAlignVertical: 'top' },
  send: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.teal },
  disabled: { opacity: 0.5 },
  notice: { color: colors.muted, fontSize: 12, marginHorizontal: 16 },
  errorBox: { paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  errorText: { color: colors.critical, fontSize: 13 },
  retry: { color: colors.teal, fontWeight: '700', paddingVertical: 4 },
});
