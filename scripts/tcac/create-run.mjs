const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const name = process.env.QA_RUN_NAME;
const stagingUrl = process.env.STAGING_URL || null;
const buildSha = process.env.GITHUB_SHA || null;

if (!baseUrl || !serviceKey || !name) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and QA_RUN_NAME are required");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};
const request = async (path, body, method = "POST") => {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { method, headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
};

const testCasesResponse = await fetch(`${baseUrl}/rest/v1/qa_test_cases?active=eq.true&select=id,platforms`, { headers });
if (!testCasesResponse.ok) throw new Error(`Could not load synced cases: ${await testCasesResponse.text()}`);
const testCases = await testCasesResponse.json();
const [run] = await request("qa_test_runs", { name, environment: "staging", build_sha: buildSha, staging_url: stagingUrl, status: "active" });
const groups = await request("qa_test_run_groups", [
  { test_run_id: run.id, name: "Staging / Desktop", platform: "desktop", sort_order: 1 },
  { test_run_id: run.id, name: "Staging / iPad", platform: "ipad", sort_order: 2 },
]);
const results = groups.flatMap((group) => testCases
  .filter((testCase) => testCase.platforms.includes(group.platform))
  .map((testCase) => ({ test_run_id: run.id, test_run_group_id: group.id, test_case_id: testCase.id })));
if (results.length) await request("qa_test_results", results);

console.log(`test_run_id=${run.id}`);
console.log(`test_run_url=${stagingUrl ?? ""}`);
