create or replace function public.current_profile_role()
returns public.hydrosense_role language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and status = 'approved'
$$;

drop policy if exists "admins and managers can read profiles" on public.profiles;
drop policy if exists "admins can read profiles" on public.profiles;
create policy "admins can read profiles"
  on public.profiles for select
  to authenticated
  using (public.current_profile_role() = 'admin');

drop policy if exists "admins can update profiles" on public.profiles;
revoke update on public.profiles from public, anon, authenticated;
