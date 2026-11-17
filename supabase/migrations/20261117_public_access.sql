begin;
-- Preserve all imported messages, comments and registered devices.
alter table public.comments drop constraint if exists comments_one_author;
alter table public.comments add constraint comments_one_author check (num_nonnulls(user_id, link_user_id) <= 1);
alter table public.fcm_tokens alter column member_id drop not null;

create or replace function public.read_public_letter() returns jsonb
language sql security definer set search_path = '' as $$
  with letter as (
    select * from public.messages
    where delivery_date <= (now() at time zone 'Europe/Prague')::date
    order by delivery_date desc limit 1
  )
  select jsonb_build_object(
    'messages', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from letter l),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'message_id', c.message_id, 'user_id', null,
      'body', c.body, 'created_at', c.created_at) order by c.created_at), '[]'::jsonb)
      from public.comments c where c.message_id = (select id from letter))
  );
$$;

create or replace function public.add_public_comment(p_message_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 280 or p_body ~ '<[^>]*>' then
    raise exception 'Invalid comment';
  end if;
  if p_message_id is distinct from (
    select id from public.messages
    where delivery_date <= (now() at time zone 'Europe/Prague')::date
    order by delivery_date desc limit 1
  ) or p_message_id is null then
    raise exception 'Message unavailable';
  end if;
  -- Shared limit needs no browser identity or cookies.
  perform pg_advisory_xact_lock(194721, 2);
  if (select count(*) from public.comments where created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many comments';
  end if;
  insert into public.comments(message_id, body) values (p_message_id, btrim(p_body));
end;
$$;

create or replace function public.save_public_fcm_token(p_fcm_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_fcm_token is null or length(p_fcm_token) not between 20 and 4096 then
    raise exception 'Invalid token';
  end if;
  perform pg_advisory_xact_lock(194721, 3);
  if not exists (select 1 from public.fcm_tokens where token = p_fcm_token)
    and (select count(*) from public.fcm_tokens) >= 100 then
    raise exception 'Too many devices';
  end if;
  insert into public.fcm_tokens(token) values (p_fcm_token)
    on conflict (token) do update set updated_at = now();
end;
$$;
create or replace function public.remove_public_fcm_token(p_fcm_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.fcm_tokens where token = p_fcm_token;
$$;
revoke all on function public.read_public_letter(), public.add_public_comment(uuid,text),
  public.save_public_fcm_token(text), public.remove_public_fcm_token(text) from public;
grant execute on function public.read_public_letter(), public.add_public_comment(uuid,text),
  public.save_public_fcm_token(text), public.remove_public_fcm_token(text) to anon;
-- Direct table access stays forbidden, including future messages and device tokens.
commit;
