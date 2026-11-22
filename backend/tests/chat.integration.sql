\set ON_ERROR_STOP on
begin;
create type public.hydrosense_role as enum ('operator', 'manager', 'admin');
create type public.account_status as enum ('pending', 'approved', 'rejected');
create table public.profiles (
  id uuid primary key, first_name text, last_name text, email text,
  role public.hydrosense_role, status public.account_status, active boolean
);
create table public.audit_logs (user_name text, action text, detail text);
\i /tmp/hydrosense-chat-migration.sql

insert into public.profiles (id, first_name, last_name, email, role, status, active) values
('00000000-0000-0000-0000-000000000001', 'Alice', 'User', 'alice@example.test', 'operator', 'approved', true),
('00000000-0000-0000-0000-000000000002', 'Bob', 'User', 'bob@example.test', 'manager', 'approved', true),
('00000000-0000-0000-0000-000000000003', 'Other', 'User', 'other@example.test', 'operator', 'approved', true),
('00000000-0000-0000-0000-000000000004', 'Admin', 'User', 'admin@example.test', 'admin', 'approved', true),
('00000000-0000-0000-0000-000000000005', 'Pending', 'User', 'pending@example.test', 'operator', 'pending', true),
('00000000-0000-0000-0000-000000000006', 'Inactive', 'User', 'inactive@example.test', 'operator', 'approved', false),
('00000000-0000-0000-0000-000000000007', 'Rejected', 'User', 'rejected@example.test', 'operator', 'rejected', true),
('00000000-0000-0000-0000-000000000008', 'Second', 'Admin', 'admin2@example.test', 'admin', 'approved', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
create temporary table test_chat_ids (id uuid);
insert into test_chat_ids select public.chat_open_direct('00000000-0000-0000-0000-000000000002');
create temporary table test_team_ids (id uuid);
insert into test_team_ids select id from public.chat_threads where kind = 'team' and user_a = auth.uid();
do $$
declare thread uuid := (select id from test_chat_ids);
begin
  if jsonb_array_length(public.chat_contacts()) <> 4 then raise exception 'Contact eligibility failed'; end if;
  perform public.chat_send_message(thread, 'hello');
  perform public.chat_send_message(thread, repeat('x', 600));
  perform public.chat_send_message((select id from test_team_ids), 'Need help');
  begin
    insert into public.chat_messages (thread_id, sender_id, body) values (thread, auth.uid(), 'bypass');
    raise exception 'Direct message insert permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.chat_open_direct('00000000-0000-0000-0000-000000000004');
    raise exception 'Direct admin chat permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.chat_open_direct('00000000-0000-0000-0000-000000000006');
    raise exception 'Inactive contact accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.chat_send_message(thread, repeat('x', 601));
    raise exception 'Oversized message accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.chat_send_message(thread, E' \n\t ');
    raise exception 'Whitespace message accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
update public.profiles set active = false where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
declare thread uuid := (select id from test_chat_ids);
begin
  if exists (select 1 from public.chat_threads where id = thread) then
    raise exception 'Thread with inactive recipient is visible';
  end if;
  begin
    perform public.chat_send_message(thread, 'blocked');
    raise exception 'Inactive recipient can receive';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.profiles set active = true where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$
begin
  if exists (select 1 from public.chat_messages) then raise exception 'Other user can read direct messages'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
do $$
begin
  if (select count(*) from public.chat_messages) <> 1 then raise exception 'Admin team access or direct privacy failed'; end if;
  perform public.chat_send_message((select id from test_team_ids), 'We can help');
  perform public.chat_mark_read((select id from test_team_ids),
    (select id from public.chat_messages where body = 'Need help'));
  if (select (entry->>'unreadCount')::int from jsonb_array_elements(public.chat_list_threads()) entry
      where entry->>'id' = (select id::text from test_team_ids)) <> 0 then
    raise exception 'Admin read receipt not recorded';
  end if;
  perform public.chat_set_enabled('00000000-0000-0000-0000-000000000001', false);
  perform public.chat_send_message((select id from test_team_ids), 'You can still receive');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
do $$
begin
  if (select (entry->>'unreadCount')::int from jsonb_array_elements(public.chat_list_threads()) entry
      where entry->>'id' = (select id::text from test_team_ids)) <> 3 then
    raise exception 'Team read receipts must be per admin';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare thread uuid := (select id from test_chat_ids);
begin
  if (select count(*) from public.chat_messages) <> 5 then raise exception 'Disabled user cannot read or receive'; end if;
  begin
    perform public.chat_send_message(thread, 'blocked');
    raise exception 'Disabled user can send';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
do $$
begin
  if exists (select 1 from public.chat_threads) or exists (select 1 from public.chat_messages) then
    raise exception 'Inactive user can read chat';
  end if;
  begin
    perform public.chat_contacts();
    raise exception 'Inactive user can list contacts';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
do $$
begin
  if exists (select 1 from public.chat_threads) or exists (select 1 from public.chat_messages) then
    raise exception 'Pending user can read chat';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
do $$
begin
  if exists (select 1 from public.chat_threads) or exists (select 1 from public.chat_messages) then
    raise exception 'Rejected user can read chat';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
declare team uuid;
begin
  select id into team from public.chat_threads where kind = 'team' and user_a = auth.uid();
  for i in 1..20 loop perform public.chat_send_message(team, 'rate limit test'); end loop;
  begin
    perform public.chat_send_message(team, 'too many');
    raise exception 'Rate limit not enforced';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'Rate limit not enforced' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.audit_logs where action = 'Chat disabled') then
    raise exception 'Chat disable was not audited';
  end if;
end $$;
do $$
declare thread uuid := (select id from test_chat_ids);
begin
  begin
    insert into public.chat_messages (thread_id, body) values (thread, repeat('x', 601));
    raise exception 'Database accepted an oversized message';
  exception when check_violation then null;
  end;
  begin
    insert into public.chat_messages (thread_id, body) values (thread, E' \n\t ');
    raise exception 'Database accepted whitespace';
  exception when check_violation then null;
  end;
end $$;
delete from public.profiles where id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
declare thread uuid := (select id from test_chat_ids);
begin
  if jsonb_array_length(public.chat_list_messages(thread)) <> 2 then raise exception 'Messages lost on deletion'; end if;
  if public.chat_list_messages(thread)->0->>'senderName' <> 'Deleted user' then raise exception 'Deleted sender not labeled'; end if;
end $$;
rollback;
