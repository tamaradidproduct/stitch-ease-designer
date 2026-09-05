import { beforeEach, describe, expect, it } from "vitest";
import { assignQuickSymbol, moveQuickSymbol, moveQuickSymbolTo, useUiStore } from "./uiStore";

beforeEach(() => {
  useUiStore.setState({ quickSymbolIds: [], armedSymbolId: null, tool: "stitch" });
  useUiStore.getState().resetForChart();
  useUiStore.getState().setClipboardPlacements([]);
});

describe("assignQuickSymbol", () => {
  it("fills slots in order without moving an existing stitch", () => {
    const slots = ["knit", "purl"];

    expect(assignQuickSymbol(slots, "yo")).toEqual(["knit", "purl", "yo"]);
    expect(assignQuickSymbol(slots, "knit")).toBe(slots);
  });

  it("progressively adds a slot after the first five", () => {
    const slots = ["knit", "purl", "yo", "m1l", "m1r"];

    expect(assignQuickSymbol(slots, "k2tog")).toEqual([...slots, "k2tog"]);
  });

  it("reuses the first vacant slot without moving the other shortcuts", () => {
    const slots = ["knit", "", "yo"];

    expect(assignQuickSymbol(slots, "purl")).toEqual(["knit", "purl", "yo"]);
  });
});

describe("resetForChart", () => {
  it("clears the armed stitch while preserving stable quick slots", () => {
    useUiStore.getState().chooseSymbol("knit");
    useUiStore.getState().chooseSymbol("purl");

    expect(useUiStore.getState().armedSymbolId).toBe("purl");
    expect(useUiStore.getState().quickSymbolIds).toEqual(["knit", "purl"]);

    useUiStore.getState().resetForChart();

    expect(useUiStore.getState().armedSymbolId).toBeNull();
    expect(useUiStore.getState().quickSymbolIds).toEqual(["knit", "purl"]);
    expect(useUiStore.getState().tool).toBe("stitch");
  });

  it("restores the selection that existed before a select action", () => {
    useUiStore.getState().setSelectedPlacementIds(["first"]);
    useUiStore.getState().setSelectedPlacementIds(["second"]);

    expect(useUiStore.getState().restoreLastClearedSelection()).toBe(true);
    expect(useUiStore.getState().selectedPlacementIds).toEqual(["first"]);
  });

  it("keeps the clipboard through chart resets until it is explicitly replaced", () => {
    const copied = [{ id: "copied", symbolId: "knit", col: 2, row: 3 }];
    useUiStore.getState().setClipboardPlacements(copied);

    useUiStore.getState().resetForChart();

    expect(useUiStore.getState().clipboardPlacements).toEqual(copied);
  });
});

describe("removeQuickSymbol", () => {
  it("clears the assignment in place and disarms the removed stitch", () => {
    useUiStore.getState().chooseSymbol("knit");
    useUiStore.getState().chooseSymbol("purl");
    useUiStore.getState().chooseSymbol("yo");
    useUiStore.getState().setArmedSymbolId("purl");
    useUiStore.getState().removeQuickSymbol("purl");

    expect(useUiStore.getState().quickSymbolIds).toEqual(["knit", "", "yo"]);
    expect(useUiStore.getState().armedSymbolId).toBeNull();
  });
});

describe("moveQuickSymbol", () => {
  it("swaps a stitch into an adjacent vacant slot without renumbering the others", () => {
    expect(moveQuickSymbol(["knit", "", "purl"], "purl", -1)).toEqual(["knit", "purl", ""]);
  });

  it("makes the next slot available when a stitch moves down", () => {
    expect(moveQuickSymbol(["knit"], "knit", 1)).toEqual(["", "knit"]);
  });

  it("does not move a stitch before the first shortcut", () => {
    const slots = ["knit", "purl"];
    expect(moveQuickSymbol(slots, "knit", -1)).toBe(slots);
  });
});

describe("moveQuickSymbolTo", () => {
  it("moves a stitch through the intervening slots so their shortcuts stay ordered", () => {
    expect(moveQuickSymbolTo(["knit", "purl", "yo"], "knit", 2)).toEqual(["purl", "yo", "knit"]);
  });
});
