import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
}));
vi.mock('react-native', () => ({
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ height: 600 }),
}));
vi.mock('react-native-paper', () => ({ Dialog: { Title: 'Title', Content: 'Content', Actions: 'Actions' } }));
vi.mock('lucide-react-native', () => ({ Check: 'Check', ClipboardList: 'ClipboardList', MapPin: 'MapPin', Search: 'Search', UserRound: 'UserRound', Users: 'Users', X: 'X' }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { site: 'camiguin-benoni', email: 'user@example.test' } }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({}),
}));
vi.mock('./components/ui', () => ({ Button: 'Button', Card: 'Card', GlassDialog: 'GlassDialog', Page: 'Page', StateMessage: 'StateMessage', Title: 'Title' }));
vi.mock('./components/ProfileControls', () => ({ AlertPreferenceControls: 'AlertPreferenceControls', DeviceMaintenanceControls: 'DeviceMaintenanceControls' }));
vi.mock('./components/AppearanceOptions', () => ({ AppearanceOptions: 'AppearanceOptions' }));
vi.mock('./services/client', () => ({ api: {}, changePassword: vi.fn(), getAccountProfile: vi.fn() }));
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

type Props = { children?: ReactNode; accessibilityLabel?: string; label?: string; onPress?: () => void; style?: unknown };
function find(node: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (predicate(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return undefined;
}

beforeEach(() => { state.values = []; state.index = 0; });

it('lists all tanks in the assigned Benoni hatchery, independent of the active filter', () => {
  const screen = ProfileScreen();
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Tank 1')).toBeDefined();
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Tank 2')).toBeDefined();
  expect(find(screen, (element) => element.props.accessibilityLabel === 'Sagay tank')).toBeUndefined();
});

it('places both password actions inside the height-limited scroll area', () => {
  const screen = ProfileScreen();
  const row = find(screen, (element) => typeof element.type === 'function' && element.type.name === 'ChangePasswordRow');
  expect(row).toBeDefined();
  state.index = 0;
  const content = (row!.type as (props: Props) => ReactNode)(row!.props);
  const scroll = find(content, (element) => element.type === 'ScrollView');
  expect(scroll?.props.style).toEqual({ maxHeight: 480 });
  expect(find(scroll, (element) => element.props.label === 'Cancel')).toBeDefined();
  expect(find(scroll, (element) => element.props.label === 'Confirm change')).toBeDefined();
});
