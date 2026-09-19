import { getSupabase } from "../supabase/client";
import type { QaPlatform, QaRequirement, QaResultAttachment, QaResultComment, QaResultStatus, QaRunGroup, QaTestCase, QaTestCaseRequirement, QaTestResult, QaTestRun } from "./types";

const qa = () => getSupabase();

const unwrap = <T>(result: { data: T | null; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("The QA service returned no data");
  return result.data;
};

export async function loadQaDashboard(): Promise<{ cases: QaTestCase[]; requirements: QaRequirement[]; links: QaTestCaseRequirement[]; runs: QaTestRun[] }> {
  const [cases, requirements, links, runs] = await Promise.all([
    qa().from("qa_test_cases").select("id,title,priority,component,platforms,tags,source_path,active,preconditions,steps,expected_result,modifier_input").eq("active", true).order("id"),
    qa().from("qa_requirements").select("id,feature,requirement_text,active").eq("active", true).order("id"),
    qa().from("qa_test_case_requirements").select("test_case_id,requirement_id"),
    qa().from("qa_test_runs").select("id,name,environment,build_sha,staging_url,status,created_at,approved_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return { cases: unwrap(cases) as QaTestCase[], requirements: unwrap(requirements) as QaRequirement[], links: unwrap(links) as QaTestCaseRequirement[], runs: unwrap(runs) as QaTestRun[] };
}

export async function loadResultFinding(resultId: string): Promise<{ comments: QaResultComment[]; attachments: QaResultAttachment[] }> {
  const [comments, attachments] = await Promise.all([
    qa().from("qa_result_comments").select("id,test_result_id,body,created_at").eq("test_result_id", resultId).order("created_at"),
    qa().from("qa_result_attachments").select("id,test_result_id,storage_path,file_name,mime_type,created_at").eq("test_result_id", resultId).order("created_at"),
  ]);
  return { comments: unwrap(comments) as QaResultComment[], attachments: unwrap(attachments) as QaResultAttachment[] };
}

export async function addResultComment(resultId: string, body: string): Promise<void> {
  unwrap(await qa().from("qa_result_comments").insert({ test_result_id: resultId, body: body.trim() }).select("id").single());
}

export async function addResultAttachment(resultId: string, file: File): Promise<void> {
  const path = `${resultId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await qa().storage.from("qa-evidence").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  unwrap(await qa().from("qa_result_attachments").insert({ test_result_id: resultId, storage_path: path, file_name: file.name, mime_type: file.type || "application/octet-stream" }).select("id").single());
}

export async function getResultAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await qa().storage.from("qa-evidence").createSignedUrl(storagePath, 60 * 10);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open this attachment");
  return data.signedUrl;
}

export async function createQaIssue(resultId: string): Promise<{ number: number; url: string }> {
  const { data, error } = await qa().functions.invoke("create-qa-issue", { body: { test_result_id: resultId } });
  if (error) throw new Error(error.message);
  if (!data?.number || !data?.url) throw new Error("The issue service returned an unexpected response");
  return data as { number: number; url: string };
}

export async function syncQaIssueComment(resultId: string, body: string): Promise<void> {
  const { error } = await qa().functions.invoke("create-qa-issue", { body: { action: "comment", test_result_id: resultId, body } });
  if (error) throw new Error(error.message);
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
    qa().from("qa_test_results").select("id,test_run_id,test_run_group_id,test_case_id,status,notes,evidence_url,github_issue_number,github_issue_url,updated_at").eq("test_run_id", runId),
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
