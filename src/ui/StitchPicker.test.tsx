// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { getSymbol } from "../symbols/registry";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { StitchPicker } from "./StitchPicker";

describe("StitchPicker quick-slot active highlight (#306)", () => {
  let container: HTMLDivElement;
  let root: Root;

  function resetDoc() {
    useDocStore.setState({
      index: DocIndex.from([]),
      undoStack: [],
      redoStack: [],
      stroke: null,
      revision: 0,
      glossaryIds: ["knit", "purl"],
      quickSymbolIds: ["knit", "purl"],
    });
  }

  function resetUi() {
    useUiStore.getState().resetForChart();
  }

  beforeEach(() => {
    // Silences React's "not configured to support act(...)" warning - this
    // suite renders directly via react-dom/client rather than a testing
    // library that sets this for us.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetDoc();
    resetUi();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<StitchPicker />);
    });
  });

  afterEach(() => {
    act(() => {
      if (root) {
        root.unmount();
      }
    });
    container?.remove();
  });

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

  it("marks the regular quick-slot button for the selected placed stitch as active, and no other", () => {
    // StitchPicker is mounted (rendering null) from the very start of the
    // test, subscribed to the doc store - placing a stitch re-renders it
    // just as much as selecting one does, so it needs the same act() wrap.
    act(() => {
      useDocStore.getState().place("knit", 0, 0);
    });
    const placement = useDocStore.getState().index.placementAt(0, 0)!;
    selectPlacement(placement);

    const knitLabel = getSymbol("knit")!.label;
    const purlLabel = getSymbol("purl")!.label;
    const knitButton = container.querySelector<HTMLButtonElement>(
      `.picker__quickButton[aria-label="${knitLabel}"]`,
    );
    const purlButton = container.querySelector<HTMLButtonElement>(
      `.picker__quickButton[aria-label="${purlLabel}"]`,
    );

    expect(knitButton?.getAttribute("data-active")).toBe("true");
    expect(purlButton?.getAttribute("data-active")).toBe("false");
  });

  it("marks the dynamic 6th-slot button as active when the selected stitch isn't one of the 5 quick slots", () => {
    act(() => {
      useDocStore.getState().place("yarn_over", 1, 0);
    });
    const placement = useDocStore.getState().index.placementAt(1, 0)!;
    selectPlacement(placement);

    const yarnOverLabel = getSymbol("yarn_over")!.label;
    const dynamicButton = container.querySelector<HTMLButtonElement>(
      `.picker__quickButton[aria-label="${yarnOverLabel}"]`,
    );

    expect(dynamicButton).not.toBeNull();
    expect(dynamicButton?.getAttribute("data-active")).toBe("true");
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
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useDocStore.getState().openChart({ meta: { id: "c1", name: "c1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", rev: "r1" }, placements: [], unknownSymbolIds: [] });
    useUiStore.getState().clearReferenceImageUnrecognized();
    useUiStore.getState().closePicker();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useUiStore.getState().closePicker();
  });

  const clickKnit = () => {
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Knit"]');
    expect(button).not.toBeNull();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  };

  it("single-cell pick: clears the flag via place()'s HistoryEntry so undo restores it", () => {
    useUiStore.getState().setReferenceImageUnrecognized("2,3", true);
    useUiStore.getState().openPicker({ col: 2, row: 3, x: 0, y: 0 });

    act(() => {
      root.render(<StitchPicker />);
    });

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

    act(() => {
      root.render(<StitchPicker />);
    });

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
 * Issue #326's affordance-matrix bullet: characterizes (doesn't change) the
 * intentional three-way split confirmed against FR-25/FR-34 - see
 * docs/PRD.md's "Multicolor stitches (colorwork)" section. A quick tile
 * gets no color chip unless it's the current/selected one, which gets the
 * restrictive "recolor" chip; the drawer's rows always get the permissive
 * "add-only" chip for a plain entry, slotted or not.
 */
describe("color affordance matrix (issue #326, FR-25/FR-34 - no behavior change)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useDocStore.setState({
      index: DocIndex.from([{ id: "p1", symbolId: "knit", col: 0, row: 0 }]),
      undoStack: [],
      redoStack: [],
      stroke: null,
      revision: 0,
      glossaryIds: ["knit", "purl", "yarn_over"],
      quickSymbolIds: ["knit", "purl"],
    });
    useUiStore.getState().resetForChart();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<StitchPicker />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("gives only the current quick tile a color chip, and it's the restrictive recolor one", () => {
    const placement = useDocStore.getState().index.placementAt(0, 0)!;
    act(() => {
      useUiStore.getState().openPicker({
        col: 0,
        row: 0,
        x: 0,
        y: 0,
        currentSymbolId: placement.symbolId,
        selectionIds: [placement.id],
        selectionSpan: 1,
      });
    });

    const knitTile = container
      .querySelector<HTMLButtonElement>(`.picker__quickButton[aria-label="${getSymbol("knit")!.label}"]`)
      ?.closest(".picker__quickTile");
    const purlTile = container
      .querySelector<HTMLButtonElement>(`.picker__quickButton[aria-label="${getSymbol("purl")!.label}"]`)
      ?.closest(".picker__quickTile");

    expect(knitTile?.querySelector(".colorChip--recolor")).not.toBeNull();
    expect(knitTile?.querySelector(".colorChip")).not.toBeNull();
    expect(purlTile?.querySelector(".colorChip")).toBeNull();
  });

  it("gives a plain drawer row the permissive add-only chip, never the recolor one", () => {
    act(() => {
      useUiStore.getState().openPicker({ col: 1, row: 0, x: 0, y: 0 });
    });

    const moreButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="More stitches from this chart"]',
    );
    expect(moreButton).not.toBeNull();
    act(() => {
      moreButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const yarnOverRow = Array.from(container.querySelectorAll(".picker__item")).find((row) =>
      row.textContent?.includes(getSymbol("yarn_over")!.label),
    );
    expect(yarnOverRow).toBeTruthy();
    expect(yarnOverRow?.querySelector(".colorChip--add-only")).not.toBeNull();
    expect(yarnOverRow?.querySelector(".colorChip--recolor")).toBeNull();
  });
});
