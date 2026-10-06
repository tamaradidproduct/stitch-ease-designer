import { describe, expect, it } from "vitest";
import { changeRequestPrompt, cleanEdits, invalidReason, toHex6, tokenByName } from "./tokenModel";

describe("design-system token model", () => {
  it("covers every token in tokens.json", () => {
    expect(tokenByName.get("accent")?.value).toBe("#0284c7");
    expect(tokenByName.get("panel-width")?.type).toBe("dimension");
  });

  it("keeps only real, valid changes", () => {
    expect(
      cleanEdits({ accent: "#e11d48", bg: tokenByName.get("bg")!.value, "not-a-token": "1px", "radius-sm": "red; }" }),
    ).toEqual({ accent: "#e11d48" });
  });

  it("rejects values that could break out of the generated stylesheet", () => {
    expect(invalidReason("12px")).toBeNull();
    expect(invalidReason("")).not.toBeNull();
    expect(invalidReason("1px } body { display: none")).not.toBeNull();
  });

  it("rejects invalid color values for color tokens", () => {
    expect(invalidReason("#0284c7", "color")).toBeNull();
    expect(invalidReason("red", "color")).not.toBeNull();
    expect(invalidReason("rgb(255,0,0)", "color")).not.toBeNull();
  });

  it("expands short hex for the native color input", () => {
    expect(toHex6("#fff")).toBe("#ffffff");
    expect(toHex6("#0284c7")).toBe("#0284c7");
  });

  it("writes a request listing old and new values and the extra notes", () => {
    const prompt = changeRequestPrompt({ accent: "#e11d48" }, "Make glossary rows 40px tall.", "https://claude.ai/artifact/x");
    expect(prompt).toContain("`accent`: `#0284c7` -> `#e11d48`");
    expect(prompt).toContain("Make glossary rows 40px tall.");
    expect(prompt).toContain("npm run tokens");
    expect(prompt).toContain("Do not merge");
  });
});
