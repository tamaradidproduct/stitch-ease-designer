import { describe, expect, it } from "vitest";
import { shouldOpenPickerForSelection } from "./usePaintTool";

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
