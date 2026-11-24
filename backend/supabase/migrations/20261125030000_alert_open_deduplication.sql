drop index if exists public.alerts_one_active_per_tank_parameter_idx;
create unique index if not exists alerts_one_open_per_tank_parameter_idx
  on public.alerts (tank_id, parameter)
  where status = 'open';
