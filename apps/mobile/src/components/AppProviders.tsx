import type { ComponentProps, PropsWithChildren } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SessionProvider, TankProvider } from '../state';

export function AppProviders({ children, theme }: PropsWithChildren<{ theme: ComponentProps<typeof PaperProvider>['theme'] }>) {
  return <SessionProvider>
    <TankProvider>
      <PaperProvider theme={theme}><>{children}</></PaperProvider>
    </TankProvider>
  </SessionProvider>;
}
