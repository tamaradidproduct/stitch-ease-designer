create table public.qa_requirements (
  id text primary key check (id ~ '^(FR|DNT)-[0-9]+$'),
  feature text not null,
  requirement_text text not null,
  source_path text not null,
  active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qa_test_cases
  add column preconditions text not null default '',
  add column steps text not null default '',
  add column expected_result text not null default '',
  add column modifier_input text not null default '';

alter table public.qa_test_results
  add column github_issue_number integer,
  add column github_issue_url text;

create table public.qa_test_case_requirements (
  test_case_id text not null references public.qa_test_cases(id) on delete cascade,
  requirement_id text not null references public.qa_requirements(id),
  primary key (test_case_id, requirement_id)
);

create table public.qa_result_comments (
  id uuid primary key default gen_random_uuid(),
  test_result_id uuid not null references public.qa_test_results(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.qa_result_attachments (
  id uuid primary key default gen_random_uuid(),
  test_result_id uuid not null references public.qa_test_results(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.qa_requirements enable row level security;
alter table public.qa_test_case_requirements enable row level security;
alter table public.qa_result_comments enable row level security;
alter table public.qa_result_attachments enable row level security;

grant select on public.qa_requirements, public.qa_test_case_requirements to authenticated;
grant select, insert, update, delete on public.qa_result_comments, public.qa_result_attachments to authenticated;

create policy "QA admins can read requirements" on public.qa_requirements for select to authenticated using ((select public.is_qa_admin()));
create policy "QA admins can read test case requirements" on public.qa_test_case_requirements for select to authenticated using ((select public.is_qa_admin()));
create policy "QA admins can manage result comments" on public.qa_result_comments for all to authenticated using ((select public.is_qa_admin())) with check ((select public.is_qa_admin()));
create policy "QA admins can manage result attachments" on public.qa_result_attachments for all to authenticated using ((select public.is_qa_admin())) with check ((select public.is_qa_admin()));

create trigger handle_qa_requirements_updated_at before update on public.qa_requirements for each row execute function public.handle_qa_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-evidence', 'qa-evidence', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "QA admins can manage evidence" on storage.objects for all to authenticated
using (bucket_id = 'qa-evidence' and (select public.is_qa_admin()))
with check (bucket_id = 'qa-evidence' and (select public.is_qa_admin()));
