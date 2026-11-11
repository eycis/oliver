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
  category text not null check (category in ('Jen tak z lásky','Pro úsměv','Naše maličkosti')),
  delivery_date date not null unique,
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
commit;
-- After creating two Auth users, run with their actual UUIDs:
-- insert into public.members (id, name, role) values
-- ('AUTHOR-UUID', 'Já', 'author'), ('RECIPIENT-UUID', 'Oliver', 'recipient');
