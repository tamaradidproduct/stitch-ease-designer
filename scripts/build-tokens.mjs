#!/usr/bin/env node
/**
 * Generates src/styles/tokens.css and src/design/tokens.generated.ts from
 * src/design/tokens.json, the single source of truth for design tokens.
 *
 *   npm run tokens          write both files
 *   npm run tokens -- --check   exit 1 if either file is out of date
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = resolve(root, "src/design/tokens.json");
export const CSS_OUT = resolve(root, "src/styles/tokens.css");
export const TS_OUT = resolve(root, "src/design/tokens.generated.ts");

const HEADER = "GENERATED from src/design/tokens.json by scripts/build-tokens.mjs - do not edit by hand.";

/** `"{text}"` -> `"text"`: a token whose value is another token's name in braces is an alias of it. */
export function aliasOf(value) {
  return /^\{([a-z0-9-]+)\}$/.exec(value.trim())?.[1] ?? null;
}

/** Follows aliases to a literal value, rejecting unknown targets and cycles. */
export function resolveToken(name, byName, seen = []) {
  if (seen.includes(name)) throw new Error(`Alias cycle: ${[...seen, name].join(" -> ")}`);
  const row = byName.get(name);
  if (!row) throw new Error(`"${seen.at(-1)}" refers to unknown token "${name}"`);
  const target = aliasOf(row.value);
  return target ? resolveToken(target, byName, [...seen, name]) : row.value;
}

/** Flattens the grouped source into [name, value, group] rows, in order. */
export function flatten(source) {
  const rows = [];
  const seen = new Set();
  for (const group of source.groups) {
    for (const [name, token] of Object.entries(group.tokens)) {
      if (seen.has(name)) throw new Error(`Duplicate token "${name}"`);
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Token name "${name}" must be kebab-case`);
      if (typeof token.value !== "string" || !token.value.trim()) throw new Error(`Token "${name}" has no value`);
      if (!aliasOf(token.value) && /[;{}]/.test(token.value)) throw new Error(`Token "${name}" value contains ; { or }`);
      seen.add(name);
      rows.push({ name, value: token.value, description: token.description ?? "", group });
    }
  }
  const byName = new Map(rows.map((r) => [r.name, r]));
  for (const row of rows) row.resolved = resolveToken(row.name, byName);
  return rows;
}

export function renderCss(source) {
  const lines = [`/* ${HEADER} */`, ":root {"];
  let group = null;
  for (const row of flatten(source)) {
    if (row.group !== group) {
      group = row.group;
      if (lines.length > 2) lines.push("");
      lines.push(`  /* ---- ${group.label} ${"-".repeat(Math.max(4, 66 - group.label.length))} */`);
    }
    const comment = row.description ? ` /* ${row.description.replace(/\*\//g, "* /")} */` : "";
    const target = aliasOf(row.value);
    lines.push(`  --${row.name}: ${target ? `var(--${target})` : row.value};${comment}`);
  }
  lines.push("", "  font-family: var(--font-sans);", "  font-size: var(--font-size-md);", "  color: var(--text);", "}", "");
  return lines.join("\n");
}

export function renderTs(source) {
  const rows = flatten(source);
  const body = rows.map((r) => `  ${JSON.stringify(r.name)}: ${JSON.stringify(r.resolved)},`).join("\n");
  return `// ${HEADER}\n\n/** Every design token's value, keyed by its CSS custom property name without the leading \`--\`. */\nexport const tokens = {\n${body}\n} as const;\n\nexport type TokenName = keyof typeof tokens;\n`;
}

export function build({ check = false } = {}) {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const outputs = [
    [CSS_OUT, renderCss(source)],
    [TS_OUT, renderTs(source)],
  ];
  const stale = [];
  for (const [path, text] of outputs) {
    let current = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      // missing counts as stale
    }
    if (current === text) continue;
    stale.push(path);
    if (!check) writeFileSync(path, text);
  }
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const stale = build({ check });
  if (check && stale.length) {
    console.error(`Out of date (run npm run tokens):\n${stale.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(stale.length ? `Wrote ${stale.length} file(s).` : "Tokens up to date.");
}
