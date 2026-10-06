#!/usr/bin/env node
/**
 * Builds the living style guide and writes it as one self-contained file:
 *
 *   docs/design-system.html             full document, committed, opens locally
 *   dist-design-system/artifact.html    the same page in the shape the claude.ai
 *                                       Artifact tool publishes (no doctype/head)
 *
 *   npm run design-system
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist-design-system");

execFileSync("node", ["scripts/build-tokens.mjs"], { cwd: root, stdio: "inherit" });
execFileSync("npx", ["vite", "build", "--config", "vite.design-system.config.ts", "--logLevel", "warn"], { cwd: root, stdio: "inherit" });

const assets = resolve(out, "assets");
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(resolve(assets, f), "utf8"));
const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(resolve(assets, f), "utf8"));
if (js.length !== 1) throw new Error(`Expected one script chunk, got ${js.length}: ${files.join(", ")}`);

const script = js[0].replace(/<\/script/gi, "<\\/script");
const style = css.join("\n").replace(/<\/style/gi, "<\\/style");
const title = "<title>Stitch Ease Design System</title>";
const body = `<div id="root"></div>\n<script type="module">${script}</script>\n`;

const fragment = `${title}\n<style>${style}</style>\n${body}`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${title}\n<style>${style}</style>\n</head>\n<body>\n${body}</body>\n</html>\n`;

writeFileSync(resolve(out, "artifact.html"), fragment);
mkdirSync(resolve(root, "docs"), { recursive: true });
writeFileSync(resolve(root, "docs/design-system.html"), full);
console.log(`docs/design-system.html (${Math.round(full.length / 1024)} KB) and dist-design-system/artifact.html written.`);
