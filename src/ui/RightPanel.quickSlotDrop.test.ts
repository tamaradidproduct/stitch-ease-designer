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
  });
});
