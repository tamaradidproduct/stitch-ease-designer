import { describe, expect, it } from "vitest";
import {
  constrainToStraightAxis,
  shouldOpenPickerForSelection,
  straightAxisFor,
  straightLineCells,
} from "./usePaintTool";

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
