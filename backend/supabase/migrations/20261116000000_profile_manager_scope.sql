create or replace function public.current_profile_site()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select site from public.profiles
  where id = auth.uid() and status = 'approved'
$$;

drop policy if exists "admins and managers can read profiles" on public.profiles;
create policy "admins and managers can read profiles"
  on public.profiles for select
  to authenticated
  using (
    public.current_profile_role() = 'admin'
    or (
      public.current_profile_role() = 'manager'
      and nullif(trim(public.current_profile_site()), '') is not null
      and site = public.current_profile_site()
      and status = 'approved'
      and role in ('operator', 'manager')
    )
  );
