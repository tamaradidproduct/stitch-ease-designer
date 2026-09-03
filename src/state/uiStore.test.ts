import { describe, expect, it } from "vitest";
import { assignQuickSymbol } from "./uiStore";

describe("assignQuickSymbol", () => {
  it("fills slots in order without moving an existing stitch", () => {
    const slots = ["knit", "purl"];

    expect(assignQuickSymbol(slots, "yo")).toEqual(["knit", "purl", "yo"]);
    expect(assignQuickSymbol(slots, "knit")).toBe(slots);
  });

  it("leaves a full set of five slots unchanged", () => {
    const slots = ["knit", "purl", "yo", "m1l", "m1r"];

    expect(assignQuickSymbol(slots, "k2tog")).toBe(slots);
  });
});
