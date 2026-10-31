-- Write-based keep-alive. A read alone may not count as project activity, so
-- the scheduled workflow (.github/workflows/supabase-keepalive.yml) calls this
-- function, which updates a timestamp on the one-row public.keepalive table.
-- Callable with the public key by design; it can only touch that timestamp.
alter table public.keepalive add column if not exists last_ping timestamptz;

create or replace function public.keepalive_touch()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into public.keepalive (id, last_ping)
  values (1, pg_catalog.now())
  on conflict (id) do update
  set last_ping = pg_catalog.now()
  returning last_ping;
$$;

revoke all on function public.keepalive_touch() from public;
grant execute on function public.keepalive_touch() to anon, authenticated;
