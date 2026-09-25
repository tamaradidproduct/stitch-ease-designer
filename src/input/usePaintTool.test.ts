import { describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { SUGGEST_SYMBOL_ID } from "../state/uiStore";
import {
  constrainToStraightAxis,
  includeEmptyCells,
  isDismissable,
  isSuggestReviewCandidate,
  resolveGroupIds,
  modeFor,
  resolveSuggestAction,
  shouldBlockDismissGesture,
  shouldStartDismissStroke,
  shouldDismissSelectionBeforeDrawing,
  shouldOpenPickerForSelection,
  straightAxisFor,
  straightLineCells,
  strokeKey,
} from "./usePaintTool";

const noMods = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const cmdHeld = { ...noMods, metaKey: true };
const dismissHeld = { ...noMods, shiftKey: true, altKey: true };
const suggested = { suggested: true };
const confirmed = { suggested: false };

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

describe("shouldDismissSelectionBeforeDrawing", () => {
  it("consumes an armed click on empty canvas while a selection is active", () => {
    expect(shouldDismissSelectionBeforeDrawing("purl", false, true, false)).toBe(true);
  });

  it("does not intercept the following draw click after the selection is gone", () => {
    expect(shouldDismissSelectionBeforeDrawing("purl", false, false, false)).toBe(false);
  });

  it("does not shadow occupied-cell or Shift interactions", () => {
    expect(shouldDismissSelectionBeforeDrawing("purl", true, true, false)).toBe(false);
    expect(shouldDismissSelectionBeforeDrawing("purl", false, true, true)).toBe(false);
  });
});

describe("includeEmptyCells", () => {
  it("requires Cmd/Ctrl, Shift, and Opt/Alt together", () => {
    expect(includeEmptyCells({ ...noMods, metaKey: true, shiftKey: true, altKey: true })).toBe(true);
    expect(includeEmptyCells({ ...noMods, ctrlKey: true, shiftKey: true, altKey: true })).toBe(true);
  });

  it("keeps Select+Opt and Cmd/Ctrl+Opt marquees placement-only", () => {
    expect(includeEmptyCells({ ...noMods, altKey: true })).toBe(false);
    expect(includeEmptyCells({ ...noMods, metaKey: true, altKey: true })).toBe(false);
    expect(includeEmptyCells({ ...noMods, ctrlKey: true, altKey: true })).toBe(false);
  });
});

describe("resolveGroupIds", () => {
  it("expands a touched group once while preserving ungrouped placements", () => {
    const index = DocIndex.from([
      { id: "group-left", symbolId: "knit", col: 1, row: 1, groupId: "group-1" },
      { id: "group-right", symbolId: "purl", col: 2, row: 1, groupId: "group-1" },
      { id: "solo", symbolId: "knit", col: 4, row: 1 },
    ]);

    expect(resolveGroupIds(index, { minCol: 1, maxCol: 4, minRow: 1, maxRow: 1 }))
      .toEqual(["group-left", "group-right", "group-left", "group-right", "solo"]);
  });
});

describe("shouldBlockDismissGesture", () => {
  it("blocks an ineligible Shift+Opt/Alt gesture without Cmd/Ctrl", () => {
    expect(shouldBlockDismissGesture(dismissHeld, null)).toBe(true);
  });

  it("does not block Cmd/Ctrl+Shift+Opt/Alt's empty-cell marquee", () => {
    expect(shouldBlockDismissGesture({ ...dismissHeld, metaKey: true }, null)).toBe(false);
    expect(shouldBlockDismissGesture({ ...dismissHeld, ctrlKey: true }, null)).toBe(false);
  });

  it("does not block when a valid stroke mode is present", () => {
    expect(shouldBlockDismissGesture(dismissHeld, { kind: "erase" })).toBe(false);
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

describe("resolveSuggestAction", () => {
  it("falls back to the sticky default when nothing live is held", () => {
    expect(resolveSuggestAction({ confirmHeld: false, dismissHeld: false }, "suggest")).toBe("suggest");
    expect(resolveSuggestAction({ confirmHeld: false, dismissHeld: false }, "confirm")).toBe("confirm");
    expect(resolveSuggestAction({ confirmHeld: false, dismissHeld: false }, "dismiss")).toBe("dismiss");
  });

  it("lets a literally held modifier win over the sticky default", () => {
    expect(resolveSuggestAction({ confirmHeld: true, dismissHeld: false }, "dismiss")).toBe("confirm");
    expect(resolveSuggestAction({ confirmHeld: false, dismissHeld: true }, "confirm")).toBe("dismiss");
  });

  it("is blocked - not Dismiss winning - if both chords are somehow held at once", () => {
    // Revised FR-4: two conflicting deliberate gestures held together is a
    // hard no-op, not a silently-chosen winner.
    expect(resolveSuggestAction({ confirmHeld: true, dismissHeld: true }, "suggest")).toBe("blocked");
    expect(resolveSuggestAction({ confirmHeld: true, dismissHeld: true }, "confirm")).toBe("blocked");
    expect(resolveSuggestAction({ confirmHeld: true, dismissHeld: true }, "dismiss")).toBe("blocked");
  });
});

describe("isDismissable", () => {
  it("is eligible for a still-suggested placement", () => {
    expect(isDismissable(suggested, false)).toBe(true);
  });

  it("is eligible for an unrecognized marker with no placement", () => {
    expect(isDismissable(undefined, true)).toBe(true);
  });

  it("is not eligible for a hand-drawn or already-confirmed placement", () => {
    expect(isDismissable(confirmed, false)).toBe(false);
  });

  it("is not eligible for empty, unmarked space", () => {
    expect(isDismissable(undefined, false)).toBe(false);
  });
});

describe("modeFor", () => {
  it("draws with the armed stitch when nothing is held", () => {
    expect(modeFor(noMods, "purl", "suggest", undefined, false)).toEqual({
      kind: "place",
      symbolId: "purl",
      colorId: null,
    });
  });

  it("is null when nothing is armed and no modifier is held", () => {
    expect(modeFor(noMods, null, "suggest", undefined, false)).toBeNull();
  });

  it("matches with Suggest when it's the armed stitch and the sticky default is plain Suggest", () => {
    expect(modeFor(noMods, SUGGEST_SYMBOL_ID, "suggest", undefined, false)).toEqual({ kind: "suggest" });
  });

  it("confirms as originally guessed on Cmd/Ctrl over a suggestion, when Suggest or nothing is armed", () => {
    expect(modeFor(cmdHeld, SUGGEST_SYMBOL_ID, "suggest", suggested, false)).toEqual({ kind: "confirm" });
    expect(modeFor(cmdHeld, null, "suggest", suggested, false)).toEqual({ kind: "confirm" });
  });

  it("confirms as the armed stitch on landing on a suggestion when a real stitch is armed, no modifier needed", () => {
    expect(modeFor(noMods, "purl", "suggest", suggested, false)).toEqual({
      kind: "confirm",
      overrideSymbolId: "purl",
    });
  });

  it("is a no-op on Cmd/Ctrl when the target isn't actually suggested (falls through to temporary-Select elsewhere)", () => {
    expect(modeFor(cmdHeld, SUGGEST_SYMBOL_ID, "suggest", confirmed, false)).toBeNull();
    expect(modeFor(cmdHeld, "purl", "suggest", undefined, false)).toBeNull();
  });

  it("dismisses a suggestion or unrecognized marker on Shift+Opt, regardless of what's armed", () => {
    expect(modeFor(dismissHeld, "purl", "suggest", suggested, false)).toEqual({ kind: "erase" });
    expect(modeFor(dismissHeld, null, "suggest", undefined, true)).toEqual({ kind: "erase" });
    expect(modeFor(dismissHeld, SUGGEST_SYMBOL_ID, "suggest", suggested, false)).toEqual({ kind: "erase" });
  });

  it("never dismisses a hand-drawn or already-confirmed placement (Gotcha G-1)", () => {
    expect(modeFor(dismissHeld, "purl", "suggest", confirmed, false)).toBeNull();
    expect(modeFor(dismissHeld, null, "suggest", confirmed, false)).toBeNull();
  });

  it("follows the sticky default while Suggest is armed and nothing is held live", () => {
    expect(modeFor(noMods, SUGGEST_SYMBOL_ID, "confirm", suggested, false)).toEqual({ kind: "confirm" });
    expect(modeFor(noMods, SUGGEST_SYMBOL_ID, "dismiss", suggested, false)).toEqual({ kind: "erase" });
  });

  it("never starts a fresh Suggest match under a sticky Confirm/Dismiss default (Gotcha G-3)", () => {
    expect(modeFor(noMods, SUGGEST_SYMBOL_ID, "confirm", undefined, false)).toBeNull();
    expect(modeFor(noMods, SUGGEST_SYMBOL_ID, "dismiss", undefined, false)).toBeNull();
  });

  it("ignores the sticky default entirely once armed away from Suggest - a real armed stitch keeps drawing normally (Gotcha G-3)", () => {
    expect(modeFor(noMods, "purl", "confirm", undefined, false)).toEqual({
      kind: "place",
      symbolId: "purl",
      colorId: null,
    });
    expect(modeFor(noMods, "purl", "dismiss", undefined, false)).toEqual({
      kind: "place",
      symbolId: "purl",
      colorId: null,
    });
  });

  it("lets a literally held modifier override the sticky default live, for the duration held", () => {
    // Sticky Dismiss, but Cmd is physically held right now: acts as Confirm.
    expect(modeFor(cmdHeld, SUGGEST_SYMBOL_ID, "dismiss", suggested, false)).toEqual({ kind: "confirm" });
  });

  it("is a hard no-op when both chords are somehow held at once, even over an eligible target (revised FR-4)", () => {
    const both = { ...noMods, metaKey: true, shiftKey: true, altKey: true };
    expect(modeFor(both, SUGGEST_SYMBOL_ID, "confirm", suggested, false)).toBeNull();
    expect(modeFor(both, SUGGEST_SYMBOL_ID, "dismiss", suggested, false)).toBeNull();
    // And it wins over the no-modifier override too.
    expect(modeFor(both, "purl", "suggest", suggested, false)).toBeNull();
  });
});

describe("shouldStartDismissStroke", () => {
  it("claims a tap or drag that starts on a protected confirmed stitch for sticky Dismiss", () => {
    expect(shouldStartDismissStroke(noMods, SUGGEST_SYMBOL_ID, "dismiss")).toBe(true);
  });

  it("claims a tap or drag that starts on a protected confirmed stitch for live Dismiss", () => {
    expect(shouldStartDismissStroke(dismissHeld, SUGGEST_SYMBOL_ID, "suggest")).toBe(true);
    expect(shouldStartDismissStroke(dismissHeld, null, "suggest")).toBe(true);
  });

  it("does not claim a gesture when a live modifier overrides or conflicts with Dismiss", () => {
    expect(shouldStartDismissStroke(cmdHeld, SUGGEST_SYMBOL_ID, "dismiss")).toBe(false);
    expect(
      shouldStartDismissStroke(
        { ...noMods, metaKey: true, shiftKey: true, altKey: true },
        SUGGEST_SYMBOL_ID,
        "dismiss",
      ),
    ).toBe(false);
  });

  it("does not claim a normal Suggest stroke or a real armed stitch without live Dismiss", () => {
    expect(shouldStartDismissStroke(noMods, SUGGEST_SYMBOL_ID, "suggest")).toBe(false);
    expect(shouldStartDismissStroke(noMods, "purl", "dismiss")).toBe(false);
  });
});

describe("isSuggestReviewCandidate", () => {
  it("defers a plain pointerdown on a pending suggestion while Suggest is armed", () => {
    expect(isSuggestReviewCandidate(SUGGEST_SYMBOL_ID, suggested, false)).toBe(true);
  });

  it("does not defer when the target isn't a pending suggestion", () => {
    expect(isSuggestReviewCandidate(SUGGEST_SYMBOL_ID, confirmed, false)).toBe(false);
    expect(isSuggestReviewCandidate(SUGGEST_SYMBOL_ID, undefined, false)).toBe(false);
  });

  it("does not defer when Suggest itself isn't armed", () => {
    expect(isSuggestReviewCandidate("purl", suggested, false)).toBe(false);
    expect(isSuggestReviewCandidate(null, suggested, false)).toBe(false);
  });

  it("does not defer a Shift-click, which keeps its own additive-selection meaning", () => {
    expect(isSuggestReviewCandidate(SUGGEST_SYMBOL_ID, suggested, true)).toBe(false);
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
