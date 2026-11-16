-- Existing dates are preserved. NULL means not selected yet.
begin;
alter table public.messages alter column delivery_date drop not null;

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
