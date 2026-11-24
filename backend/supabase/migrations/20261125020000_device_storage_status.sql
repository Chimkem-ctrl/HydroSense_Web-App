alter table public.device_statuses
  add column if not exists storage_available boolean;
