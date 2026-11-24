-- Resolve existing duplicate active alerts before applying this index; no alert
-- history is modified automatically.
create unique index alerts_one_active_per_tank_parameter_idx
  on public.alerts (tank_id, parameter)
  where status in ('open', 'acknowledged');

create function public.latest_tank_readings()
returns table (
  tank_id uuid,
  "timestamp" timestamptz,
  temperature double precision,
  do_mg_l double precision,
  ph double precision
)
language sql stable security invoker
set search_path = public
as $$
  select distinct on (r.tank_id)
    r.tank_id, r.timestamp, r.temperature, r.do_mg_l, r.ph
  from public.readings r
  order by r.tank_id, r.timestamp desc, r.id desc
$$;

revoke all on function public.latest_tank_readings() from public, anon, authenticated;
grant execute on function public.latest_tank_readings() to service_role;

create view public.api_activity_logs with (security_invoker = true) as
  select id, tank_id::text as tank_id, hatchery_id, kind, type, occurred_at, operator, notes,
    water_change_percent, water_source, impact, manual_readings
  from public.activity_logs;

revoke all on public.api_activity_logs from public, anon, authenticated;
grant select on public.api_activity_logs to service_role;
