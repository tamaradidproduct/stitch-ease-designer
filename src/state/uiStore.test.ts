import { beforeEach, describe, expect, it } from "vitest";
import { assignQuickSymbol, useUiStore } from "./uiStore";

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
  it("removes the assignment and disarms the removed stitch", () => {
    useUiStore.getState().chooseSymbol("knit");
    useUiStore.getState().chooseSymbol("purl");
    useUiStore.getState().removeQuickSymbol("purl");

    expect(useUiStore.getState().quickSymbolIds).toEqual(["knit"]);
    expect(useUiStore.getState().armedSymbolId).toBeNull();
  });
});
