import { beforeEach, describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { useDocStore } from "./docStore";
import { SUGGEST_SYMBOL_ID, useUiStore } from "./uiStore";
import { applyColorToSlot } from "../ui/colorwork";

const RED = "#e11d48";
const BLUE = "#0ea5e9";

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

beforeEach(resetDoc);

describe("place with colorId (FR-22)", () => {
  it("an uncolored placement carries no colorId at all", () => {
    useDocStore.getState().place("knit", 0, 0);
    const placement = [...useDocStore.getState().index.placements.values()][0]!;
    expect("colorId" in placement).toBe(false);
  });

  it("a colored placement carries the given colorId", () => {
    useDocStore.getState().place("knit", 0, 0, undefined, undefined, RED);
    const placement = [...useDocStore.getState().index.placements.values()][0]!;
    expect(placement.colorId).toBe(RED);
  });
});

describe("colored quick-slot promotion", () => {
  it("moves a newly placed uncolored stitch ahead of unplaced defaults", () => {
    useDocStore.getState().place("sl_wyif", 0, 0);
    useDocStore.getState().addQuickSlot("sl_wyif");

    expect(useDocStore.getState().quickSymbolIds).toEqual(["sl_wyif", "knit", "purl"]);
  });

  it("moves a new colored swatch ahead of unplaced default stitches", () => {
    useDocStore.getState().addQuickSlot("knit::" + RED);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit::" + RED, "knit", "purl"]);
  });

  it("does not displace a plain stitch that is already placed", () => {
    useDocStore.getState().place("knit", 0, 0);
    useDocStore.getState().addQuickSlot("purl::" + RED);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "purl::" + RED, "purl"]);
  });

  it("promotes a recolored unplaced default stitch too", () => {
    useDocStore.getState().recolorQuickSlot("purl", "purl::" + RED, []);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["purl::" + RED, "knit"]);
  });

  it("keeps an already-promoted swatch in place instead of demoting it past the default it passed", () => {
    // Place, promote (as above), then color the same placement - the
    // completely normal next step after placing a new stitch.
    useDocStore.getState().place("sl_wyif", 0, 0);
    useDocStore.getState().addQuickSlot("sl_wyif");
    expect(useDocStore.getState().quickSymbolIds).toEqual(["sl_wyif", "knit", "purl"]);
    const placement = useDocStore.getState().index.placementAt(0, 0)!;

    applyColorToSlot({ key: "sl_wyif", symbolId: "sl_wyif", placementIds: [placement.id] }, RED);

    // sl_wyif::RED must stay ahead of "knit", the unplaced default it was
    // already ahead of - not get walked past it to slot 0's target index.
    expect(useDocStore.getState().quickSymbolIds).toEqual(["sl_wyif::" + RED, "knit", "purl"]);
  });

  it("does not let a still-pending Suggest guess block a genuinely placed stitch from promoting", () => {
    // A pending (unconfirmed) suggestion of "knit" - never reviewed.
    useDocStore.getState().place("knit", 3, 3, true);
    // A real, confirmed placement of a brand new stitch.
    useDocStore.getState().place("sl_wyif", 0, 0);

    useDocStore.getState().addQuickSlot("sl_wyif");

    // Matches the no-pending-suggestion case above: a pending guess isn't
    // something the designer has actually drawn, so it must not count as
    // "placed" for promotion purposes (consistent with countConfirmedStitches
    // and selectableGlossaryEntryPlacementIds elsewhere in the glossary).
    expect(useDocStore.getState().quickSymbolIds).toEqual(["sl_wyif", "knit", "purl"]);
  });
});

describe("recolorQuickSlot (DNT-12 - load-bearing)", () => {
  it("renames the slot in place when no sibling shares the old combo", () => {
    useDocStore.getState().setQuickSymbolIds(["knit"]);
    useDocStore.getState().place("knit", 0, 0, undefined, undefined, RED);
    const [placement] = [...useDocStore.getState().index.placements.values()];

    useDocStore.getState().recolorQuickSlot("knit", "knit::" + RED, [placement!.id]);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit::" + RED]);
  });

  it("mints a new slot instead of renaming when a sibling still uses the old combo - the exact previously-shipped bug", () => {
    // Two plain knit placements on the chart; only one is being recolored.
    useDocStore.getState().place("knit", 0, 0);
    useDocStore.getState().place("knit", 1, 0);
    useDocStore.getState().setQuickSymbolIds(["knit"]);
    const [recoloring] = [...useDocStore.getState().index.placements.values()]
      .filter((p) => p.col === 0);

    useDocStore.getState().recolorQuickSlot("knit", "knit::" + RED, [recoloring!.id]);

    // The original "knit" slot must survive untouched - the sibling at
    // col 1 is still a plain knit and must not be silently orphaned.
    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "knit::" + RED]);
  });

  it("empties an older slot that already holds the resulting pen, rather than bailing (DNT-10)", () => {
    // An older slot already holds "knit::RED" - not a sibling of the combo
    // being recolored, so the rename-in-place path runs, but its target key
    // collides with that older slot.
    useDocStore.getState().setQuickSymbolIds(["knit", "knit::" + RED]);
    useDocStore.getState().place("knit", 0, 0);
    const [placement] = [...useDocStore.getState().index.placements.values()];

    useDocStore.getState().recolorQuickSlot("knit", "knit::" + RED, [placement!.id]);

    // Only one "knit::RED" slot survives - the older duplicate is cleared
    // (to a vacant slot, same as any other removal - see `removeQuickSlot`)
    // rather than silently duplicated.
    const slots = useDocStore.getState().quickSymbolIds;
    expect(slots.filter((slot) => slot === "knit::" + RED)).toHaveLength(1);
  });

  it("does nothing when old and new keys are the same", () => {
    useDocStore.getState().setQuickSymbolIds(["knit"]);
    useDocStore.getState().recolorQuickSlot("knit", "knit", []);
    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit"]);
  });

  it("applies the same rename-vs-mint rule to the glossary array", () => {
    useDocStore.getState().setGlossaryIds(["purl"]);
    useDocStore.getState().place("purl", 0, 0);
    const [placement] = [...useDocStore.getState().index.placements.values()];

    useDocStore.getState().recolorQuickSlot("purl", "purl::" + BLUE, [placement!.id]);

    expect(useDocStore.getState().glossaryIds).toEqual(["purl::" + BLUE]);
  });
});

describe("recolor during Suggest review", () => {
  it("keeps Suggest armed after recoloring a stitch resolved from a suggestion", () => {
    useDocStore.getState().place("knit", 0, 0);
    const placement = useDocStore.getState().index.placementAt(0, 0)!;
    useUiStore.setState({ armedSymbolId: SUGGEST_SYMBOL_ID, activeColor: null, tool: "stitch" });

    applyColorToSlot({ key: "knit", symbolId: "knit", placementIds: [placement.id] }, RED);

    expect(useDocStore.getState().index.placementAt(0, 0)?.colorId).toBe(RED);
    expect(useUiStore.getState().armedSymbolId).toBe(SUGGEST_SYMBOL_ID);
    expect(useUiStore.getState().activeColor).toBeNull();
  });
});

describe("recolorPlacements", () => {
  it("recolors exactly the given placements and is undoable", () => {
    useDocStore.getState().place("knit", 0, 0);
    useDocStore.getState().place("knit", 1, 0);
    const ids = [...useDocStore.getState().index.placements.keys()];
    const targetId = useDocStore.getState().index.placementAt(0, 0)!.id;

    useDocStore.getState().recolorPlacements([targetId], RED);

    const recolored = useDocStore.getState().index.placementAt(0, 0);
    const untouched = useDocStore.getState().index.placementAt(1, 0);
    expect(recolored?.colorId).toBe(RED);
    expect(untouched?.colorId).toBeUndefined();

    useDocStore.getState().undo();
    expect(useDocStore.getState().index.placementAt(0, 0)?.colorId).toBeUndefined();
    void ids;
  });
});

describe("chart-scoped glossary/quick-row are not undoable (§6)", () => {
  it("setQuickSymbolIds does not push an undo entry", () => {
    const before = useDocStore.getState().undoStack.length;
    useDocStore.getState().setQuickSymbolIds(["knit", "purl", "yo"]);
    expect(useDocStore.getState().undoStack.length).toBe(before);
  });
});

describe("promoteQuickSlot", () => {
  it("moves an already-slotted key without duplicating it (same as moveQuickSlotTo)", () => {
    useDocStore.getState().setQuickSymbolIds(["knit", "purl", "yo"]);
    useDocStore.getState().promoteQuickSlot("yo", 0);
    expect(useDocStore.getState().quickSymbolIds).toEqual(["yo", "knit", "purl"]);
  });

  it("adds a glossary-only key (e.g. one that only arrived via paste/import) before moving it into place", () => {
    // "purl::RED" has real placements and a glossary entry, but was never
    // an explicit quick pick - exactly the state an imported chart or a
    // duplicate/paste of an older placement can leave behind.
    useDocStore.getState().setQuickSymbolIds(["knit", "purl"]);
    expect(useDocStore.getState().quickSymbolIds).not.toContain("purl::" + RED);

    useDocStore.getState().promoteQuickSlot("purl::" + RED, 2);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "purl", "purl::" + RED]);
  });

  it("fills an already-empty target slot directly, without disturbing other slots (#259)", () => {
    // Regression: dragging an overflow entry onto an empty quick slot used
    // to route through addQuickSlot's first-vacant-slot placement, then walk
    // it back to the drop target via a chain of adjacent swaps - dragging
    // every occupied slot in between along with it, even though the target
    // was already empty and could be filled with zero disruption.
    useDocStore.getState().setQuickSymbolIds(["knit", "", "yo"]);

    useDocStore.getState().promoteQuickSlot("m1l", 1);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "m1l", "yo"]);
  });

  it("extends the slot array with empty strings when the empty target slot is past the end", () => {
    useDocStore.getState().setQuickSymbolIds(["knit", "purl"]);

    useDocStore.getState().promoteQuickSlot("yo", 4);

    expect(useDocStore.getState().quickSymbolIds).toEqual(["knit", "purl", "", "", "yo"]);
  });
});

describe("moveGlossaryIdTo", () => {
  it("reorders an existing glossary entry", () => {
    useDocStore.getState().setGlossaryIds(["knit", "purl", "yo"]);
    useDocStore.getState().moveGlossaryIdTo("yo", 0);
    expect(useDocStore.getState().glossaryIds).toEqual(["yo", "knit", "purl"]);
  });

  it("inserts a placement-derived entry that was never explicitly added to the glossary list", () => {
    useDocStore.getState().setGlossaryIds(["knit", "purl"]);
    useDocStore.getState().moveGlossaryIdTo("purl::" + BLUE, 1);
    expect(useDocStore.getState().glossaryIds).toEqual(["knit", "purl::" + BLUE, "purl"]);
  });
});
