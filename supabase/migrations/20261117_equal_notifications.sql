begin;
-- Both private links have identical notification permissions. Existing data and keys stay intact.
create or replace function public.save_fcm_token(p_token text, p_fcm_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare person public.link_members%rowtype;
begin
  person := public.require_link(p_token);
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

revoke all on function public.save_fcm_token(text,text) from public;
grant execute on function public.save_fcm_token(text,text) to anon;
commit;
