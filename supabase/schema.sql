-- Run once in the Supabase SQL editor, then add the two Auth user IDs to members.
begin;
create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  role text not null unique check (role in ('author','recipient'))
);
create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where id = auth.uid());
$$;
create function public.is_author() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where id = auth.uid() and role = 'author');
$$;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  delivery_date date unique, -- NULL = not selected yet; date = published day
  created_at timestamptz not null default now()
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.members(id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.comments(message_id);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) < 4096 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 1 and 256),
  auth text not null check (char_length(auth) between 1 and 256)
);
create table public.push_deliveries (
  message_id uuid references public.messages(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (message_id, subscription_id)
);
-- A second line of defense: reject markup even when someone bypasses the UI sanitizer.
create function public.validate_plain_text() returns trigger language plpgsql set search_path = '' as $$
begin
  new.body := btrim(new.body);
  if new.body ~ '<[^>]*>' then raise exception 'Only plain text is allowed'; end if;
  if tg_table_name = 'messages' then
    new.title := btrim(new.title);
    if new.title ~ '<[^>]*>' then raise exception 'Only plain text is allowed'; end if;
  end if;
  return new;
end;
$$;
create trigger messages_plain_text before insert or update on public.messages for each row execute function public.validate_plain_text();
create trigger comments_plain_text before insert or update on public.comments for each row execute function public.validate_plain_text();
alter table public.members enable row level security;
alter table public.messages enable row level security;
alter table public.comments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.members, public.messages, public.comments, public.push_subscriptions, public.push_deliveries from anon, authenticated;
grant select on public.members to authenticated;
grant select, insert on public.messages, public.comments to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.members, public.messages, public.comments, public.push_subscriptions, public.push_deliveries to service_role;
create policy members_read on public.members for select to authenticated using (public.is_member());
create policy messages_read on public.messages for select to authenticated using (
  public.is_member() and (public.is_author() or delivery_date <= (now() at time zone 'Europe/Prague')::date)
);
create policy messages_write on public.messages for insert to authenticated with check (
  public.is_author() and delivery_date >= (now() at time zone 'Europe/Prague')::date
);
create policy comments_read on public.comments for select to authenticated using (
  public.is_member() and exists (select 1 from public.messages where id = message_id)
);
create policy comments_write on public.comments for insert to authenticated with check (
  public.is_member() and user_id = auth.uid() and exists (select 1 from public.messages where id = message_id)
);
create policy subscriptions_read on public.push_subscriptions for select to authenticated using (public.is_member() and user_id = auth.uid());
create policy subscriptions_insert on public.push_subscriptions for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy subscriptions_update on public.push_subscriptions for update to authenticated using (public.is_member() and user_id = auth.uid()) with check (public.is_member() and user_id = auth.uid());
create policy subscriptions_delete on public.push_subscriptions for delete to authenticated using (public.is_member() and user_id = auth.uid());
revoke all on function public.is_member(), public.is_author() from public;
grant execute on function public.is_member(), public.is_author() to authenticated;
-- One shared selection per Prague calendar day, serialized across job retries.
create or replace function public.pick_daily_message()
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_now timestamp := now() at time zone 'Europe/Prague';
  chosen public.messages%rowtype;
begin
  if extract(hour from local_now) < 9 then return; end if;
  perform pg_advisory_xact_lock(194721, 1);
  select * into chosen from public.messages where delivery_date = local_now::date;
  if found then
    return next chosen;
    return;
  end if;
  select * into chosen from public.messages
    where delivery_date is null order by random() limit 1 for update;
  if not found then return; end if;
  update public.messages set delivery_date = local_now::date
    where id = chosen.id returning * into chosen;
  return next chosen;
end;
$$;
revoke all on function public.pick_daily_message() from public, anon, authenticated;
grant execute on function public.pick_daily_message() to service_role;
commit;
-- After creating two Auth users, run with their actual UUIDs:
-- insert into public.members (id, name, role) values
-- ('AUTHOR-UUID', 'Já', 'author'), ('RECIPIENT-UUID', 'Oliver', 'recipient');

-- Private-link access and Firebase notifications (fresh installations).
begin;
-- Keep existing messages, comments and Auth tables; disable their direct client access.
revoke all on public.members, public.messages, public.comments, public.push_subscriptions, public.push_deliveries from anon, authenticated;
create table public.link_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  role text not null unique check (role in ('author', 'recipient')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  active boolean not null default true
);
alter table public.link_members enable row level security;
revoke all on public.link_members from anon, authenticated;
grant all on public.link_members to service_role;

alter table public.comments alter column user_id drop not null;
alter table public.comments add column link_user_id uuid references public.link_members(id);
alter table public.comments add constraint comments_one_author check (num_nonnulls(user_id, link_user_id) = 1);
create index on public.comments(link_user_id, created_at);

create table public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.link_members(id) on delete cascade,
  token text not null unique check (length(token) between 20 and 4096),
  updated_at timestamptz not null default now()
);
create table public.fcm_deliveries (
  message_id uuid not null references public.messages(id) on delete cascade,
  token_id uuid not null references public.fcm_tokens(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (message_id, token_id)
);
alter table public.fcm_tokens enable row level security;
alter table public.fcm_deliveries enable row level security;
revoke all on public.fcm_tokens, public.fcm_deliveries from anon, authenticated;
grant all on public.fcm_tokens, public.fcm_deliveries to service_role;

create function public.require_link(p_token text) returns public.link_members
language plpgsql security definer set search_path = '' as $$
declare person public.link_members%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid link' using errcode = '28000';
  end if;
  select * into person from public.link_members
    where active and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then raise exception 'Invalid link' using errcode = '28000'; end if;
  return person;
end;
$$;
revoke all on function public.require_link(text) from public, anon, authenticated;

create function public.read_letter(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare person public.link_members%rowtype; letter public.messages%rowtype;
begin
  person := public.require_link(p_token);
  select * into letter from public.messages
    where delivery_date <= (now() at time zone 'Europe/Prague')::date
    order by delivery_date desc limit 1;
  return jsonb_build_object(
    'member', jsonb_build_object('id', person.id, 'name', person.name, 'role', person.role),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'role', m.role)), '[]'::jsonb) from public.link_members m),
    'messages', case when letter.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(letter)) end,
    'comments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'message_id', c.message_id,
      'user_id', coalesce(c.link_user_id, c.user_id), 'body', c.body, 'created_at', c.created_at) order by c.created_at), '[]'::jsonb)
      from public.comments c where c.message_id = letter.id)
  );
end;
$$;

create function public.add_letter_comment(p_token text, p_message_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare person public.link_members%rowtype;
begin
  person := public.require_link(p_token);
  if p_body is null or length(btrim(p_body)) not between 1 and 280 or p_body ~ '<[^>]*>' then
    raise exception 'Invalid comment';
  end if;
  if not exists (select 1 from public.messages where id = p_message_id and delivery_date <= (now() at time zone 'Europe/Prague')::date) then
    raise exception 'Message unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(person.id::text, 0));
  if (select count(*) from public.comments where link_user_id = person.id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many comments';
  end if;
  insert into public.comments(message_id, user_id, link_user_id, body)
    values (p_message_id, null, person.id, btrim(p_body));
end;
$$;

create function public.save_fcm_token(p_token text, p_fcm_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare person public.link_members%rowtype;
begin
  person := public.require_link(p_token);
  if person.role <> 'recipient' then raise exception 'Recipient only'; end if;
  if p_fcm_token is null or length(p_fcm_token) not between 20 and 4096 then raise exception 'Invalid token'; end if;
  perform pg_advisory_xact_lock(hashtextextended(person.id::text, 0));
  if not exists (select 1 from public.fcm_tokens where token = p_fcm_token)
    and (select count(*) from public.fcm_tokens where member_id = person.id) >= 10 then
    raise exception 'Too many devices; remove old tokens in dashboard';
  end if;
  insert into public.fcm_tokens(member_id, token) values (person.id, p_fcm_token)
    on conflict (token) do update set member_id = excluded.member_id, updated_at = now();
end;
$$;

create function public.remove_fcm_token(p_token text, p_fcm_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare person public.link_members%rowtype;
begin
  person := public.require_link(p_token);
  delete from public.fcm_tokens where member_id = person.id and token = p_fcm_token;
end;
$$;

revoke all on function public.read_letter(text), public.add_letter_comment(text,uuid,text), public.save_fcm_token(text,text), public.remove_fcm_token(text,text) from public;
grant execute on function public.read_letter(text), public.add_letter_comment(text,uuid,text), public.save_fcm_token(text,text), public.remove_fcm_token(text,text) to anon;

-- Manual test can bypass the time window, but cannot choose another message today.
drop function public.pick_daily_message();
create function public.pick_daily_message(p_force boolean default false)
returns setof public.messages language plpgsql security definer set search_path = '' as $$
declare local_now timestamp := now() at time zone 'Europe/Prague'; chosen public.messages%rowtype;
begin
  if not p_force and extract(hour from local_now) < 9 then return; end if;
  perform pg_advisory_xact_lock(194721, 1);
  select * into chosen from public.messages where delivery_date = local_now::date;
  if found then return next chosen; return; end if;
  select * into chosen from public.messages where delivery_date is null order by random() limit 1 for update;
  if not found then return; end if;
  update public.messages set delivery_date = local_now::date where id = chosen.id returning * into chosen;
  return next chosen;
end;
$$;
revoke all on function public.pick_daily_message(boolean) from public, anon, authenticated;
grant execute on function public.pick_daily_message(boolean) to service_role;
commit;
