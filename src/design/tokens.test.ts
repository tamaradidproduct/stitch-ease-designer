import { describe, expect, it } from "vitest";
import css from "../styles/tokens.css?raw";
import { alpha, tokens } from "./tokens";

const stylesheets = import.meta.glob<string>("../styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("design tokens", () => {
  it("exposes the same values to TypeScript as to CSS", () => {
    for (const [name, value] of Object.entries(tokens)) {
      expect(css).toContain(`--${name}: ${value};`);
    }
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

  it("converts hex tokens to rgba for canvas fills", () => {
    expect(alpha("#0284c7", 0.14)).toBe("rgba(2, 132, 199, 0.14)");
    expect(alpha("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(() => alpha("rgb(1 2 3)", 1)).toThrow();
  });
});
