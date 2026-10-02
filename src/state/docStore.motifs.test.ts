import { beforeEach, describe, expect, it } from "vitest";
import { motifKey } from "../model/motifs";
import type { Placement } from "../model/types";
import { useDocStore } from "./docStore";

const doc = () => useDocStore.getState();

const open = (placements: Placement[]) =>
  doc().openChart({
    meta: { id: "c", name: "c", createdAt: "", updatedAt: "", rev: "r" },
    placements,
    unknownSymbolIds: [],
  });

const at = (col: number, row: number) => doc().index.placementAt(col, row);

/** A 3x1 motif "k2tog, knit, purl" made from stitches at cols 0..2, row 0. */
function makeMotif(): string {
  open([
    { id: "a", symbolId: "k2tog", col: 0, row: 0 },
    { id: "b", symbolId: "knit", col: 1, row: 0 },
    { id: "c", symbolId: "purl", col: 2, row: 0 },
  ]);
  return doc().createRepeat(["a", "b", "c"])!;
}

const motif = (id: string) => doc().repeats.find((r) => r.id === id)!;

describe("motif copies", () => {
  beforeEach(() => useDocStore.setState({ meta: null }));

  it("registers the source selection as the first linked copy", () => {
    const id = makeMotif();
    expect(motif(id).copies).toEqual([{ id: at(0, 0)!.groupId, col: 0, row: 0 }]);
  });

  it("stamps linked copies and refuses ones that would overwrite", () => {
    const id = makeMotif();
    doc().place("knit", 11, 5);
    expect(doc().stampMotif(id, [{ col: 0, row: 5 }, { col: 10, row: 5 }, { col: 0, row: 10 }])).toBe(2);
    expect(at(0, 5)!.symbolId).toBe("k2tog");
    expect(at(11, 5)!.groupId).toBeUndefined();
    expect(motif(id).copies).toHaveLength(3);
    expect(doc().canStampMotif(id, { col: 10, row: 5 })).toBe(false);

    doc().undo();
    expect(at(0, 5)).toBeUndefined();
    expect(motif(id).copies).toHaveLength(1);
  });

  it("stamps a mirrored copy with knitting-aware symbols", () => {
    const id = makeMotif();
    doc().stampMotif(id, [{ col: 0, row: 5 }], true);
    expect([at(0, 5)!.symbolId, at(1, 5)!.symbolId, at(2, 5)!.symbolId]).toEqual(["purl", "knit", "skpo"]);
  });

  it("joins a stitch painted into a copy's footprint and pushes it to every copy, keeping their overrides", () => {
    const id = makeMotif();
    doc().stampMotif(id, [{ col: 0, row: 5 }, { col: 0, row: 10 }]);
    // Copy at row 10 has its own override.
    doc().place("yarn_over", 2, 10);
    // Edit the copy at row 5, then push.
    doc().place("ssp", 1, 5);
    const copyId = at(1, 5)!.groupId!;
    expect(copyId).toBe(at(0, 5)!.groupId);

    doc().pushMotifCopy(copyId);
    expect(motif(id).stitches.map((s) => s.symbolId)).toEqual(["k2tog", "ssp", "purl"]);
    expect(at(1, 0)!.symbolId).toBe("ssp");
    expect(at(1, 10)!.symbolId).toBe("ssp");
    expect(at(2, 10)!.symbolId).toBe("yarn_over");

    doc().undo();
    expect(at(1, 0)!.symbolId).toBe("knit");
    expect(motif(id).stitches.map((s) => s.symbolId)).toEqual(["k2tog", "knit", "purl"]);
  });

  it("resets a copy's overrides and detaches a copy", () => {
    const id = makeMotif();
    const copyId = at(0, 0)!.groupId!;
    doc().erase(1, 0);
    doc().resetMotifCopy(copyId);
    expect(at(1, 0)!.symbolId).toBe("knit");
    expect(at(1, 0)!.groupId).toBe(copyId);

    doc().detachMotifCopy(copyId);
    expect(at(1, 0)!.groupId).toBeUndefined();
    expect(motif(id).copies).toEqual([]);
  });

  it("moves a copy's origin when the whole copy moves, and drops a copy with no stitches left", () => {
    const id = makeMotif();
    const ids = doc().index.toArray().map((p) => p.id);
    doc().movePlacements(ids, 4, 2);
    expect(motif(id).copies![0]).toMatchObject({ col: 4, row: 2 });
    doc().erasePlacements(doc().index.toArray().map((p) => p.id));
    expect(motif(id).copies).toEqual([]);
  });

  it("links a duplicated whole copy as a new copy", () => {
    const id = makeMotif();
    const ids = doc().index.toArray().map((p) => p.id);
    doc().duplicatePlacementsAt(ids, 0, 3);
    expect(motif(id).copies).toHaveLength(2);
    expect(motif(id).copies![1]).toMatchObject({ col: 0, row: 3, id: at(0, 3)!.groupId });
  });

  it("mirrors a copy in place, overrides included", () => {
    const id = makeMotif();
    const copyId = at(0, 0)!.groupId!;
    doc().mirrorMotifCopy(copyId);
    expect([at(0, 0)!.symbolId, at(2, 0)!.symbolId]).toEqual(["purl", "skpo"]);
    expect(motif(id).copies![0]!.mirrored).toBe(true);
    doc().mirrorMotifCopy(copyId);
    expect(motif(id).copies![0]!.mirrored).toBeUndefined();
  });

  it("links a pasted whole copy", () => {
    const id = makeMotif();
    const sources = doc().index.toArray();
    doc().beginStroke();
    for (const p of sources) doc().place(p.symbolId, p.col, p.row + 4);
    doc().linkPastedPlacements(sources, 0, 4);
    doc().endStroke();
    expect(motif(id).copies).toHaveLength(2);
    expect(at(1, 4)!.groupId).toBe(motif(id).copies![1]!.id);
    doc().undo();
    expect(motif(id).copies).toHaveLength(1);
    expect(at(1, 4)).toBeUndefined();
  });

  it("renames, and deletes a motif either detaching or deleting its copies", () => {
    const id = makeMotif();
    doc().renameMotif(id, "  Leaf  ");
    expect(motif(id).name).toBe("Leaf");
    doc().setQuickSymbolIds(["knit", motifKey(id)]);

    doc().deleteMotif(id, "detach");
    expect(doc().repeats).toEqual([]);
    expect(at(0, 0)!.groupId).toBeUndefined();
    expect(doc().quickSymbolIds).toEqual(["knit", ""]);

    doc().undo();
    doc().deleteMotif(id, "delete");
    expect(doc().index.size).toBe(0);
  });
});
