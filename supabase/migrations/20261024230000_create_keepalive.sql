-- One-row, public-read table used only by the scheduled keep-alive workflow
-- (.github/workflows/supabase-keepalive.yml). A real SELECT keeps the project
-- counted as active so free-tier Supabase doesn't pause it. Holds no data.
create table if not exists public.keepalive (
  id smallint primary key default 1 check (id = 1)
);

insert into public.keepalive (id) values (1) on conflict do nothing;

alter table public.keepalive enable row level security;

create policy "Anyone can read keepalive" on public.keepalive
  for select to anon, authenticated using (true);
