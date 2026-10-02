// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { RightPanel } from "./RightPanel";

// Needed for React 18/19's act() to run without its "not configured to
// support act(...)" warning outside of a testing-library-managed environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression coverage for issue #308 (reopened #251, after #279): the inline
 * "Add stitch" search box that temporarily replaces an empty quick slot's
 * button had no onDragOver/onDrop handlers at all, unlike the plain
 * empty-slot button it stands in for - so dropping an overflow ("more
 * stitches") chip onto a slot while its search box happened to be open fell
 * through to default browser drag behavior instead of filling the slot.
 */
describe("RightPanel quick-slot drop targets (issue #308)", () => {
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

  function fireDragEvent(el: Element, type: string) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { effectAllowed: "", dropEffect: "", setData: () => {}, getData: () => "" },
    });
    act(() => {
      el.dispatchEvent(event);
    });
  }

  it("fills a slot exactly like the plain empty-slot case when an overflow chip is dropped while its search box is open", () => {
    // Slot 1 stays empty (so opening its search box replaces the plain
    // empty-slot button); "ktbl" is only in the overflow/"more stitches"
    // list, never in a numbered quick slot.
    useDocStore.setState({
      quickSymbolIds: ["knit", "", "purl"],
      glossaryIds: ["knit", "purl", "ktbl"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    // slotCount is max(5, quickSymbolIds.length + 1), so slots 1, 3 and 4 are
    // all empty here; slot 1 (the first empty one in DOM order) is the one
    // whose search box gets opened below.
    const emptySlotButtonsBefore = container.querySelectorAll(".glossary__item--empty");
    expect(emptySlotButtonsBefore.length).toBe(3);
    const emptySlotButton = emptySlotButtonsBefore[0]!;

    // Opens the inline search box on that empty slot, replacing its plain
    // empty-slot button with the (previously un-wired) search branch.
    act(() => {
      (emptySlotButton as HTMLButtonElement).click();
    });

    const searchBox = container.querySelector(".glossary__inlineSearch");
    expect(searchBox).toBeTruthy();
    // Only the clicked slot (1) swapped to the search branch - the other two
    // empty slots (3, 4) are untouched.
    expect(container.querySelectorAll(".glossary__item--empty").length).toBe(2);

    const overflowHandle = container.querySelector(
      '.glossary__dragHandle[title^="Drag to reorder, or onto a numbered slot"]',
    );
    expect(overflowHandle).toBeTruthy();

    fireDragEvent(overflowHandle!, "dragstart");
    fireDragEvent(searchBox!, "dragover");
    fireDragEvent(searchBox!, "drop");

    expect(useDocStore.getState().quickSymbolIds[1]).toBe("ktbl");
    // The drop must close the search box (searchSlot/glossaryQuery reset)
    // the same way chooseSearchResult does, or it leaks back open the next
    // time this slot becomes empty.
    expect(container.querySelector(".glossary__inlineSearch")).toBeNull();
  });

  /**
   * Characterization coverage for issue #323's `useQuickSlotDropTarget`
   * extraction: pins each of the 3 consolidated drop targets' pre-refactor
   * behavior (a filled slot's push/reorder, a plain empty slot's fill, and
   * - above - the inline-search-slot's fill) so none of them silently
   * changed shape when their three hand-rolled copies became one hook.
   */
  it("pushes/reorders via a filled quick slot's own drop target (#271)", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "ktbl", "", ""],
      glossaryIds: ["knit", "purl", "ktbl"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    // DOM order of filled quick-row drag handles matches quickSymbolIds:
    // knit (0), purl (1), ktbl (2).
    const handles = container.querySelectorAll('.glossary__dragHandle[title="Drag to reorder - or ↑/↓"]');
    expect(handles.length).toBe(3);
    const rows = container.querySelectorAll('div.glossary__item[data-arm-mode="arm-only"]');
    expect(rows.length).toBe(3);
    const draggedHandle = handles[2]!; // ktbl
    const targetRow = rows[0]!; // knit

    fireDragEvent(draggedHandle, "dragstart");
    fireDragEvent(targetRow, "dragover");
    fireDragEvent(targetRow, "drop");

    // Dropping ktbl onto knit's slot pushes everything between them along
    // rather than swapping in place (moveQuickSlotTo's walk-by-neighbour).
    expect(useDocStore.getState().quickSymbolIds.slice(0, 3)).toEqual(["ktbl", "knit", "purl"]);
  });

  it("fills a plain empty quick slot via its own drop target", () => {
    // Slot 1 stays empty and its search box is never opened here, unlike
    // the inline-search-slot test above - this is the plain empty-slot
    // button branch.
    useDocStore.setState({
      quickSymbolIds: ["knit", "", "purl"],
      glossaryIds: ["knit", "purl", "ktbl"],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    const overflowHandle = container.querySelector(
      '.glossary__dragHandle[title^="Drag to reorder, or onto a numbered slot"]',
    );
    expect(overflowHandle).toBeTruthy();
    const emptySlotButton = container.querySelector(".glossary__item--empty");
    expect(emptySlotButton).toBeTruthy();

    fireDragEvent(overflowHandle!, "dragstart");
    fireDragEvent(emptySlotButton!, "dragover");
    fireDragEvent(emptySlotButton!, "drop");

    expect(useDocStore.getState().quickSymbolIds[1]).toBe("ktbl");
  });
});
