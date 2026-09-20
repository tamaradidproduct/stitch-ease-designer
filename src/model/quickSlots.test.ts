import { describe, expect, it } from "vitest";
import {
  assignQuickSlot,
  moveQuickSlot,
  moveQuickSlotTo,
  parseQuickSlotId,
  quickSlotKey,
} from "./quickSlots";

describe("quickSlotKey / parseQuickSlotId", () => {
  it("round-trips an uncolored symbol", () => {
    expect(quickSlotKey("knit")).toBe("knit");
    expect(parseQuickSlotId("knit")).toEqual({ symbolId: "knit", colorId: null });
  });

  it("round-trips a colored symbol (DNT-9: splits on the first `::`)", () => {
    expect(quickSlotKey("knit", "#e11d48")).toBe("knit::#e11d48");
    expect(parseQuickSlotId("knit::#e11d48")).toEqual({ symbolId: "knit", colorId: "#e11d48" });
  });

  it("treats a null/undefined colorId as uncolored", () => {
    expect(quickSlotKey("knit", null)).toBe("knit");
    expect(quickSlotKey("knit", undefined)).toBe("knit");
  });
});

describe("assignQuickSlot", () => {
  it("fills slots in order without moving an existing stitch", () => {
    const slots = ["knit", "purl"];

    expect(assignQuickSlot(slots, "yo")).toEqual(["knit", "purl", "yo"]);
    expect(assignQuickSlot(slots, "knit")).toEqual(slots);
  });

  it("progressively adds a slot after the first five", () => {
    const slots = ["knit", "purl", "yo", "m1l", "m1r"];

    expect(assignQuickSlot(slots, "k2tog")).toEqual([...slots, "k2tog"]);
  });

  it("reuses the first vacant slot without moving the other shortcuts", () => {
    const slots = ["knit", "", "yo"];

    expect(assignQuickSlot(slots, "purl")).toEqual(["knit", "purl", "yo"]);
  });

  it("treats a colored variant as a distinct slot from its plain symbol", () => {
    const slots = ["knit"];

    expect(assignQuickSlot(slots, "knit::#e11d48")).toEqual(["knit", "knit::#e11d48"]);
  });
});

describe("moveQuickSlot", () => {
  it("swaps a stitch into an adjacent vacant slot without renumbering the others", () => {
    expect(moveQuickSlot(["knit", "", "purl"], "purl", -1)).toEqual(["knit", "purl", ""]);
  });

  it("makes the next slot available when a stitch moves down", () => {
    expect(moveQuickSlot(["knit"], "knit", 1)).toEqual(["", "knit"]);
  });

  it("does not move a stitch before the first shortcut", () => {
    const slots = ["knit", "purl"];
    expect(moveQuickSlot(slots, "knit", -1)).toEqual(slots);
  });
});

describe("moveQuickSlotTo", () => {
  it("moves a stitch through the intervening slots so their shortcuts stay ordered", () => {
    expect(moveQuickSlotTo(["knit", "purl", "yo"], "knit", 2)).toEqual(["purl", "yo", "knit"]);
  });

  it("moves a stitch into an empty slot without renumbering the other shortcuts", () => {
    expect(moveQuickSlotTo(["knit", "purl"], "knit", 2)).toEqual(["purl", "", "knit"]);
  });
});
