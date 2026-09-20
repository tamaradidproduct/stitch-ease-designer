import { beforeEach, describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import { useDocStore } from "./docStore";

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
