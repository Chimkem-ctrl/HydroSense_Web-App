import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('expo-secure-store', () => ({}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Pressable: 'button',
  Text: 'span',
  View: 'div',
}));
vi.mock('lucide-react-native', () => ({ Check: 'span', ChevronDown: 'span', MapPin: 'span' }));
vi.mock('../services/client', () => ({ api: {}, setMobileAccessToken: vi.fn() }));
vi.mock('../services/queryClient', () => ({ clearMobileQueryCache: vi.fn() }));
vi.mock('../theme', () => ({
  uiScale: { spacing: { 2: 8, 3: 12 }, radius: { control: 12 }, type: { caption: 12, body: 16 } },
  useTheme: () => ({ colors: { muted: '#444', teal: '#06c', border: '#ccc', selected: '#def', surface: '#fff', ink: '#000' } }),
}));
vi.mock('react-native-paper', async () => {
  const { HatcheryPicker } = await import('./HatcheryPicker');
  return {
    PaperProvider: ({ children }: { children: ReactNode }) => createElement('div', null, children, createElement(HatcheryPicker)),
  };
});

import { AppProviders } from './AppProviders';

it('provides tank selection to content rendered by the paper portal host', () => {
  const html = renderToStaticMarkup(<AppProviders theme={undefined}><span>App</span></AppProviders>);
  expect(html).toContain('HATCHERY FILTER');
  expect(html).toContain('All hatcheries');
});
