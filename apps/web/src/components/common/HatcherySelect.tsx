import { useSelectedTank } from '../../app/tank/TankContext';
import { MapPin } from 'lucide-react';
import { Select } from './Select';

export function HatcherySelect() {
  const { hatchery, setHatchery, locations } = useSelectedTank();
  return <Select className="header-hatchery-select" leadingIcon={<MapPin size={16} aria-hidden="true" />} aria-label="Hatchery" value={hatchery} onChange={(event) => setHatchery(event.target.value)}>
      <option value="all">All hatcheries</option>
      {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
    </Select>;
}
