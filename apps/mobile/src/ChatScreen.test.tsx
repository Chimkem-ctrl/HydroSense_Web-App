import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  selected: 'thread', body: 'Hello', enabled: true, mutationIndex: 0, stateIndex: 0,
  send: vi.fn(), setSelected: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.stateIndex++;
    return index === 0 ? [state.selected, state.setSelected] : index === 2 ? [state.body, vi.fn()] : [initial, vi.fn()];
  },
  useRef: () => ({ current: null }), useEffect: () => undefined, useCallback: (fn: unknown) => fn,
}));
vi.mock('react-native', () => ({
  BackHandler: {}, KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' },
  Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (styles: object) => styles },
  Text: 'Text', TextInput: 'TextInput', View: 'View',
}));
vi.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useFocusEffect: () => undefined }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[1] === 'threads') return { data: [{ id: 'thread', name: 'HydroSense Team', kind: 'team', chatEnabled: state.enabled, unreadCount: 0 }], isSuccess: true };
    if (queryKey[1] === 'messages') return { data: [
      { id: '1', senderId: 'other', senderName: 'Deleted user', body: 'First', createdAt: '2026-01-01T15:59:00Z' },
      { id: '2', senderId: 'alice', senderName: 'Alice', body: 'Second', createdAt: '2026-01-01T16:01:00Z' },
    ], isSuccess: true };
    return { data: [] };
  },
  useMutation: () => ({ mutate: state.mutationIndex++ % 3 === 1 ? state.send : vi.fn(), isPending: false, isError: false }),
}));
vi.mock('lucide-react-native', () => ({ ArrowLeft: 'ArrowLeft', Search: 'Search', Send: 'Send' }));
vi.mock('./services/chat', () => ({ mobileChat: {} }));
vi.mock('./state', () => ({ useSession: () => ({ user: { id: 'alice', role: 'operator' } }) }));
vi.mock('./theme', () => ({
  uiScale: { spacing: { 3: 12 }, radius: { card: 20, control: 12, pill: 999 }, type: { title: 28 } },
  useTheme: () => ({ colors: {} }),
}));

import { ChatScreen } from './ChatScreen';

function elements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => elements(child, type)),
  ];
}

beforeEach(() => {
  state.selected = 'thread';
  state.body = 'Hello';
  state.enabled = true;
  state.mutationIndex = 0;
  state.stateIndex = 0;
  state.send.mockClear();
  state.setSelected.mockClear();
});

describe('mobile chat screen', () => {
  it('groups messages by Manila day and hides the sender on own messages', () => {
    const root = ChatScreen();
    const texts = elements(root, 'Text').map((item) => item.props.children);
    expect(texts).toContain('Jan 1, 2026');
    expect(texts).toContain('Jan 2, 2026');
    expect(texts).toContain('Deleted user');
    expect(texts).not.toContain('Alice');
    expect(elements(root, 'View').some((item) => item.props.accessibilityLiveRegion === 'polite')).toBe(true);
  });

  it('keeps sending disabled for accounts without permission and returns to the list', () => {
    state.enabled = false;
    const root = ChatScreen();
    const buttons = elements(root, 'Pressable');
    const send = buttons.find((item) => item.props.accessibilityLabel === 'Send');
    expect(send?.props.disabled).toBe(true);
    const back = buttons.find((item) => item.props.accessibilityLabel === 'Back to conversations');
    (back?.props.onPress as () => void)();
    expect(state.setSelected).toHaveBeenCalledWith('');
  });

  it('sends valid text but disables empty and overlong messages', () => {
    const sendButton = () => elements(ChatScreen(), 'Pressable').find((item) => item.props.accessibilityLabel === 'Send');
    let send = sendButton();
    expect(send?.props.disabled).toBe(false);
    (send?.props.onPress as () => void)();
    expect(state.send).toHaveBeenCalledWith({ id: 'thread', text: 'Hello' });
    for (const body of ['   ', 'x'.repeat(601)]) {
      state.body = body;
      state.stateIndex = 0;
      state.mutationIndex = 0;
      send = sendButton();
      expect(send?.props.disabled).toBe(true);
    }
  });
});
