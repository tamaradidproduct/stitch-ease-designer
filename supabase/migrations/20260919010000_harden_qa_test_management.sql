-- Follow-up for the initial QA migration. Keep this separate because the
-- initial migration may already have been applied to the hosted project.

alter table public.qa_test_cases
  drop constraint if exists qa_test_cases_source_path_key;

create or replace function public.handle_qa_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger handle_qa_test_cases_updated_at
  before update on public.qa_test_cases
  for each row execute function public.handle_qa_updated_at();

create trigger handle_qa_test_runs_updated_at
  before update on public.qa_test_runs
  for each row execute function public.handle_qa_updated_at();

create trigger handle_qa_test_results_updated_at
  before update on public.qa_test_results
  for each row execute function public.handle_qa_updated_at();

drop policy if exists "QA admins can update test results" on public.qa_test_results;
create policy "QA admins can update test results" on public.qa_test_results
  for update to authenticated
  using (
    (select public.is_qa_admin())
    and exists (
      select 1 from public.qa_test_runs
      where id = qa_test_results.test_run_id and status <> 'approved'
    )
  )
  with check (
    (select public.is_qa_admin())
    and exists (
      select 1 from public.qa_test_runs
      where id = qa_test_results.test_run_id and status <> 'approved'
    )
  );
