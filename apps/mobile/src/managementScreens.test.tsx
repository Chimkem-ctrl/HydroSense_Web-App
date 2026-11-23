import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0, queries: [] as Array<{ queryKey: unknown[]; queryFn: () => Promise<unknown> }> }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
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
vi.mock('lucide-react-native', () => ({ Camera: 'Camera', Check: 'Check', ClipboardList: 'ClipboardList', Droplets: 'Droplets', Eye: 'Eye', EyeOff: 'EyeOff', MapPin: 'MapPin', Search: 'Search', UserRound: 'UserRound', Users: 'Users', X: 'X' }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    state.queries.push(options);
    return { data: { site: 'camiguin-benoni', email: 'user@example.test' } };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({}),
}));
vi.mock('./components/ui', () => ({ Button: 'Button', Card: 'Card', GlassDialog: 'GlassDialog', Page: 'Page', StateMessage: 'StateMessage', Title: 'Title' }));
vi.mock('./components/FilterDropdown', () => ({ FilterDropdown: 'FilterDropdown' }));
vi.mock('./components/ProfileControls', () => ({ AlertPreferenceControls: 'AlertPreferenceControls', DeviceMaintenanceControls: 'DeviceMaintenanceControls' }));
vi.mock('./components/AppearanceOptions', () => ({ AppearanceOptions: 'AppearanceOptions' }));
vi.mock('./services/client', () => ({ api: {}, changePassword: vi.fn(), getAccountProfile: vi.fn(), getProfileAvatarUrl: vi.fn(), saveProfileAvatar: vi.fn() }));
vi.mock('./services/auth', () => ({ HATCHERIES: [{ id: 'camiguin-benoni', name: 'Camiguin, Benoni Experimental Station' }] }));
vi.mock('./state', () => ({
  useSession: () => ({ user: { id: 'user', role: 'manager' } }),
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
  uiScale: { radius: { pill: 999 } },
  useTheme: () => ({ colors: { normal: '#146b35', critical: '#b51c1c' } }),
}));

import { ProfileScreen } from './managementScreens';
import { getProfileAvatarUrl } from './services/client';

type Props = { children?: ReactNode; accessibilityLabel?: string; label?: string; onPress?: () => void; secureTextEntry?: boolean; style?: unknown; options?: Array<{ value: string; label: string }> };
function find(node: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return undefined;
}

beforeEach(() => { state.values = []; state.index = 0; state.queries = []; });

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
