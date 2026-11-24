import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toByteArray } from 'base64-js';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  values: [] as unknown[], index: 0, queries: [] as Array<{ queryKey: unknown[]; queryFn: () => Promise<unknown> }>,
  role: 'manager' as 'operator' | 'manager' | 'admin', data: {} as Record<string, unknown>, mutate: vi.fn(),
  writeFile: vi.fn(), share: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = typeof initial === 'function' ? initial() : initial;
    return [state.values[index], (value: unknown) => { state.values[index] = typeof value === 'function' ? value(state.values[index]) : value; }];
  },
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Alert: { alert: vi.fn() }, Image: 'Image',
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ height: 600 }),
}));
vi.mock('react-native-paper', () => ({ Dialog: { Title: 'Title', Content: 'Content', Actions: 'Actions' } }));
vi.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: vi.fn(), launchImageLibraryAsync: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: vi.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file://documents/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: state.writeFile }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: state.share }));
vi.mock('lucide-react-native', () => ({ Camera: 'Camera', Check: 'Check', ClipboardList: 'ClipboardList', Droplets: 'Droplets', Eye: 'Eye', EyeOff: 'EyeOff', FileDown: 'FileDown', ListFilter: 'ListFilter', MapPin: 'MapPin', Search: 'Search', Trash2: 'Trash2', UserRound: 'UserRound', Users: 'Users', X: 'X' }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    state.queries.push(options);
    return { data: state.data[String(options.queryKey[0])] ?? { site: 'camiguin-benoni', email: 'user@example.test' }, refetch: vi.fn() };
  },
  useMutation: () => ({ isPending: false, mutate: state.mutate }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('./components/ui', () => ({ Button: 'Button', CalendarFilterField: 'CalendarFilterField', Card: 'Card', Chip: 'Chip', GlassDialog: 'GlassDialog', Page: 'Page', RecordRow: 'RecordRow', StateMessage: 'StateMessage', Title: 'Title' }));
vi.mock('./components/FilterDropdown', () => ({ FilterDropdown: 'FilterDropdown' }));
vi.mock('./components/ProfileControls', () => ({ AlertPreferenceControls: 'AlertPreferenceControls', DeviceMaintenanceControls: 'DeviceMaintenanceControls' }));
vi.mock('./components/AppearanceOptions', () => ({ AppearanceOptions: 'AppearanceOptions' }));
vi.mock('./services/client', () => ({ api: {}, changePassword: vi.fn(), getAccountProfile: vi.fn(), getProfileAvatarUrl: vi.fn(), saveProfileAvatar: vi.fn(), listPendingAccounts: vi.fn(), removeAccount: vi.fn(), reviewPendingAccount: vi.fn() }));
vi.mock('./services/auth', () => ({ HATCHERIES: [{ id: 'camiguin-benoni', name: 'Camiguin, Benoni Experimental Station' }] }));
vi.mock('./state', () => ({
  useSession: () => ({ user: { id: 'user', role: state.role } }),
  useTankSelection: () => ({
    tankId: 'b1',
    tanks: [{ id: 'b1', name: 'Tank 1', site: 'Benoni' }],
    allTanks: [
      { id: 'b1', name: 'Tank 1', site: 'Benoni' },
      { id: 'b2', name: 'Tank 2', site: 'Camiguin, Benoni Experimental Station' },
      { id: 's1', name: 'Sagay tank', site: 'Sagay' },
    ],
  }),
}));
vi.mock('./theme', () => ({
  uiScale: { radius: { pill: 999, control: 12 }, spacing: { 1: 4, 2: 8, 3: 12 }, type: { caption: 12 } },
  useTheme: () => ({ colors: { normal: '#146b35', critical: '#b51c1c' } }),
}));

import { AuditLogsScreen, ProfileScreen, UsersScreen } from './managementScreens';
import { getProfileAvatarUrl } from './services/client';

type Props = { children?: ReactNode; accessibilityLabel?: string; label?: string; message?: string; onPress?: () => void; onChange?: (value: string) => void; onChangeText?: (value: string) => void; secureTextEntry?: boolean; style?: unknown; options?: Array<{ value: string; label: string }>; disabled?: boolean; title?: string; caption?: string; right?: ReactNode; numberOfLines?: number };
function find(node: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return undefined;
}

function all(node: ReactNode): ReactElement<Props>[] {
  if (!isValidElement<Props>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(all)];
}

beforeEach(() => { state.values = []; state.index = 0; state.queries = []; state.role = 'manager'; state.data = {}; state.mutate.mockReset(); state.writeFile.mockReset(); state.share.mockReset(); });

it('returns a defined empty avatar when no profile picture exists', async () => {
  vi.mocked(getProfileAvatarUrl).mockResolvedValueOnce(undefined);
  ProfileScreen();
  const query = state.queries.find((item) => item.queryKey[0] === 'profile-avatar');
  expect(query).toBeDefined();
  await expect(query!.queryFn()).resolves.toBeNull();
});

it('lists all tanks in the assigned Benoni hatchery, independent of the active filter', () => {
  const screen = ProfileScreen();
  const tankPicker = find(screen, (element) => element.type === 'FilterDropdown' && element.props.label === 'Tank');
  expect(tankPicker?.props.options?.map((option) => option.label)).toEqual(['Tank 1', 'Tank 2']);
  expect(tankPicker?.props.options?.map((option) => option.label)).not.toContain('Sagay tank');
});

it('keeps the password confirmation in the scroll area and provides an icon close action', () => {
  const screen = ProfileScreen();
  const row = find(screen, (element) => typeof element.type === 'function' && element.type.name === 'ChangePasswordRow');
  expect(row).toBeDefined();
  state.index = 0;
  const content = (row!.type as (props: Props) => ReactNode)(row!.props);
  const scroll = find(content, (element) => element.type === 'ScrollView');
  expect(scroll?.props.style).toEqual({ maxHeight: 480 });
  expect(find(scroll, (element) => element.props.label === 'Cancel')).toBeUndefined();
  expect(find(scroll, (element) => element.props.label === 'Confirm change')).toBeDefined();
  expect(find(content, (element) => element.type === 'Pressable' && element.props.accessibilityLabel === 'Close change password dialog')).toBeDefined();
  expect(find(scroll, (element) => element.type === 'Text' && String(element.props.children).includes('Are you sure you want to change your password'))).toBeUndefined();
});

it('provides independent show and hide controls for each password field', () => {
  const screen = ProfileScreen();
  const row = find(screen, (element) => typeof element.type === 'function' && element.type.name === 'ChangePasswordRow');
  state.index = 0;
  const content = (row!.type as (props: Props) => ReactNode)(row!.props);
  const scroll = find(content, (element) => element.type === 'ScrollView');
  for (const label of ['Current password', 'New password', 'Confirm new password']) {
    expect(find(scroll, (element) => element.type === 'TextInput' && element.props.accessibilityLabel === label)?.props.secureTextEntry).toBe(true);
    expect(find(scroll, (element) => element.type === 'Pressable' && element.props.accessibilityLabel === `Show ${label.toLowerCase()}`)).toBeDefined();
  }
});

it('shows compact account rows with role chips and confirms removal', () => {
  state.role = 'admin';
  state.data['admin-users'] = [{ id: 'one', name: 'Jane Doe', email: 'jane@example.test', role: 'operator', site: 'Benoni', lastActive: '' }];
  state.data['pending-accounts'] = [{ id: 'two', firstName: 'John', lastName: 'Smith', email: 'john@example.test', requestedRole: 'manager', site: 'Benoni' }];
  let screen = UsersScreen();
  const remove = find(screen, (element) => element.props.accessibilityLabel === 'Remove account Jane Doe');
  expect(remove?.props.style).toMatchObject({ width: 40, height: 40 });
  expect(find(screen, (element) => element.type === 'Chip' && element.props.label === 'Operator')).toBeDefined();
  expect(find(screen, (element) => element.type === 'Chip' && element.props.label === 'Manager')).toBeDefined();
  expect(find(screen, (element) => element.type === 'Text' && element.props.children === 'jane@example.test')?.props.numberOfLines).toBe(1);
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Approve John Smith')).toBeDefined();
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Reject John Smith')).toBeDefined();
  remove?.props.onPress?.();
  state.index = 0;
  screen = UsersScreen();
  expect(find(screen, (element) => element.type === 'Text' && String(element.props.children).includes('Are you sure you want to remove'))).toBeDefined();
  const confirm = find(screen, (element) => element.type === 'Pressable' && all(element).some((child) => child.type === 'Text' && child.props.children === 'Remove account'));
  confirm?.props.onPress?.();
  expect(state.mutate).toHaveBeenCalledWith('one');
});

it('filters audit records by inclusive Manila dates, user, action and detail; clears filters', () => {
  state.role = 'admin';
  state.data['audit-logs'] = [
    { id: 'one', timestamp: '2024-01-01T16:00:00Z', user: 'Jane', action: 'Update', detail: 'Tank Alpha' },
    { id: 'two', timestamp: '2024-01-02T15:59:59Z', user: 'Jane', action: 'Update', detail: 'Tank Beta' },
    { id: 'three', timestamp: '2024-01-02T16:00:00Z', user: 'John', action: 'Remove', detail: 'Tank Alpha' },
  ];
  state.values = ['tank', '2024-01-02', '2024-01-02', 'Jane', 'Update'];
  let screen = AuditLogsScreen();
  expect(all(screen).filter((element) => element.type === 'RecordRow').map((element) => element.props.caption)).toEqual(['Jane · Tank Alpha', 'Jane · Tank Beta']);
  expect(find(screen, (element) => element.type === 'FilterDropdown' && element.props.label === 'User')?.props.options?.map((option) => option.label)).toEqual(['All users', 'Jane', 'John']);
  expect(find(screen, (element) => element.type === 'FilterDropdown' && element.props.label === 'Action')?.props.options?.map((option) => option.label)).toEqual(['All actions', 'Remove', 'Update']);
  find(screen, (element) => element.props.accessibilityLabel === 'Clear filters')?.props.onPress?.();
  state.index = 0;
  screen = AuditLogsScreen();
  expect(all(screen).filter((element) => element.type === 'RecordRow')).toHaveLength(3);
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Clear filters')?.props.disabled).toBe(true);
});

it('exports only filtered audit records and handles invalid dates and empty results', async () => {
  state.role = 'admin';
  state.data['audit-logs'] = [
    { id: 'one', timestamp: '2024-01-01T16:00:00Z', user: 'Jane', action: 'Update', detail: 'Tank Alpha' },
    { id: 'two', timestamp: '2024-01-01T16:00:00Z', user: 'John', action: 'Remove', detail: 'Tank Beta' },
  ];
  state.values = ['alpha'];
  let screen = AuditLogsScreen();
  find(screen, (element) => element.props.accessibilityLabel === 'Export CSV')?.props.onPress?.();
  await vi.waitFor(() => expect(state.share).toHaveBeenCalledOnce());
  const csv = Array.from(toByteArray(state.writeFile.mock.calls[0][1] as string), (byte) => String.fromCharCode(byte)).join('');
  expect(csv).toContain('"Time (PHT)","User","Action","Detail"');
  expect(csv).toContain('"Tank Alpha"');
  expect(csv).not.toContain('Tank Beta');
  state.index = 0;
  state.values = ['', '2024-02-30'];
  screen = AuditLogsScreen();
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Export CSV')?.props.disabled).toBe(true);
  expect(find(screen, (element) => element.type === 'StateMessage' && String(element.props.message).includes('valid dates'))).toBeDefined();
  state.index = 0;
  state.values = ['nothing'];
  screen = AuditLogsScreen();
  expect(find(screen, (element) => element.type === 'StateMessage' && element.props.message === 'No audit events match the filters.')).toBeDefined();
});
