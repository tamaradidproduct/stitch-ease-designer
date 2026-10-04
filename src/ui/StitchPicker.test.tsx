// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { getSymbol } from "../symbols/registry";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { setupReactRoot } from "../test/reactRoot";
import { StitchPicker } from "./StitchPicker";

const dom = setupReactRoot();

// Mirrors usePaintTool's openPickerForSingleSelection: selecting an
// already-placed stitch opens the picker with both `currentSymbolId` and
// `selectionIds` set to that one placement.
const selectPlacement = (placement: { col: number; row: number; symbolId: string; id: string }) => {
  act(() => {
    useUiStore.getState().openPicker({
      col: placement.col,
      row: placement.row,
      x: 0,
      y: 0,
      currentSymbolId: placement.symbolId,
      selectionIds: [placement.id],
      selectionSpan: 1,
    });
  });
};

const quickButton = (symbolId: string) =>
  dom.container.querySelector<HTMLButtonElement>(`.picker__quickButton[aria-label="${getSymbol(symbolId)!.label}"]`);
const quickTile = (symbolId: string) => quickButton(symbolId)?.closest(".picker__quickTile");

/** Knit and purl in the quick row, nothing placed, picker mounted. */
function mountWithKnitPurlQuickRow() {
  beforeEach(() => {
    useDocStore.setState({
      index: DocIndex.from([]),
      glossaryIds: ["knit", "purl"],
      quickSymbolIds: ["knit", "purl"],
    });
    dom.render(<StitchPicker />);
  });
}

describe("StitchPicker quick-slot active highlight (#306)", () => {
  mountWithKnitPurlQuickRow();

  it("marks the regular quick-slot button for the selected placed stitch as active, and no other", () => {
    // StitchPicker is mounted (rendering null) from the very start of the
    // test, subscribed to the doc store - placing a stitch re-renders it
    // just as much as selecting one does, so it needs the same act() wrap.
    act(() => {
      useDocStore.getState().place("knit", 0, 0);
    });
    selectPlacement(useDocStore.getState().index.placementAt(0, 0)!);

    const knitButton = quickButton("knit");
    const purlButton = quickButton("purl");

    expect(knitButton?.getAttribute("data-active")).toBe("true");
    expect(purlButton?.getAttribute("data-active")).toBe("false");
  });

  it("marks the dynamic 6th-slot button as active when the selected stitch isn't one of the 5 quick slots", () => {
    act(() => {
      useDocStore.getState().place("yarn_over", 1, 0);
    });
    selectPlacement(useDocStore.getState().index.placementAt(1, 0)!);

    const dynamicButton = quickButton("yarn_over");

    expect(dynamicButton).not.toBeNull();
    expect(dynamicButton?.getAttribute("data-active")).toBe("true");
  });
});

/**
 * Characterization coverage for issue #323's `QuickTile` extraction: the
 * quick-slot tile's recolor `ColorChip` guard was `!entry.colorId &&
 * currentSlot?.key === entry.key`, while the dynamic 6th tile's was
 * `!dynamicSlot.colorId && currentSlot` (no key match) - equivalent in
 * practice since the dynamic tile only ever exists when it *is* the
 * current slot, but still two different guards to keep in sync by hand.
 * These pin the chip's actual visibility (not just its stated condition)
 * for both tile kinds before `QuickTile` standardized on one guard.
 *
 * Also issue #326's affordance matrix for quick tiles (FR-25/FR-34): only
 * the current tile gets a chip, and it's the restrictive "recolor" one.
 */
describe("StitchPicker quick-tile recolor chip (issues #323, #326)", () => {
  mountWithKnitPurlQuickRow();

  it("shows the recolor chip only on the active, plain quick-slot tile - not an inactive one", () => {
    act(() => {
      useDocStore.getState().place("knit", 0, 0);
    });
    selectPlacement(useDocStore.getState().index.placementAt(0, 0)!);

    expect(quickTile("knit")?.querySelector(".picker__quickColorChip.colorChip--recolor")).toBeTruthy();
    expect(quickTile("purl")?.querySelector(".colorChip")).toBeNull();
    // Exactly one chip in the whole quick row - the active tile's.
    expect(dom.container.querySelectorAll(".picker__quickColorChip").length).toBe(1);
  });

  it("shows the recolor chip on the dynamic 6th tile when it's the active (plain) selection", () => {
    act(() => {
      useDocStore.getState().place("yarn_over", 1, 0);
    });
    selectPlacement(useDocStore.getState().index.placementAt(1, 0)!);

    expect(quickTile("yarn_over")?.querySelector(".picker__quickColorChip")).toBeTruthy();
    expect(dom.container.querySelectorAll(".picker__quickColorChip").length).toBe(1);
  });
});

/**
 * Regression coverage for #305: #296 wired `unrecognizedKeyCleared` into
 * `docStore.place()`/`commit()` (see docStore.test.ts's "#285" suite), but
 * only threaded it into usePaintTool.ts's freehand-paint call site. This
 * suite drives the same undo/redo assertions through StitchPicker's own
 * click handling instead of calling `docStore.place()` directly - that's
 * the gap the docStore-only suite couldn't have caught, since the picker's
 * single-cell pick and "replace all" paths were clearing the flag with a
 * plain uiStore mutation that never touched `undoStack` at all.
 */
describe("StitchPicker clearing the unrecognized-cell flag undoably (#305)", () => {
  beforeEach(() => {
    useDocStore.getState().openChart({ meta: { id: "c1", name: "c1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", rev: "r1" }, placements: [], unknownSymbolIds: [] });
  });

  const clickKnit = () => {
    const button = dom.container.querySelector<HTMLButtonElement>('[aria-label="Knit"]');
    expect(button).not.toBeNull();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  };

  it("single-cell pick: clears the flag via place()'s HistoryEntry so undo restores it", () => {
    useUiStore.getState().setReferenceImageUnrecognized("2,3", true);
    useUiStore.getState().openPicker({ col: 2, row: 3, x: 0, y: 0 });
    dom.render(<StitchPicker />);

    clickKnit();

    expect(useDocStore.getState().index.placementAt(2, 3)?.symbolId).toBe("knit");
    expect(useUiStore.getState().referenceImageUnrecognized.has("2,3")).toBe(false);
    // The fix's whole point: the clear must be attached to the placement's
    // own HistoryEntry, not a bare uiStore mutation undo knows nothing about.
    expect(useDocStore.getState().undoStack.at(-1)?.unrecognizedKeysCleared).toEqual(["2,3"]);

    act(() => useDocStore.getState().undo());
    expect(useDocStore.getState().index.placementAt(2, 3)).toBeUndefined();
    expect(useUiStore.getState().referenceImageUnrecognized.has("2,3")).toBe(true);

    act(() => useDocStore.getState().redo());
    expect(useDocStore.getState().index.placementAt(2, 3)?.symbolId).toBe("knit");
    expect(useUiStore.getState().referenceImageUnrecognized.has("2,3")).toBe(false);
  });

  it("batch 'replace all' pick: bundles every cleared flag into one undo step", () => {
    useUiStore.getState().setReferenceImageUnrecognized("0,0", true);
    useUiStore.getState().setReferenceImageUnrecognized("1,0", true);
    useUiStore.getState().openPicker({
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      selectionEmptyCells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
      reviewingSuggestion: true,
    });
    dom.render(<StitchPicker />);

    const before = useDocStore.getState().undoStack.length;
    clickKnit();

    expect(useDocStore.getState().index.placementAt(0, 0)?.symbolId).toBe("knit");
    expect(useDocStore.getState().index.placementAt(1, 0)?.symbolId).toBe("knit");
    expect(useUiStore.getState().referenceImageUnrecognized.size).toBe(0);
    // One merged HistoryEntry for the whole batch, not two, and not a
    // bare flag mutation that bypasses undoStack entirely.
    expect(useDocStore.getState().undoStack.length).toBe(before + 1);

    act(() => useDocStore.getState().undo());
    expect(useDocStore.getState().index.placementAt(0, 0)).toBeUndefined();
    expect(useDocStore.getState().index.placementAt(1, 0)).toBeUndefined();
    expect(useUiStore.getState().referenceImageUnrecognized.has("0,0")).toBe(true);
    expect(useUiStore.getState().referenceImageUnrecognized.has("1,0")).toBe(true);
  });
});

/**
 * Issue #326's affordance matrix for the drawer (FR-25/FR-34, see
 * docs/PRD.md's "Multicolor stitches (colorwork)" section): the drawer's
 * rows always get the permissive "add-only" chip for a plain entry,
 * slotted or not. The quick-tile half lives in the #323 suite above.
 */
describe("color affordance matrix: drawer rows (issue #326)", () => {
  beforeEach(() => {
    useDocStore.setState({
      index: DocIndex.from([{ id: "p1", symbolId: "knit", col: 0, row: 0 }]),
      glossaryIds: ["knit", "purl", "yarn_over"],
      quickSymbolIds: ["knit", "purl"],
    });
    dom.render(<StitchPicker />);
  });

  it("gives a plain drawer row the permissive add-only chip, never the recolor one", () => {
    act(() => {
      useUiStore.getState().openPicker({ col: 1, row: 0, x: 0, y: 0 });
    });

    const moreButton = dom.container.querySelector<HTMLButtonElement>(
      'button[aria-label="More stitches from this chart"]',
    );
    expect(moreButton).not.toBeNull();
    act(() => {
      moreButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const yarnOverRow = Array.from(dom.container.querySelectorAll(".picker__item")).find((row) =>
      row.textContent?.includes(getSymbol("yarn_over")!.label),
    );
    expect(yarnOverRow).toBeTruthy();
    expect(yarnOverRow?.querySelector(".colorChip--add-only")).not.toBeNull();
    expect(yarnOverRow?.querySelector(".colorChip--recolor")).toBeNull();
  });
});
