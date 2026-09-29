// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { getSymbol } from "../symbols/registry";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { StitchPicker } from "./StitchPicker";

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

describe("StitchPicker quick-slot active highlight (#306)", () => {
  let container: HTMLDivElement;
  let root: Root;

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
