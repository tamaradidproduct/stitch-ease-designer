import { describe, expect, it } from "vitest";
import css from "../styles/tokens.css?raw";
import { alpha, tokens } from "./tokens";

const stylesheets = import.meta.glob<string>("../styles/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("design tokens", () => {
  it("exposes the same values to TypeScript as to CSS, aliases resolved", () => {
    const declared = new Map([...css.matchAll(/--([a-z0-9-]+): ([^;]+);/g)].map((m) => [m[1]!, m[2]!]));
    const resolveCss = (name: string): string | undefined => {
      const value = declared.get(name);
      const alias = value?.match(/^var\(--([a-z0-9-]+)\)$/)?.[1];
      return alias ? resolveCss(alias) : value;
    };
    for (const [name, value] of Object.entries(tokens)) {
      expect(resolveCss(name), name).toBe(value);
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

  it("keeps raw colors and off-token sizes out of component stylesheets", () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(stylesheets)) {
      if (file.endsWith("/tokens.css")) continue;
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const line of code.split("\n")) {
        const decl = line.match(/^\s*([a-z-]+):\s*(.+);/);
        if (!decl) continue;
        const prop = decl[1]!;
        const value = decl[2]!;
        // The trace-colors button paints a literal hue wheel on purpose.
        if (/conic-gradient/.test(value)) continue;
        if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(value)) offenders.push(`${file}: ${line.trim()}`);
        if (/^(gap|row-gap|column-gap|padding(-[a-z]+)?|margin(-[a-z]+)?|border-radius|font-size|font)$/.test(prop) && /(^|[\s(/])\d*\.?\d+px/.test(value)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
        if (/^(line-height|letter-spacing)$/.test(prop) && /^-?\d/.test(value)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps hover styles behind @media (hover: hover) so they don't stick on touch", () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(stylesheets)) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
      const stack: string[] = [];
      let start = 0;
      for (let i = 0; i < code.length; i++) {
        if (code[i] === "{") {
          const head = code.slice(start, i).trim();
          if (head.includes(":hover") && !head.startsWith("@") && !stack.some((h) => /@media[^{]*hover:\s*hover/.test(h))) {
            offenders.push(`${file}: ${head.split("\n").join(" ")}`);
          }
          stack.push(head);
          start = i + 1;
        } else if (code[i] === "}") {
          stack.pop();
          start = i + 1;
        } else if (code[i] === ";") {
          start = i + 1;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses one disabled style everywhere", () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(stylesheets)) {
      for (const m of text.matchAll(/([^{}]*:disabled[^{}]*)\{([^{}]*)\}/g)) {
        if (/opacity:\s*0?\.\d/.test(m[2]!)) offenders.push(`${file}: ${m[1]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("converts hex tokens to rgba for canvas fills", () => {
    expect(alpha("#0284c7", 0.14)).toBe("rgba(2, 132, 199, 0.14)");
    expect(alpha("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(() => alpha("rgb(1 2 3)", 1)).toThrow();
  });
});
