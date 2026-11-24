create table if not exists public.reports (
  id text primary key,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id) on delete set null,
  report_type text not null,
  tank_ids text[] not null default '{}',
  range_from timestamptz,
  range_to timestamptz,
  check (range_from is null or range_to is null or range_from <= range_to)
);

create index if not exists reports_generated_at_idx
  on public.reports (generated_at desc);

alter table public.reports enable row level security;

revoke all on public.reports from public, anon, authenticated;
grant select, insert on public.reports to authenticated;

drop policy if exists "report exporters can insert reports" on public.reports;
create policy "report exporters can insert reports"
  on public.reports for insert
  to authenticated
  with check (
    public.current_profile_role() in ('operator', 'manager', 'admin')
    and generated_by = auth.uid()
  );

drop policy if exists "admins and managers can read reports" on public.reports;
create policy "admins and managers can read reports"
  on public.reports for select
  to authenticated
  using (public.current_profile_role() in ('manager', 'admin'));
