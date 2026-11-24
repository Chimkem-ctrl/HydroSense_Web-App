import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth/RoleContext';
import { hatcheryId, hatcheryLocations, tankInHatchery } from '@hydrosense/shared';
import type { HatcheryLocation, Tank } from '@hydrosense/shared';
import { useProfileSite } from '../data/hooks';

interface TankSelection {
  tankId: string;
  setTankId: (tankId: string) => void;
  hatchery: string;
  setHatchery: (location: string) => void;
  locations: HatcheryLocation[];
  tanks: Tank[];
}

const TankContext = createContext<TankSelection | null>(null);

export function TankProvider({ children }: { children: ReactNode }) {
  const user = useAuth();
  const site = useProfileSite(Boolean(user?.role && user.role !== 'admin'));
  const { data: allTanks = [] } = useQuery({
    queryKey: ['tanks'],
    queryFn: () => api.listTanks(),
    enabled: Boolean(user?.role),
  });
  const [adminHatchery, setHatchery] = useState('all');
  const hatchery = user?.role === 'admin' ? adminHatchery : site.data?.trim() ? hatcheryId(site.data) : '';
  const tanks = allTanks.filter((tank) => tankInHatchery(tank, hatchery));
  const [selectedId, setSelectedId] = useState('');
  const tankId = tanks.some((tank) => tank.id === selectedId) ? selectedId : tanks[0]?.id ?? '';
  return <TankContext.Provider value={{ tankId, setTankId: setSelectedId, hatchery, setHatchery, locations: hatcheryLocations(allTanks), tanks }}>{children}</TankContext.Provider>;
}

export function useSelectedTank() {
  const value = useContext(TankContext);
  if (!value) throw new Error('useSelectedTank must be used within TankProvider.');
  return value;
}
