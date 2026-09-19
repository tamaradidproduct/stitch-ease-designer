import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = "manual-tests";
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
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${path}: expected YAML frontmatter`);
  const values = {};
  let activeList = null;
  for (const rawLine of match[1].split("\n")) {
    const listItem = rawLine.match(/^\s+-\s+(.+)$/);
    if (listItem && activeList) {
      values[activeList].push(listItem[1].trim());
      continue;
    }
    const property = rawLine.match(/^([a-z_]+):\s*(.*)$/i);
    if (!property) continue;
    const [, key, value] = property;
    activeList = value === "" ? key : null;
    values[key] = value === "" ? [] : value.trim();
  }
  for (const key of ["id", "title", "priority", "component"]) {
    if (!values[key] || Array.isArray(values[key])) throw new Error(`${path}: missing ${key}`);
  }
  if (!/^TC-[A-Z0-9-]+$/.test(values.id)) throw new Error(`${path}: invalid test id ${values.id}`);
  return values;
}

const cases = await Promise.all((await markdownFiles(root)).map(async (path) => {
  const manual_markdown = await readFile(path, "utf8");
  const meta = frontmatter(manual_markdown, path);
  return {
    id: meta.id,
    title: meta.title,
    priority: meta.priority,
    component: meta.component,
    platforms: Array.isArray(meta.platforms) ? meta.platforms : [],
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    source_path: relative(".", path),
    manual_markdown,
    active: true,
    synced_at: new Date().toISOString(),
  };
}));

const response = await fetch(`${baseUrl}/rest/v1/qa_test_cases?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(cases),
});

if (!response.ok) throw new Error(`Test case sync failed: ${await response.text()}`);
console.log(`Synced ${cases.length} manual test case(s).`);
