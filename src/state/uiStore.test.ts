import { beforeEach, describe, expect, it } from "vitest";
import { SUGGEST_SYMBOL_ID, useUiStore } from "./uiStore";
import { useDocStore } from "./docStore";

beforeEach(() => {
  useDocStore.setState({ quickSymbolIds: [], glossaryIds: [] });
  useUiStore.setState({ armedSymbolId: null, activeColor: null, tool: "stitch" });
  useUiStore.getState().resetForChart();
  useUiStore.getState().setClipboardPlacements([]);
});

describe("resetForChart", () => {
  it("clears the armed stitch while preserving stable quick slots", () => {
    useUiStore.getState().chooseSymbol("knit");
    useUiStore.getState().chooseSymbol("purl");

    expect(useUiStore.getState().armedSymbolId).toBe("purl");
    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "purl"]);

    useUiStore.getState().resetForChart();

    expect(useUiStore.getState().armedSymbolId).toBeNull();
    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "purl"]);
    expect(useUiStore.getState().tool).toBe("stitch");
  });

  it("restores the selection that existed before a select action", () => {
    useUiStore.getState().setSelectedPlacementIds(["first"]);
    useUiStore.getState().setSelectedPlacementIds(["second"]);

    expect(useUiStore.getState().restoreLastClearedSelection()).toBe(true);
    expect(useUiStore.getState().selectedPlacementIds).toEqual(["first"]);
  });

  it("restores a dismissed multi-selection after Select returns to Draw", () => {
    const ui = useUiStore.getState();
    ui.setTool("select");
    ui.setSelectedPlacementIds(["first", "second"]);

    useUiStore.getState().clearSelectionWithUndo();
    useUiStore.getState().setTool("stitch");

    expect(useUiStore.getState().selectedPlacementIds).toEqual([]);
    expect(useUiStore.getState().restoreLastClearedSelection()).toBe(true);
    expect(useUiStore.getState().selectedPlacementIds).toEqual(["first", "second"]);
  });

  it("records a selection dismissed directly by switching tools", () => {
    const ui = useUiStore.getState();
    ui.setTool("select");
    ui.setSelectedPlacementIds(["first"]);

    useUiStore.getState().setTool("stitch");

    expect(useUiStore.getState().selectedPlacementIds).toEqual([]);
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

describe("tool switching", () => {
  it("disarms Suggest when explicitly switching to Select", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setTool("select");

    expect(useUiStore.getState().tool).toBe("select");
    expect(useUiStore.getState().armedSymbolId).toBeNull();
  });

  // Insert reads armedSymbolId directly and would insert the synthetic id
  // itself as a placement's symbolId if left armed - worse than Select's
  // merely contradictory UI, an actual corrupt document.
  it("disarms Suggest when switching to Insert or Eraser too", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setTool("insert");
    expect(useUiStore.getState().armedSymbolId).toBeNull();

    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setTool("eraser");
    expect(useUiStore.getState().armedSymbolId).toBeNull();
  });

  it("keeps a real armed stitch while selecting", () => {
    useUiStore.getState().setArmedSymbolId("knit");
    useUiStore.getState().setTool("select");

    expect(useUiStore.getState().armedSymbolId).toBe("knit");
  });
});

describe("suggestAction reset (FR-2)", () => {
  it("resets to 'suggest' when Suggest is disarmed", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setSuggestAction("confirm");

    useUiStore.getState().setArmedSymbolId(null);

    expect(useUiStore.getState().suggestAction).toBe("suggest");
  });

  it("resets to 'suggest' when a real stitch is armed instead", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setSuggestAction("dismiss");

    useUiStore.getState().chooseSymbol("knit");

    expect(useUiStore.getState().suggestAction).toBe("suggest");
  });

  it("resets to 'suggest' when switching tools away from Suggest", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setSuggestAction("confirm");

    useUiStore.getState().setTool("select");

    expect(useUiStore.getState().suggestAction).toBe("suggest");
  });

  it("resets to 'suggest' on a full chart reset", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setSuggestAction("dismiss");

    useUiStore.getState().resetForChart();

    expect(useUiStore.getState().suggestAction).toBe("suggest");
  });

  it("resets to 'suggest' when Suggest is re-armed, so a stale sticky default never survives a re-arm", () => {
    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);
    useUiStore.getState().setSuggestAction("confirm");
    useUiStore.getState().setArmedSymbolId(null);

    useUiStore.getState().setArmedSymbolId(SUGGEST_SYMBOL_ID);

    expect(useUiStore.getState().suggestAction).toBe("suggest");
  });
});

describe("removeQuickSymbol", () => {
  it("clears the assignment in place and disarms the removed stitch", () => {
    useUiStore.getState().chooseSymbol("knit");
    useUiStore.getState().chooseSymbol("purl");
    useUiStore.getState().chooseSymbol("yo");
    useUiStore.getState().setArmedSymbolId("purl");
    useUiStore.getState().removeQuickSymbol("purl");

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "", "yo"]);
    expect(useUiStore.getState().armedSymbolId).toBeNull();
  });
});

describe("chooseSymbol with a color (FR-26)", () => {
  it("arms the symbol and color together as one pen", () => {
    useUiStore.getState().chooseSymbol("knit", undefined, undefined, "#e11d48");

    expect(useUiStore.getState().armedSymbolId).toBe("knit");
    expect(useUiStore.getState().activeColor).toBe("#e11d48");
    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit::#e11d48"]);
  });

  it("a plain pick clears the active color (DNT-8)", () => {
    useUiStore.getState().chooseSymbol("knit", undefined, undefined, "#e11d48");
    useUiStore.getState().chooseSymbol("purl");

    expect(useUiStore.getState().activeColor).toBeNull();
  });
});
