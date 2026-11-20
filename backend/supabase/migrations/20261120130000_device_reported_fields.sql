alter table public.device_statuses
  add column reported_fields text[] not null default '{}';
