alter table public.profiles drop constraint if exists no_admin_request;

update public.profiles as profile
set requested_role = (auth_user.raw_user_meta_data->>'requestedRole')::public.hydrosense_role
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.status = 'pending'
  and profile.requested_role is null
  and auth_user.raw_user_meta_data->>'requestedRole' in ('operator', 'manager', 'admin');
