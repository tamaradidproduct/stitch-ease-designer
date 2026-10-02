// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { RightPanel } from "./RightPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Issue #326: keyboard/touch reorder controls for the glossary/quick row,
 * added beside the existing drag-and-drop (which this suite leaves
 * untouched - see RightPanel.quickSlotDrop.test.ts for that coverage), plus
 * the disabled remove control's explanatory tooltip.
 */
describe("RightPanel move up/down controls (issue #326)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const initialDocState = useDocStore.getState();
  const initialUiState = useUiStore.getState();

  beforeEach(() => {
    useDocStore.setState(initialDocState, true);
    useUiStore.setState(initialUiState, true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /** Up/down live in each row's grip stepper, opened by tapping the grip. */
  const openSteppers = () =>
    act(() => {
      for (const grip of container.querySelectorAll<HTMLButtonElement>("button.glossary__dragHandle")) grip.click();
    });

  it("moves a row with the arrow keys once its grip is focused", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "yarn_over"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });
    act(() => {
      root.render(createElement(RightPanel));
    });
    const grip = container.querySelector<HTMLButtonElement>('button[aria-label="Drag to reorder Purl"]')!;
    expect(container.querySelector('button[aria-label="Move Purl up"]')).toBeNull();
    act(() => {
      grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(useDocStore.getState().quickSymbolIds.slice(0, 3)).toEqual(["purl", "knit", "yarn_over"]);
  });

  it("disables Move up on the first quick slot and Move down on the last, enabling everything in between", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "yarn_over"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });
    openSteppers();

    const upButton = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} up"]`);
    const downButton = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} down"]`);

    expect(upButton("Knit")?.disabled).toBe(true);
    expect(downButton("Knit")?.disabled).toBe(false);

    expect(upButton("Purl")?.disabled).toBe(false);
    expect(downButton("Purl")?.disabled).toBe(false);

    expect(upButton("Yarn over")?.disabled).toBe(false);
    expect(downButton("Yarn over")?.disabled).toBe(true);
  });

  it("moves a quick slot up one position when its Move up control is activated", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "yarn_over"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });
    openSteppers();

    const purlUp = container.querySelector<HTMLButtonElement>('button[aria-label="Move Purl up"]')!;
    act(() => {
      purlUp.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(useDocStore.getState().quickSymbolIds).toEqual(["purl", "knit", "yarn_over"]);
  });

  it("disables Move up/down at the ends of the overflow (non-slotted) list independently of the quick row", () => {
    useDocStore.setState({
      // Only "knit" is slotted; "purl" and "yarn_over" overflow into the
      // plain glossary list below the numbered quick row.
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });
    openSteppers();

    const upButton = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} up"]`);
    const downButton = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} down"]`);

    // "knit" is the sole quick-row slot - both ends of its own (one-item)
    // list, per the quick-row's own slot-index bounds.
    expect(upButton("Knit")?.disabled).toBe(true);
    expect(downButton("Knit")?.disabled).toBe(true);

    // "purl" is first in the overflow list, "yo" is last.
    expect(upButton("Purl")?.disabled).toBe(true);
    expect(downButton("Purl")?.disabled).toBe(false);
    expect(upButton("Yarn over")?.disabled).toBe(false);
    expect(downButton("Yarn over")?.disabled).toBe(true);
  });

  it("moves an overflow glossary item when its Move up/down control is activated", () => {
    // "knit" is slotted and so excluded from the overflow list entirely -
    // its presence ahead of "purl"/"yarn_over" in glossaryIds is exactly
    // the case the overflow index must be translated past (the fix for the
    // reported index-mapping bug).
    useDocStore.setState({
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });
    openSteppers();

    const purlDown = container.querySelector<HTMLButtonElement>('button[aria-label="Move Purl down"]')!;
    act(() => {
      purlDown.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(useDocStore.getState().glossaryIds).toEqual(["knit", "yarn_over", "purl"]);
  });

  it("swaps the remove button for a more menu holding a disabled, explained Remove once a stitch has placements", () => {
    useDocStore.setState({
      index: DocIndex.from([{ id: "p1", symbolId: "knit", col: 0, row: 0 }]),
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    expect(container.querySelector('button[aria-label="Remove Knit from glossary"]')).toBeNull();
    const more = container.querySelector<HTMLButtonElement>('button[aria-label="More actions for Knit"]');
    expect(more).not.toBeNull();
    act(() => more!.click());

    const items = [...document.querySelectorAll<HTMLButtonElement>('.glossary__menu [role="menuitem"]')];
    expect(items.map((item) => item.querySelector("span")?.textContent)).toEqual([
      "Select all 1 placed",
      "Remove from glossary",
    ]);
    const remove = items[1]!;
    expect(remove.disabled).toBe(true);
    expect(remove.title).toBe("Placed on the chart - erase those stitches first");
  });

  it("blocks removing a stitch that's only used inside a motif, naming the motif", () => {
    useDocStore.setState({
      index: DocIndex.from([]),
      quickSymbolIds: ["knit", "purl"],
      glossaryIds: ["knit", "purl"],
      repeats: [{ id: "m", name: "Leaf", width: 1, height: 1, stitches: [{ symbolId: "purl", col: 0, row: 0 }] }],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    expect(container.querySelector('button[aria-label="Remove Purl from glossary"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="More actions for Purl"]')!.click());
    const remove = [...document.querySelectorAll<HTMLButtonElement>('.glossary__menu [role="menuitem"]')].at(-1)!;
    expect(remove.disabled).toBe(true);
    expect(remove.title).toBe("Used in Leaf");
  });

  it("still shows an active remove button for a quick-slotted stitch with no placements", () => {
    useDocStore.setState({
      index: DocIndex.from([]),
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Knit from glossary"]',
    );
    expect(removeButton).not.toBeNull();
    expect(removeButton?.disabled).toBe(false);
  });
});
