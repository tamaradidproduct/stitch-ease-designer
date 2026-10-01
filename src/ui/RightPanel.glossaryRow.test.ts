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

describe("RightPanel glossary row arming semantics (issue #323)", () => {
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

    act(() => {
      root.render(createElement(RightPanel));
    });

    const knitRow = container.querySelector('div.glossary__item[data-arm-mode="arm-only"]');
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

    act(() => {
      root.render(createElement(RightPanel));
    });

    const overflowRow = container.querySelector('div.glossary__item[data-arm-mode="arm-and-promote"]');
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
   * Characterization coverage for issue #323's unified add-only `ColorChip`
   * rendering: FR-34/Bug 8 says every plain (uncolored) glossary row gets
   * the add-only color chip and every colored row never does, regardless of
   * whether the row is a slotted quick-row entry or an overflow one. Pinned
   * here across all four combinations before `GlossaryRow` took over
   * rendering both row kinds' chip.
   */
  it("shows the add-only color chip only on plain rows, for both slotted and overflow rows", () => {
    const red = "#fecdd3";
    useDocStore.setState({
      // Slot 0: plain slotted. Slot 1: colored slotted.
      quickSymbolIds: ["knit", `purl::${red}`, "", "", ""],
      // Overflow: one plain ("ktbl"), one colored ("p3::red").
      glossaryIds: ["ktbl", `p3::${red}`],
    });

    act(() => {
      root.render(createElement(RightPanel));
    });

    const rows = container.querySelectorAll("div.glossary__item");
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
