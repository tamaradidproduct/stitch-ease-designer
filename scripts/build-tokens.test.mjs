import assert from "node:assert/strict";
import test from "node:test";
import { build, flatten, renderCss } from "./build-tokens.mjs";

test("generated token files match src/design/tokens.json", () => {
  assert.deepEqual(build({ check: true }), [], "run `npm run tokens` and commit the result");
});

test("renders each token as a custom property with its description", () => {
  const css = renderCss({
    groups: [{ id: "g", label: "Group", type: "color", tokens: { accent: { value: "#0284c7", description: "Primary" } } }],
  });
  assert.match(css, /--accent: #0284c7; \/\* Primary \*\//);
});

test("rejects duplicate names and values that could break out of the rule", () => {
  const group = (tokens) => ({ groups: [{ id: "g", label: "G", type: "color", tokens }] });
  assert.throws(() => flatten({ groups: [group({ a: { value: "1" } }).groups[0], group({ a: { value: "2" } }).groups[0]] }), /Duplicate/);
  assert.throws(() => flatten(group({ a: { value: "red; } body { display: none" } })), /contains/);
  assert.throws(() => flatten(group({ Bad: { value: "1" } })), /kebab-case/);
});
