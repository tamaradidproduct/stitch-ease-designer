// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { StitchPicker } from "./StitchPicker";

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
