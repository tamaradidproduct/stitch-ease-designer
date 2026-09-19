create extension if not exists pgcrypto;

create table public.qa_test_cases (
  id text primary key check (id ~ '^TC-[A-Z0-9-]+$'),
  title text not null,
  priority text not null check (priority in ('P0', 'P1', 'P2', 'P3')),
  component text not null,
  platforms text[] not null default '{}',
  tags text[] not null default '{}',
  source_path text not null unique,
  manual_markdown text not null,
  active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qa_test_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  environment text not null default 'staging',
  build_sha text,
  staging_url text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'passed', 'failed', 'blocked', 'approved')),
  -- CI uses the server-only service key and therefore has no auth.uid().
  -- Human-created runs still receive their owner from the default.
  created_by uuid default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qa_test_run_groups (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references public.qa_test_runs(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('desktop', 'ipad')),
  sort_order integer not null default 0,
  unique (test_run_id, platform)
);

create table public.qa_test_results (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references public.qa_test_runs(id) on delete cascade,
  test_run_group_id uuid not null references public.qa_test_run_groups(id) on delete cascade,
  test_case_id text not null references public.qa_test_cases(id),
  status text not null default 'not_run'
    check (status in ('not_run', 'passed', 'failed', 'blocked', 'skipped')),
  notes text not null default '',
  evidence_url text,
  executed_by uuid references auth.users(id),
  executed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (test_run_group_id, test_case_id)
);

create index qa_test_runs_created_at_idx on public.qa_test_runs (created_at desc);
create index qa_test_results_run_group_idx on public.qa_test_results (test_run_id, test_run_group_id);

-- Authorization is based only on trusted app_metadata. User metadata is
-- deliberately not used because an authenticated user may edit it themselves.
create or replace function public.is_qa_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on public.qa_test_cases, public.qa_test_runs, public.qa_test_run_groups, public.qa_test_results from anon, authenticated;
grant select on public.qa_test_cases to authenticated;
grant select, insert, update, delete on public.qa_test_runs, public.qa_test_run_groups, public.qa_test_results to authenticated;

alter table public.qa_test_cases enable row level security;
alter table public.qa_test_runs enable row level security;
alter table public.qa_test_run_groups enable row level security;
alter table public.qa_test_results enable row level security;

create policy "QA admins can read test cases" on public.qa_test_cases
  for select to authenticated using ((select public.is_qa_admin()));

create policy "QA admins can read test runs" on public.qa_test_runs
  for select to authenticated using ((select public.is_qa_admin()));
create policy "QA admins can create test runs" on public.qa_test_runs
  for insert to authenticated with check ((select public.is_qa_admin()) and created_by = (select auth.uid()));
create policy "QA admins can update test runs" on public.qa_test_runs
  for update to authenticated using ((select public.is_qa_admin())) with check ((select public.is_qa_admin()));
create policy "QA admins can delete test runs" on public.qa_test_runs
  for delete to authenticated using ((select public.is_qa_admin()));

create policy "QA admins can read run groups" on public.qa_test_run_groups
  for select to authenticated using ((select public.is_qa_admin()));
create policy "QA admins can create run groups" on public.qa_test_run_groups
  for insert to authenticated with check ((select public.is_qa_admin()));
create policy "QA admins can update run groups" on public.qa_test_run_groups
  for update to authenticated using ((select public.is_qa_admin())) with check ((select public.is_qa_admin()));
create policy "QA admins can delete run groups" on public.qa_test_run_groups
  for delete to authenticated using ((select public.is_qa_admin()));

create policy "QA admins can read test results" on public.qa_test_results
  for select to authenticated using ((select public.is_qa_admin()));
create policy "QA admins can create test results" on public.qa_test_results
  for insert to authenticated with check ((select public.is_qa_admin()));
create policy "QA admins can update test results" on public.qa_test_results
  for update to authenticated using ((select public.is_qa_admin())) with check ((select public.is_qa_admin()));
create policy "QA admins can delete test results" on public.qa_test_results
  for delete to authenticated using ((select public.is_qa_admin()));
