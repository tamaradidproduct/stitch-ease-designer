import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["http://localhost:5173", "https://designer.stitch-ease.com", "https://staging.designer.stitch-ease.com"]);
function cors(request: Request) { const origin = request.headers.get("origin") ?? ""; return { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://designer.stitch-ease.com", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }; }
function json(request: Request, body: unknown, status = 200) { return Response.json(body, { status, headers: cors(request) }); }
function environmentKey(name: string) { const value = Deno.env.get(name); if (!value) throw new Error(`${name} is not configured`); return value; }
function platformKey(legacyName: string, currentName: string) { return Deno.env.get(legacyName) ?? Deno.env.get(currentName) ?? environmentKey(legacyName); }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json(request, { error: "Sign in before creating an issue" }, 401);
    const supabaseUrl = environmentKey("SUPABASE_URL");
    const publishableKey = platformKey("SUPABASE_ANON_KEY", "SB_PUBLISHABLE_KEY");
    const secretKey = platformKey("SUPABASE_SERVICE_ROLE_KEY", "SB_SECRET_KEY");
    const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user || user.app_metadata.role !== "admin") return json(request, { error: "QA admin access is required" }, 403);
    const { action = "create", test_result_id, body } = await request.json();
    if (typeof test_result_id !== "string" || !test_result_id) return json(request, { error: "test_result_id is required" }, 400);
    const admin = createClient(supabaseUrl, secretKey);
    const { data: result, error: resultError } = await admin.from("qa_test_results").select("id,status,github_issue_number,github_issue_url,test_case:qa_test_cases(id,title,component),test_run:qa_test_runs(name,staging_url)").eq("id", test_result_id).single();
    if (resultError || !result) return json(request, { error: "Test result was not found" }, 404);
    if (action === "comment") {
      if (!result.github_issue_number || typeof body !== "string" || !body.trim()) return json(request, { error: "An existing issue and comment are required" }, 422);
      const commentResponse = await fetch(`https://api.github.com/repos/tamaradidproduct/stitch-ease-designer/issues/${result.github_issue_number}/comments`, { method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${environmentKey("GITHUB_ISSUES_TOKEN")}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" }, body: JSON.stringify({ body: `QA dashboard comment:\n\n${body.trim()}` }) });
      if (!commentResponse.ok) return json(request, { error: `GitHub comment sync failed: ${await commentResponse.text()}` }, 502);
      return json(request, { ok: true });
    }
    if (result.github_issue_url) return json(request, { number: result.github_issue_number, url: result.github_issue_url });
    if (result.status !== "failed" && result.status !== "blocked") return json(request, { error: "Only failed or blocked tests can become issues" }, 422);
    const { data: comments } = await admin.from("qa_result_comments").select("body,created_at").eq("test_result_id", test_result_id).order("created_at");
    const testCase = result.test_case as unknown as { id: string; title: string; component: string };
    const run = result.test_run as unknown as { name: string; staging_url: string | null };
    const commentText = comments?.length ? `\n\nTester comments:\n${comments.map((comment) => `- ${comment.body}`).join("\n")}` : "";
    const issueResponse = await fetch("https://api.github.com/repos/tamaradidproduct/stitch-ease-designer/issues", { method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${environmentKey("GITHUB_ISSUES_TOKEN")}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" }, body: JSON.stringify({ title: `[QA] ${testCase.id}: ${testCase.title}`, body: `Created from the QA test management dashboard.\n\n- Result: ${result.status}\n- Component: ${testCase.component}\n- Test run: ${run.name}\n- Staging URL: ${run.staging_url ?? "Not recorded"}${commentText}` }) });
    if (!issueResponse.ok) return json(request, { error: `GitHub issue creation failed: ${await issueResponse.text()}` }, 502);
    const issue = await issueResponse.json();
    const { error: updateError } = await admin.from("qa_test_results").update({ github_issue_number: issue.number, github_issue_url: issue.html_url }).eq("id", test_result_id);
    if (updateError) throw updateError;
    return json(request, { number: issue.number, url: issue.html_url }, 201);
  } catch (error) { console.error(error); return json(request, { error: error instanceof Error ? error.message : "Could not create GitHub issue" }, 500); }
});
