import { describe, expect, it } from "vitest";
import css from "../styles/tokens.css?raw";
import { colorTokens } from "./tokens";

const stylesheets = import.meta.glob<string>("../styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

function cssToken(name: string): string | undefined {
  return css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe("design tokens", () => {
  it.each(Object.entries(colorTokens))("--%s matches tokens.css", (name, value) => {
    expect(cssToken(name)).toBe(value);
  });

  it("declares every custom property the stylesheets reference", () => {
    const declared = new Set([...css.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    // Set at runtime by PanButton, not a design token.
    declared.add("--tool-dock-center");
    const missing: string[] = [];
    for (const [file, text] of Object.entries(stylesheets)) {
      for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!declared.has(m[1])) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
