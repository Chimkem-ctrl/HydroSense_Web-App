alter table public.device_statuses
  alter column battery_pct drop not null,
  alter column power_source set default 'grid',
  alter column wifi_rssi set default 0;
