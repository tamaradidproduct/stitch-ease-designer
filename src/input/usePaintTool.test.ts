import { describe, expect, it } from "vitest";
import { SUGGEST_SYMBOL_ID } from "../state/uiStore";
import {
  constrainToStraightAxis,
  modeFor,
  shouldOpenPickerForSelection,
  straightAxisFor,
  straightLineCells,
  strokeKey,
} from "./usePaintTool";

const noMods = { shiftKey: false, altKey: false };

describe("shouldOpenPickerForSelection", () => {
  it("opens the picker for a plain click that selects exactly one stitch", () => {
    expect(shouldOpenPickerForSelection(["a"], false)).toBe(true);
  });

  it("never opens the picker for a shift/cmd-additive click, even at exactly one id", () => {
    // A shift-click is building or trimming a multi-selection, not editing
    // it - regardless of whether that leaves one id selected (e.g. shift-
    // clicking the first stitch of a new selection, or shift-clicking a
    // multi-item selection down to its last remaining member).
    expect(shouldOpenPickerForSelection(["a"], true)).toBe(false);
  });

  it("does not open the picker for zero or multiple ids", () => {
    expect(shouldOpenPickerForSelection([], false)).toBe(false);
    expect(shouldOpenPickerForSelection(["a", "b"], false)).toBe(false);
  });
});

describe("straight drawing", () => {
  it("uses the dominant movement to choose a row or column", () => {
    expect(straightAxisFor({ col: 2, row: 3 }, { col: 7, row: 5 })).toBe("row");
    expect(straightAxisFor({ col: 2, row: 3 }, { col: 4, row: 8 })).toBe("column");
  });

  it("projects diagonal targets to the chosen axis", () => {
    expect(constrainToStraightAxis({ col: 2, row: 3 }, { col: 7, row: 5 }, "row"))
      .toEqual({ col: 7, row: 3 });
    expect(constrainToStraightAxis({ col: 2, row: 3 }, { col: 7, row: 5 }, "column"))
      .toEqual({ col: 2, row: 5 });
  });

  it("includes every cell between the line endpoints", () => {
    expect(straightLineCells({ col: 5, row: 2 }, { col: 1, row: 2 }))
      .toEqual([
        { col: 5, row: 2 },
        { col: 4, row: 2 },
        { col: 3, row: 2 },
        { col: 2, row: 2 },
        { col: 1, row: 2 },
      ]);
    expect(straightLineCells({ col: 2, row: 1 }, { col: 2, row: 3 }))
      .toEqual([{ col: 2, row: 1 }, { col: 2, row: 2 }, { col: 2, row: 3 }]);
  });
});

describe("modeFor", () => {
  it("draws with the armed stitch when nothing is held", () => {
    expect(modeFor(noMods, "purl", false)).toEqual({ kind: "place", symbolId: "purl" });
  });

  it("is null when nothing is armed and no modifier is held", () => {
    expect(modeFor(noMods, null, false)).toBeNull();
  });

  it("matches with Suggest when it's the armed stitch", () => {
    expect(modeFor(noMods, SUGGEST_SYMBOL_ID, false)).toEqual({ kind: "suggest" });
  });

  it("confirms as originally guessed on Shift over a suggestion, when Suggest or nothing is armed", () => {
    expect(modeFor({ ...noMods, shiftKey: true }, SUGGEST_SYMBOL_ID, true)).toEqual({ kind: "confirm" });
    expect(modeFor({ ...noMods, shiftKey: true }, null, true)).toEqual({ kind: "confirm" });
  });

  it("confirms as the armed stitch on Shift over a suggestion when a real stitch is armed", () => {
    expect(modeFor({ ...noMods, shiftKey: true }, "purl", true)).toEqual({
      kind: "confirm",
      overrideSymbolId: "purl",
    });
  });

  it("falls through to the armed stitch on Shift when the target isn't actually suggested", () => {
    // Preserves straight-line draw while armed: Shift shouldn't shadow the
    // armed stitch just because it's held, only when there's something to review.
    expect(modeFor({ ...noMods, shiftKey: true }, "purl", false)).toEqual({
      kind: "place",
      symbolId: "purl",
    });
  });

  it("erases on Shift+Opt, regardless of what's armed", () => {
    expect(modeFor({ shiftKey: true, altKey: true }, "purl", false)).toEqual({ kind: "erase" });
    expect(modeFor({ shiftKey: true, altKey: true }, null, false)).toEqual({ kind: "erase" });
    expect(modeFor({ shiftKey: true, altKey: true }, null, true)).toEqual({ kind: "erase" });
  });
});

describe("strokeKey", () => {
  it("distinguishes different armed symbols from each other", () => {
    expect(strokeKey({ kind: "place", symbolId: "purl" })).not.toBe(
      strokeKey({ kind: "place", symbolId: "knit" }),
    );
  });

  it("gives suggest, confirm, and erase each their own stable key", () => {
    const keys = [
      strokeKey({ kind: "suggest" }),
      strokeKey({ kind: "confirm" }),
      strokeKey({ kind: "erase" }),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it("distinguishes a plain confirm from an overriding one, and different overrides from each other", () => {
    const keys = [
      strokeKey({ kind: "confirm" }),
      strokeKey({ kind: "confirm", overrideSymbolId: "purl" }),
      strokeKey({ kind: "confirm", overrideSymbolId: "knit" }),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it("never collides with a placed symbol's own key", () => {
    // "place:confirm" would be a real (if odd) symbol id; the actual
    // confirm mode's key must still be distinguishable from it.
    expect(strokeKey({ kind: "confirm" })).not.toBe(strokeKey({ kind: "place", symbolId: "confirm" }));
  });
});
