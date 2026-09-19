import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "manual-tests";
const requirementsPath = "docs/PRD.md";
const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md" ? [path] : [];
  }));
  return nested.flat();
}

function frontmatter(markdown, path) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${path}: expected YAML frontmatter`);
  const values = {};
  let activeList = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const listItem = rawLine.match(/^\s+-\s+(.+)$/);
    if (listItem && activeList) {
      values[activeList].push(listItem[1].trim());
      continue;
    }
    const property = rawLine.match(/^([a-z_]+):\s*(.*)$/i);
    if (!property) continue;
    const [, key, rawValue] = property;
    const value = rawValue.trim();
    activeList = value === "" ? key : null;
    values[key] = value === "" ? [] : value;
  }
  for (const key of ["id", "title", "priority", "component"]) {
    if (!values[key] || Array.isArray(values[key])) throw new Error(`${path}: missing ${key}`);
  }
  if (!/^TC-[A-Z0-9-]+$/.test(values.id)) throw new Error(`${path}: invalid test id ${values.id}`);
  if (!Array.isArray(values.platforms) || values.platforms.length === 0) {
    throw new Error(`${path}: platforms must be a non-empty list`);
  }
  for (const platform of values.platforms) {
    if (platform !== "desktop" && platform !== "ipad") throw new Error(`${path}: invalid platform ${platform}`);
  }
  return values;
}

function testCaseDetails(markdown) {
  const section = (name) => markdown.match(new RegExp(`^# ${name}\\r?\\n([\\s\\S]*?)(?=^# |$)`, "m"))?.[1].trim() ?? "";
  const tableRows = [...markdown.matchAll(/^\|\s*\d+\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|.*$/gm)];
  return {
    preconditions: section("Preconditions").replace(/^[-*]\s+/gm, "").trim(),
    steps: tableRows.map(([, action]) => action.trim()).join("\n"),
    expected_result: tableRows.map(([, , expected]) => expected.trim()).join("\n"),
  };
}

function requirementsFromPrd(markdown) {
  let feature = "General";
  const requirements = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) { feature = heading[1].trim(); continue; }
    const requirement = line.match(/^\*\*((?:FR|DNT)-\d+)\.\*\*\s*(.*)$/);
    if (requirement) requirements.push({ id: requirement[1], feature, requirement_text: requirement[2].trim(), source_path: requirementsPath, active: true, synced_at: new Date().toISOString() });
  }
  return requirements;
}

const cases = await Promise.all((await markdownFiles(root)).map(async (path) => {
  const manual_markdown = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  const meta = frontmatter(manual_markdown, path);
  const details = testCaseDetails(manual_markdown);
  return {
    id: meta.id,
    title: meta.title,
    priority: meta.priority,
    component: meta.component,
    platforms: Array.isArray(meta.platforms) ? meta.platforms : [],
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    requirement_ids: Array.isArray(meta.requirements) ? meta.requirements : [],
    modifier_input: typeof meta.modifier_input === "string" ? meta.modifier_input : "",
    ...details,
    source_path: relative(".", path),
    manual_markdown,
    active: true,
    synced_at: new Date().toISOString(),
  };
}));

const requirements = requirementsFromPrd(await readFile(requirementsPath, "utf8"));
if (!requirements.length) throw new Error(`No FR/DNT requirements found in ${requirementsPath}`);
const requirementsResponse = await fetch(`${baseUrl}/rest/v1/qa_requirements?on_conflict=id`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(requirements) });
if (!requirementsResponse.ok) throw new Error(`Requirement sync failed: ${await requirementsResponse.text()}`);

const casePayloads = cases.map(({ requirement_ids, ...testCase }) => testCase);
const response = await fetch(`${baseUrl}/rest/v1/qa_test_cases?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(casePayloads),
});

if (!response.ok) throw new Error(`Test case sync failed: ${await response.text()}`);
const links = cases.flatMap((testCase) => testCase.requirement_ids.map((requirement_id) => ({ test_case_id: testCase.id, requirement_id })));
const clearLinks = await fetch(`${baseUrl}/rest/v1/qa_test_case_requirements?test_case_id=not.is.null`, { method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
if (!clearLinks.ok) throw new Error(`Requirement link reset failed: ${await clearLinks.text()}`);
if (links.length) {
  const linksResponse = await fetch(`${baseUrl}/rest/v1/qa_test_case_requirements`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify(links) });
  if (!linksResponse.ok) throw new Error(`Requirement link sync failed: ${await linksResponse.text()}`);
}
const inactiveFilter = cases.length ? `?id=not.in.(${cases.map((testCase) => testCase.id).join(",")})` : "";
const deactivateResponse = await fetch(`${baseUrl}/rest/v1/qa_test_cases${inactiveFilter}`, {
  method: "PATCH",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ active: false }),
});
if (!deactivateResponse.ok) throw new Error(`Test case deactivation failed: ${await deactivateResponse.text()}`);
const inactiveRequirements = `?id=not.in.(${requirements.map((requirement) => requirement.id).join(",")})`;
const deactivateRequirements = await fetch(`${baseUrl}/rest/v1/qa_requirements${inactiveRequirements}`, {
  method: "PATCH",
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ active: false }),
});
if (!deactivateRequirements.ok) throw new Error(`Requirement deactivation failed: ${await deactivateRequirements.text()}`);
console.log(`Synced ${requirements.length} requirement(s) and ${cases.length} manual test case(s).`);
