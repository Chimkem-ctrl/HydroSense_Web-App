alter table public.profiles add column chat_enabled boolean not null default true;

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'team')),
  user_a uuid references public.profiles(id) on delete set null,
  user_b uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'team' or user_b is null),
  check (user_a is null or user_b is null or user_a <> user_b)
);
create unique index chat_direct_pair on public.chat_threads (least(user_a, user_b), greatest(user_a, user_b))
  where kind = 'direct' and user_a is not null and user_b is not null;
create unique index chat_team_owner on public.chat_threads (user_a)
  where kind = 'team' and user_a is not null;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id),
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) <= 600 and char_length(btrim(body)) >= 1 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now()
);
create index chat_messages_thread_time on public.chat_messages (thread_id, created_at, id);
create index chat_messages_sender_time on public.chat_messages (sender_id, created_at);

create table public.chat_read_receipts (
  thread_id uuid not null references public.chat_threads(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null,
  primary key (thread_id, user_id)
);

create function public.chat_is_eligible(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and status = 'approved' and active = true
      and role in ('operator', 'manager', 'admin')
  );
$$;

create function public.chat_can_read(p_thread uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user = auth.uid() and public.chat_is_eligible(p_user) and exists (
    select 1 from public.chat_threads t
    join public.profiles actor on actor.id = p_user
    where t.id = p_thread and (
      (t.kind = 'team' and (t.user_a = p_user or actor.role = 'admin')
        and (t.user_a is null or public.chat_is_eligible(t.user_a)))
      or
      (t.kind = 'direct' and actor.role <> 'admin' and p_user in (t.user_a, t.user_b)
        and (t.user_a is null or public.chat_is_eligible(t.user_a))
        and (t.user_b is null or public.chat_is_eligible(t.user_b)))
    )
  );
$$;

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_read_receipts enable row level security;
revoke all on public.chat_threads, public.chat_messages, public.chat_read_receipts from public, anon, authenticated;
grant select on public.chat_threads, public.chat_messages to authenticated;
create policy chat_threads_read on public.chat_threads for select to authenticated
  using (public.chat_can_read(id, auth.uid()));
create policy chat_messages_read on public.chat_messages for select to authenticated
  using (public.chat_can_read(thread_id, auth.uid()));

create function public.chat_create_team_thread() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and new.active = true and new.role in ('operator', 'manager', 'admin') then
    insert into public.chat_threads (kind, user_a) values ('team', new.id)
    on conflict (user_a) where kind = 'team' and user_a is not null do nothing;
  end if;
  return new;
end;
$$;
create trigger chat_create_team_thread after insert or update of status, active, role on public.profiles
  for each row execute function public.chat_create_team_thread();
insert into public.chat_threads (kind, user_a)
select 'team', id from public.profiles
where status = 'approved' and active = true and role in ('operator', 'manager', 'admin');

create function public.chat_contacts() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.chat_is_eligible(auth.uid()) then
    raise exception 'An approved account is required.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', trim(concat_ws(' ', p.first_name, p.last_name)), 'role', p.role
    ) order by p.first_name, p.last_name, p.id)
    from public.profiles p
    where p.id <> auth.uid() and public.chat_is_eligible(p.id)
  ), '[]'::jsonb);
end;
$$;

create function public.chat_list_threads() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.chat_is_eligible(auth.uid()) then
    raise exception 'An approved account is required.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'ownerId', t.user_a,
      'name', case
        when t.kind = 'team' and actor.role <> 'admin' then 'HydroSense Team'
        when t.kind = 'team' then coalesce(nullif(trim(concat_ws(' ', owner.first_name, owner.last_name)), ''), 'Deleted user')
        else coalesce(nullif(trim(concat_ws(' ', peer.first_name, peer.last_name)), ''), 'Deleted user')
      end,
      'lastMessage', last_message.body, 'lastMessageAt', last_message.created_at,
      'createdAt', t.created_at,
      'unreadCount', (select count(*) from public.chat_messages m
        where m.thread_id = t.id and m.sender_id is distinct from auth.uid()
          and m.created_at > coalesce(receipt.read_at, '-infinity'::timestamptz)),
      'chatEnabled', actor.chat_enabled
    ) order by coalesce(last_message.created_at, t.created_at) desc, t.id)
    from public.chat_threads t
    join public.profiles actor on actor.id = auth.uid()
    left join public.profiles owner on owner.id = t.user_a
    left join public.profiles peer on peer.id = case when t.user_a = auth.uid() then t.user_b else t.user_a end
    left join public.chat_read_receipts receipt on receipt.thread_id = t.id and receipt.user_id = auth.uid()
    left join lateral (select body, created_at from public.chat_messages m
      where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1) last_message on true
    where public.chat_can_read(t.id, auth.uid())
  ), '[]'::jsonb);
end;
$$;

create function public.chat_open_direct(p_user uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare result uuid;
begin
  if not public.chat_is_eligible(auth.uid()) or not public.chat_is_eligible(p_user) or p_user = auth.uid()
     or exists (select 1 from public.profiles where id in (auth.uid(), p_user) and role = 'admin') then
    raise exception 'Contact is not available.' using errcode = '42501';
  end if;
  insert into public.chat_threads (kind, user_a, user_b)
  values ('direct', least(auth.uid(), p_user), greatest(auth.uid(), p_user))
  on conflict (least(user_a, user_b), greatest(user_a, user_b))
    where kind = 'direct' and user_a is not null and user_b is not null
  do update set kind = excluded.kind returning id into result;
  return result;
end;
$$;

create function public.chat_list_messages(p_thread uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.chat_can_read(p_thread, auth.uid()) then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'senderId', m.sender_id,
      'senderName', coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Deleted user'),
      'body', m.body, 'createdAt', m.created_at
    ) order by m.created_at, m.id)
    from public.chat_messages m left join public.profiles p on p.id = m.sender_id
    where m.thread_id = p_thread
  ), '[]'::jsonb);
end;
$$;

create function public.chat_send_message(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t public.chat_threads%rowtype; sender public.profiles%rowtype; result uuid; recipient uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  if not public.chat_can_read(p_thread, auth.uid()) then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  select * into t from public.chat_threads where id = p_thread;
  select id into recipient from public.profiles
    where t.kind = 'team' and t.user_a = auth.uid() and role = 'admin' and status = 'approved' and active = true
    order by id limit 1;
  perform id from public.profiles
    where id in (auth.uid(), t.user_a, t.user_b, recipient)
    order by id for share;
  select * into sender from public.profiles where id = auth.uid();
  if not public.chat_is_eligible(auth.uid()) or not coalesce(sender.chat_enabled, false) then
    raise exception 'Chat sending is disabled or your account is not eligible.' using errcode = '42501';
  end if;
  if p_body is null or char_length(p_body) > 600 or char_length(btrim(p_body)) < 1 or p_body !~ '[^[:space:]]' then
    raise exception 'Messages must contain between 1 and 600 characters.' using errcode = '22023';
  end if;
  if not public.chat_can_read(p_thread, auth.uid()) then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  select * into t from public.chat_threads where id = p_thread for share;
  if not public.chat_can_read(p_thread, auth.uid()) then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  if (t.kind = 'direct' and (t.user_a is null or t.user_b is null or exists (
       select 1 from public.profiles where id in (t.user_a, t.user_b) and role = 'admin'
     )))
     or (t.kind = 'team' and (t.user_a is null or not public.chat_is_eligible(t.user_a)))
     or (t.kind = 'team' and sender.role <> 'admin' and
       (recipient is null or not public.chat_is_eligible(recipient)
         or not exists (select 1 from public.profiles where id = recipient and role = 'admin'))) then
    raise exception 'The recipient is unavailable.' using errcode = '42501';
  end if;
  if (select count(*) from public.chat_messages where sender_id = auth.uid()
      and created_at > clock_timestamp() - interval '1 minute') >= 20 then
    raise exception 'Message rate limit exceeded. Try again shortly.' using errcode = 'P0001';
  end if;
  insert into public.chat_messages(thread_id, sender_id, body)
    values (p_thread, auth.uid(), btrim(p_body)) returning id into result;
  return result;
end;
$$;

create function public.chat_mark_read(p_thread uuid, p_message uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare seen_at timestamptz;
begin
  if not public.chat_can_read(p_thread, auth.uid()) then
    raise exception 'Conversation not found.' using errcode = '42501';
  end if;
  select created_at into seen_at from public.chat_messages where id = p_message and thread_id = p_thread;
  if not found then raise exception 'Message not found.' using errcode = 'P0002'; end if;
  insert into public.chat_read_receipts (thread_id, user_id, read_at)
  values (p_thread, auth.uid(), seen_at)
  on conflict (thread_id, user_id) do update set read_at = greatest(public.chat_read_receipts.read_at, excluded.read_at);
end;
$$;

create function public.chat_set_enabled(p_user uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not public.chat_is_eligible(auth.uid()) or actor.role <> 'admin' then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'A chat setting is required.' using errcode = '22023'; end if;
  update public.profiles set chat_enabled = p_enabled where id = p_user;
  if not found then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (user_name, action, detail)
  values (coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), actor.email),
    case when p_enabled then 'Chat enabled' else 'Chat disabled' end, p_user::text);
end;
$$;

revoke all on function public.chat_is_eligible(uuid), public.chat_can_read(uuid, uuid),
  public.chat_create_team_thread(), public.chat_contacts(), public.chat_list_threads(),
  public.chat_open_direct(uuid), public.chat_list_messages(uuid), public.chat_send_message(uuid, text),
  public.chat_mark_read(uuid, uuid), public.chat_set_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.chat_can_read(uuid, uuid),
  public.chat_contacts(), public.chat_list_threads(), public.chat_open_direct(uuid),
  public.chat_list_messages(uuid), public.chat_send_message(uuid, text),
  public.chat_mark_read(uuid, uuid), public.chat_set_enabled(uuid, boolean) to authenticated;
