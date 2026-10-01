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

  it("disables Move up on the first quick slot and Move down on the last, enabling everything in between", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "yarn_over"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

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

  it("shows a disabled remove control with the explanatory tooltip once a quick-slotted stitch has placements", () => {
    useDocStore.setState({
      index: DocIndex.from([{ id: "p1", symbolId: "knit", col: 0, row: 0 }]),
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Remove placed stitches of this kind first"]',
    );
    expect(removeButton).not.toBeNull();
    expect(removeButton?.disabled).toBe(true);
    expect(removeButton?.title).toBe("Remove placed stitches of this kind first");
    // The old unexplained blank spacer must be gone for this row.
    expect(container.querySelector(".glossary__removeSlot")).toBeNull();
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
