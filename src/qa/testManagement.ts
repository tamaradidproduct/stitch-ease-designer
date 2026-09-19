import { getSupabase } from "../supabase/client";
import type { QaPlatform, QaResultStatus, QaRunGroup, QaTestCase, QaTestResult, QaTestRun } from "./types";

const qa = () => getSupabase();

const unwrap = <T>(result: { data: T | null; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The QA service returned no data");
  return result.data;
};

export async function loadQaDashboard(): Promise<{ cases: QaTestCase[]; runs: QaTestRun[] }> {
  const [cases, runs] = await Promise.all([
    qa().from("qa_test_cases").select("id,title,priority,component,platforms,tags,source_path,active").eq("active", true).order("id"),
    qa().from("qa_test_runs").select("id,name,environment,build_sha,staging_url,status,created_at,approved_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return { cases: unwrap(cases) as QaTestCase[], runs: unwrap(runs) as QaTestRun[] };
}

export async function createQaRun(input: { name: string; buildSha?: string; stagingUrl?: string }, cases: QaTestCase[]): Promise<QaTestRun> {
  const run = unwrap(await qa().from("qa_test_runs").insert({
    name: input.name,
    environment: "staging",
    build_sha: input.buildSha || null,
    staging_url: input.stagingUrl || null,
  }).select("id,name,environment,build_sha,staging_url,status,created_at,approved_at").single()) as QaTestRun;

  const groups = unwrap(await qa().from("qa_test_run_groups").insert([
    { test_run_id: run.id, name: "Staging / Desktop", platform: "desktop", sort_order: 1 },
    { test_run_id: run.id, name: "Staging / iPad", platform: "ipad", sort_order: 2 },
  ]).select("id,test_run_id,name,platform,sort_order")) as QaRunGroup[];

  const results = groups.flatMap((group) => cases
    .filter((testCase) => testCase.platforms.includes(group.platform))
    .map((testCase) => ({ test_run_id: run.id, test_run_group_id: group.id, test_case_id: testCase.id })));
  if (results.length) {
    const { error } = await qa().from("qa_test_results").insert(results);
    if (error) throw new Error(error.message);
  }
  return run;
}

export async function loadQaRun(runId: string): Promise<{ run: QaTestRun; groups: QaRunGroup[]; results: QaTestResult[] }> {
  const [run, groups, results] = await Promise.all([
    qa().from("qa_test_runs").select("id,name,environment,build_sha,staging_url,status,created_at,approved_at").eq("id", runId).single(),
    qa().from("qa_test_run_groups").select("id,test_run_id,name,platform,sort_order").eq("test_run_id", runId).order("sort_order"),
    qa().from("qa_test_results").select("id,test_run_id,test_run_group_id,test_case_id,status,notes,evidence_url,updated_at").eq("test_run_id", runId),
  ]);
  return { run: unwrap(run) as QaTestRun, groups: unwrap(groups) as QaRunGroup[], results: unwrap(results) as QaTestResult[] };
}

export async function updateQaResult(id: string, status: QaResultStatus): Promise<void> {
  const { data: { user }, error } = await qa().auth.getUser();
  if (error || !user) throw new Error(error?.message ?? "You must be signed in to record a result");
  unwrap(await qa().from("qa_test_results").update({ status, executed_at: new Date().toISOString(), executed_by: user.id }).eq("id", id).select("id").single());
}

export async function approveQaRun(runId: string): Promise<void> {
  const { data: { user }, error } = await qa().auth.getUser();
  if (error || !user) throw new Error(error?.message ?? "You must be signed in to approve a run");
  unwrap(await qa().from("qa_test_runs").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.id }).eq("id", runId).select("id").single());
}

export const platformLabel: Record<QaPlatform, string> = { desktop: "Desktop", ipad: "iPad" };
