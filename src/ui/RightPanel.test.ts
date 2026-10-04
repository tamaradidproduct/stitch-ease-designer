// @vitest-environment jsdom
import { act, createElement } from "react";
import { describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { setupReactRoot } from "../test/reactRoot";
import { RightPanel } from "./RightPanel";

const dom = setupReactRoot();

describe("RightPanel glossary row arming semantics (issue #323)", () => {
  /**
   * Characterization coverage for issue #323's "arming unification": before
   * extracting a shared `GlossaryRow`, a slotted quick-row row armed via
   * `setArmedSymbolId` alone (pure arm - the item's already in a quick
   * slot, nothing to promote), while an overflow row armed via
   * `chooseSymbol`, which also promotes the item into a free quick slot.
   * The refactor makes this an explicit, named `armMode` on `GlossaryRow`
   * rather than an implicit side effect of which copy-pasted block renders
   * - it's deliberately preserved, not unified, so these two tests pin the
   * exact pre-refactor behavior for each row kind.
   */
  it("arms a slotted quick-row row as arm-only: no quick-slot mutation", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "", "", ""],
      glossaryIds: ["knit", "purl"],
    });

    dom.render(createElement(RightPanel));

    const knitRow = dom.container.querySelector('div.glossary__item[data-arm-mode="arm-only"]');
    expect(knitRow).toBeTruthy();
    const armButton = knitRow!.querySelector<HTMLButtonElement>(".glossary__arm");
    expect(armButton).toBeTruthy();
    const quickSymbolIdsBefore = [...useDocStore.getState().quickSymbolIds];

    act(() => {
      armButton!.click();
    });

    expect(useUiStore.getState().armedSymbolId).toBe("knit");
    // Pure arm - the already-slotted item's quick-slot assignment is untouched.
    expect(useDocStore.getState().quickSymbolIds).toEqual(quickSymbolIdsBefore);
  });

  it("arms an overflow row as arm-and-promote: also assigns it a free quick slot", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "", "", ""],
      glossaryIds: ["knit", "purl", "ktbl"],
    });

    dom.render(createElement(RightPanel));

    const overflowRow = dom.container.querySelector('div.glossary__item[data-arm-mode="arm-and-promote"]');
    expect(overflowRow).toBeTruthy();
    const armButton = overflowRow!.querySelector<HTMLButtonElement>(".glossary__arm");
    expect(armButton).toBeTruthy();
    expect(useDocStore.getState().quickSymbolIds.includes("ktbl")).toBe(false);

    act(() => {
      armButton!.click();
    });

    expect(useUiStore.getState().armedSymbolId).toBe("ktbl");
    // Promoted into the first free quick slot (#271's addQuickSlot/chooseSymbol),
    // not just armed in place like the slotted row above.
    expect(useDocStore.getState().quickSymbolIds).toContain("ktbl");
  });

  /**
   * Characterization coverage for issue #323's unified `ColorChip`
   * rendering: FR-34/Bug 8 says every plain (uncolored) glossary row gets
   * the color chip and every colored row never does, regardless of
   * whether the row is a slotted quick-row entry or an overflow one. Pinned
   * here across all four combinations before `GlossaryRow` took over
   * rendering both row kinds' chip.
   */
  it("shows the color chip only on plain rows, for both slotted and overflow rows", () => {
    const red = "#fecdd3";
    useDocStore.setState({
      // Slot 0: plain slotted. Slot 1: colored slotted.
      quickSymbolIds: ["knit", `purl::${red}`, "", "", ""],
      // Overflow: one plain ("ktbl"), one colored ("p3::red").
      glossaryIds: ["ktbl", `p3::${red}`],
    });

    dom.render(createElement(RightPanel));

    const rows = dom.container.querySelectorAll("div.glossary__item");
    // knit (slotted, plain), purl::red (slotted, colored), ktbl (overflow,
    // plain), p3::red (overflow, colored) - in that DOM order.
    expect(rows.length).toBe(4);
    const [slottedPlain, slottedColored, overflowPlain, overflowColored] = Array.from(rows);

    expect(slottedPlain!.querySelector(".glossary__colorChip")).toBeTruthy();
    expect(slottedColored!.querySelector(".glossary__colorChip")).toBeNull();
    expect(overflowPlain!.querySelector(".glossary__colorChip")).toBeTruthy();
    expect(overflowColored!.querySelector(".glossary__colorChip")).toBeNull();
  });
});

/**
 * Regression coverage for issue #308 (reopened #251, after #279): the inline
 * "Add stitch" search box that temporarily replaces an empty quick slot's
 * button had no onDragOver/onDrop handlers at all, unlike the plain
 * empty-slot button it stands in for - so dropping an overflow ("more
 * stitches") chip onto a slot while its search box happened to be open fell
 * through to default browser drag behavior instead of filling the slot.
 */
describe("RightPanel quick-slot drop targets (issue #308)", () => {
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

    dom.render(createElement(RightPanel));

    // slotCount is max(5, quickSymbolIds.length + 1), so slots 1, 3 and 4 are
    // all empty here; slot 1 (the first empty one in DOM order) is the one
    // whose search box gets opened below.
    const emptySlotButtonsBefore = dom.container.querySelectorAll(".glossary__item--empty");
    expect(emptySlotButtonsBefore.length).toBe(3);
    const emptySlotButton = emptySlotButtonsBefore[0]!;

    // Opens the inline search box on that empty slot, replacing its plain
    // empty-slot button with the (previously un-wired) search branch.
    act(() => {
      (emptySlotButton as HTMLButtonElement).click();
    });

    const searchBox = dom.container.querySelector(".glossary__inlineSearch");
    expect(searchBox).toBeTruthy();
    // Only the clicked slot (1) swapped to the search branch - the other two
    // empty slots (3, 4) are untouched.
    expect(dom.container.querySelectorAll(".glossary__item--empty").length).toBe(2);

    const overflowHandle = dom.container.querySelector(
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
    expect(dom.container.querySelector(".glossary__inlineSearch")).toBeNull();
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

    dom.render(createElement(RightPanel));

    // DOM order of filled quick-row drag handles matches quickSymbolIds:
    // knit (0), purl (1), ktbl (2).
    const handles = dom.container.querySelectorAll('.glossary__dragHandle[title="Drag to reorder - or ↑/↓"]');
    expect(handles.length).toBe(3);
    const rows = dom.container.querySelectorAll('div.glossary__item[data-arm-mode="arm-only"]');
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

    dom.render(createElement(RightPanel));

    const overflowHandle = dom.container.querySelector(
      '.glossary__dragHandle[title^="Drag to reorder, or onto a numbered slot"]',
    );
    expect(overflowHandle).toBeTruthy();
    const emptySlotButton = dom.container.querySelector(".glossary__item--empty");
    expect(emptySlotButton).toBeTruthy();

    fireDragEvent(overflowHandle!, "dragstart");
    fireDragEvent(emptySlotButton!, "dragover");
    fireDragEvent(emptySlotButton!, "drop");

    expect(useDocStore.getState().quickSymbolIds[1]).toBe("ktbl");
  });
});

/**
 * Issue #326: keyboard/touch reorder controls for the glossary/quick row,
 * added beside the existing drag-and-drop (which this suite leaves
 * untouched - see the #308 suite above for that coverage), plus
 * the disabled remove control's explanatory tooltip.
 */
describe("RightPanel move up/down controls (issue #326)", () => {
  /** Up/down live in each row's grip stepper, opened by tapping the grip. */
  const openSteppers = () =>
    act(() => {
      for (const grip of dom.container.querySelectorAll<HTMLButtonElement>("button.glossary__dragHandle")) grip.click();
    });

  it("moves a row with the arrow keys once its grip is focused", () => {
    useDocStore.setState({
      quickSymbolIds: ["knit", "purl", "yarn_over"],
      glossaryIds: ["knit", "purl", "yarn_over"],
    });
    dom.render(createElement(RightPanel));
    const grip = dom.container.querySelector<HTMLButtonElement>('button[aria-label="Drag to reorder Purl"]')!;
    expect(dom.container.querySelector('button[aria-label="Move Purl up"]')).toBeNull();
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

    dom.render(createElement(RightPanel));
    openSteppers();

    const upButton = (label: string) =>
      dom.container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} up"]`);
    const downButton = (label: string) =>
      dom.container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} down"]`);

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

    dom.render(createElement(RightPanel));
    openSteppers();

    const purlUp = dom.container.querySelector<HTMLButtonElement>('button[aria-label="Move Purl up"]')!;
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

    dom.render(createElement(RightPanel));
    openSteppers();

    const upButton = (label: string) =>
      dom.container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} up"]`);
    const downButton = (label: string) =>
      dom.container.querySelector<HTMLButtonElement>(`button[aria-label="Move ${label} down"]`);

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

    dom.render(createElement(RightPanel));
    openSteppers();

    const purlDown = dom.container.querySelector<HTMLButtonElement>('button[aria-label="Move Purl down"]')!;
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

    dom.render(createElement(RightPanel));

    expect(dom.container.querySelector('button[aria-label="Remove Knit from glossary"]')).toBeNull();
    const more = dom.container.querySelector<HTMLButtonElement>('button[aria-label="More actions for Knit"]');
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

    dom.render(createElement(RightPanel));

    expect(dom.container.querySelector('button[aria-label="Remove Purl from glossary"]')).toBeNull();
    act(() => dom.container.querySelector<HTMLButtonElement>('button[aria-label="More actions for Purl"]')!.click());
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

    dom.render(createElement(RightPanel));

    const removeButton = dom.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Knit from glossary"]',
    );
    expect(removeButton).not.toBeNull();
    expect(removeButton?.disabled).toBe(false);
  });
});

describe("RightPanel glossary consistency (2026-10-03 picker/glossary review)", () => {
  const motif = (id: string, name: string, copies: { id: string; col: number; row: number }[] = []) => ({
    id,
    name,
    width: 1,
    height: 1,
    stitches: [{ symbolId: "knit", col: 0, row: 0 }],
    copies,
  });
  const typeInto = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("counts a colored stitch apart from its plain one, and counts motifs, in the header", () => {
    useDocStore.setState({
      index: DocIndex.from([]),
      quickSymbolIds: ["knit", "knit::#e11d48"],
      glossaryIds: ["knit", "knit::#e11d48"],
      repeats: [motif("m1", "Leaf")],
    });
    dom.render(createElement(RightPanel));
    expect(dom.container.querySelector(".sideModule__header span")?.textContent).toBe(
      "2 stitch types · 1 motif in this chart",
    );
  });

  it("counts neither stitches inside motif copies nor the stitches a cable is worked as", () => {
    useDocStore.setState({
      index: DocIndex.from([
        { id: "a", symbolId: "knit", col: 0, row: 0 },
        { id: "b", symbolId: "knit", col: 1, row: 0, groupId: "copy-1" },
        { id: "c", symbolId: "1_1_left_cable", col: 2, row: 0 },
      ]),
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit"],
      repeats: [motif("m1", "Leaf", [{ id: "copy-1", col: 1, row: 0 }])],
    });
    dom.render(createElement(RightPanel));
    const knitRow = dom.container.querySelector('button[aria-label="Drag to reorder Knit"]')!.closest(".glossary__item")!;
    expect(knitRow.querySelector(".glossary__countText")?.textContent).toBe("(1)");
  });

  it("deletes a slotted motif with no copies from its X, like an unplaced stitch", () => {
    useDocStore.setState({
      index: DocIndex.from([]),
      quickSymbolIds: ["knit", "motif:m1"],
      glossaryIds: ["knit"],
      repeats: [motif("m1", "Leaf")],
    });
    dom.render(createElement(RightPanel));
    act(() => {
      dom.container.querySelector<HTMLButtonElement>('button[aria-label="Remove Leaf from glossary"]')!.click();
    });
    expect(useDocStore.getState().repeats).toEqual([]);
  });

  it("reorders unslotted motifs with Move up/down", () => {
    useDocStore.setState({
      index: DocIndex.from([]),
      quickSymbolIds: ["knit"],
      glossaryIds: ["knit"],
      repeats: [motif("m1", "Leaf"), motif("m2", "Vine")],
    });
    dom.render(createElement(RightPanel));
    act(() => {
      dom.container.querySelector<HTMLButtonElement>('button[aria-label="Drag to reorder Vine"]')!.click();
    });
    const up = dom.container.querySelector<HTMLButtonElement>('button[aria-label="Move Vine up"]')!;
    expect(up.disabled).toBe(false);
    act(() => up.click());
    expect(useDocStore.getState().repeats.map((r) => r.id)).toEqual(["m2", "m1"]);
  });

  it("finds a motif by name in the search and arms it when picked", () => {
    useDocStore.setState({
      index: DocIndex.from([]),
      quickSymbolIds: ["knit", "purl"],
      glossaryIds: ["knit", "purl"],
      repeats: [motif("m1", "Leaf")],
    });
    dom.render(createElement(RightPanel));
    act(() => {
      dom.container.querySelector<HTMLButtonElement>(".glossary__item--empty")!.click();
    });
    const input = dom.container.querySelector<HTMLInputElement>('input[aria-label="Search stitches to add"]')!;
    // Nothing typed: browse only what isn't in the glossary yet.
    expect(dom.container.querySelector("#glossary-search-result-stitch-knit")).toBeNull();
    expect(dom.container.querySelector("#glossary-search-result-motif-m1")).toBeNull();
    expect(dom.container.querySelector("#glossary-search-result-stitch-yarn_over")?.textContent).toContain("Select");

    typeInto(input, "leaf");
    const result = dom.container.querySelector<HTMLButtonElement>("#glossary-search-result-motif-m1")!;
    expect(result.textContent).toContain("Added");
    act(() => result.click());
    expect(useUiStore.getState().armedMotif?.id).toBe("m1");
  });
});
