import { describe, expect, it } from "vitest";
import { getSymbol } from "../symbols/registry";
import { CHUNK, DocIndex } from "./docIndex";
import { apply, canInsertAt, eraseChange, insertChange, mergeChanges, placeChange } from "./ops";
import { isEmptyChange, type Placement } from "./types";

// Anchored to the real library rather than fixtures: if a cable's span changes
// in Figma, these tests should notice.
const CABLE = "3_3_left_cable"; // 6 cells
const WIDE = "4_4_left_cable_hr"; // 12 cells

it("the library has the spans these tests assume", () => {
  expect(getSymbol("knit")?.span).toBe(1);
  expect(getSymbol(CABLE)?.span).toBe(6);
  expect(getSymbol(WIDE)?.span).toBe(12);
});

const place = (index: DocIndex, symbolId: string, col: number, row: number) =>
  apply(index, placeChange(index, symbolId, col, row));

const occupiedCols = (index: DocIndex, row: number, from: number, to: number) => {
  const out: (string | undefined)[] = [];
  for (let c = from; c <= to; c++) out.push(index.placementAt(c, row)?.symbolId);
  return out;
};

describe("multi-cell occupancy", () => {
  it("a 6-cell cable claims all six of its cells", () => {
    const index = DocIndex.from([]);
    place(index, CABLE, 0, 0);

    expect(index.size).toBe(1);
    const id = index.placementAt(0, 0)!.id;
    for (let c = 0; c <= 5; c++) {
      expect(index.occupancy.get(`${c},0`)).toBe(id);
    }
    expect(index.placementAt(6, 0)).toBeUndefined();
    expect(index.placementAt(-1, 0)).toBeUndefined();
    // The cable occupies one row only.
    expect(index.placementAt(0, 1)).toBeUndefined();
  });

  it("a 1-cell stitch dropped mid-cable removes the WHOLE cable, not part of it", () => {
    const index = DocIndex.from([]);
    place(index, CABLE, 0, 0);
    place(index, "knit", 3, 0);

    expect(index.size).toBe(1);
    expect(occupiedCols(index, 0, 0, 6)).toEqual([
      undefined,
      undefined,
      undefined,
      "knit",
      undefined,
      undefined,
      undefined,
    ]);
    // No cell may still point at the deleted cable.
    expect([...index.occupancy.keys()]).toEqual(["3,0"]);
  });

  it("a wide stitch evicts every placement it overlaps", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 0, 0);
    place(index, CABLE, 2, 0);
    place(index, "purl", 11, 0);
    expect(index.size).toBe(3);

    place(index, WIDE, 0, 0); // 12 cells: 0..11
    expect(index.size).toBe(1);
    expect(index.placementAt(0, 0)!.symbolId).toBe(WIDE);
    expect(index.placementAt(11, 0)!.symbolId).toBe(WIDE);
    expect(index.placementAt(12, 0)).toBeUndefined();
  });

  it("erase removes the whole stitch when clicking a non-anchor cell", () => {
    const index = DocIndex.from([]);
    place(index, CABLE, 10, 4);

    apply(index, eraseChange(index, 14, 4)); // 5th cell of the cable
    expect(index.size).toBe(0);
    expect(index.occupancy.size).toBe(0);
  });

  it("erasing empty space is a no-op", () => {
    const index = DocIndex.from([]);
    expect(isEmptyChange(eraseChange(index, 3, 3))).toBe(true);
  });

  it("re-placing the same symbol in the same cell is a no-op", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 1, 1);
    expect(isEmptyChange(placeChange(index, "knit", 1, 1))).toBe(true);
    // ...but a different symbol there is a real change.
    expect(isEmptyChange(placeChange(index, "purl", 1, 1))).toBe(false);
  });
});

describe("undo", () => {
  it("restores an evicted cable exactly", () => {
    const index = DocIndex.from([]);
    place(index, CABLE, 0, 0);
    const before = index.toArray();

    const inverse = apply(index, placeChange(index, "knit", 3, 0));
    expect(index.size).toBe(1);

    apply(index, inverse);
    expect(index.toArray()).toEqual(before);
    // and the occupancy index is rebuilt, not just the placement list
    expect(occupiedCols(index, 0, 0, 5)).toEqual(Array(6).fill(CABLE));
  });

  it("round-trips a long sequence of edits", () => {
    const index = DocIndex.from([]);
    const inverses = [];
    for (let i = 0; i < 40; i++) {
      const symbol = i % 3 === 0 ? CABLE : i % 3 === 1 ? "knit" : "purl";
      inverses.push(apply(index, placeChange(index, symbol, i % 17, Math.floor(i / 17))));
    }
    for (const inverse of inverses.reverse()) apply(index, inverse);

    expect(index.size).toBe(0);
    expect(index.occupancy.size).toBe(0);
  });
});

describe("mergeChanges", () => {
  it("collapses a drag stroke into one entry", () => {
    const index = DocIndex.from([]);
    const changes = [];
    for (let c = 0; c < 5; c++) changes.push(placeChange(index, "knit", c, 0));
    for (const change of changes) apply(index, change);

    const merged = mergeChanges(changes);
    expect(merged.added).toHaveLength(5);
    expect(merged.removed).toHaveLength(0);
  });

  it("drops placements created and then overwritten within the same stroke", () => {
    const index = DocIndex.from([]);
    const first = placeChange(index, "knit", 0, 0);
    apply(index, first);
    const second = placeChange(index, CABLE, 0, 0); // evicts the knit just made
    apply(index, second);

    const merged = mergeChanges([first, second]);
    expect(merged.added.map((p) => p.symbolId)).toEqual([CABLE]);
    // The knit never existed before the stroke, so undo must not resurrect it.
    expect(merged.removed).toHaveLength(0);
  });
});

describe("insertChange (rows read right to left, the only direction today)", () => {
  it("shifts only what's at or before the click, leaving already-worked stitches fixed", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 0, 0);
    place(index, "purl", 1, 0);

    apply(index, insertChange(index, "yarn_over", 0, 0));

    // stitch1 (col1, already "worked" in RTL order) never moves...
    expect(index.placementAt(1, 0)!.symbolId).toBe("purl");
    // ...the new stitch takes the clicked slot...
    expect(index.placementAt(0, 0)!.symbolId).toBe("yarn_over");
    // ...and whatever was there slides one further along the row.
    expect(index.placementAt(-1, 0)!.symbolId).toBe("knit");
    expect(index.size).toBe(3);
  });

  it("is a no-op inside a multi-cell symbol, but allowed at its own start column", () => {
    const index = DocIndex.from([]);
    place(index, CABLE, 10, 5); // occupies 10..15

    expect(canInsertAt(index, 12, 5)).toBe(false);
    expect(isEmptyChange(insertChange(index, "knit", 12, 5))).toBe(true);

    expect(canInsertAt(index, 10, 5)).toBe(true);
    apply(index, insertChange(index, "knit", 10, 5));

    // The cable slides left by the new stitch's width...
    expect(occupiedCols(index, 5, 8, 16)).toEqual([
      undefined,
      CABLE,
      CABLE,
      CABLE,
      CABLE,
      CABLE,
      CABLE,
      "knit",
      undefined,
    ]);
    // ...and the new stitch lands adjacent to it, not overlapping it - this
    // is the case a uniform shift-by-the-new-symbol's-width alone gets
    // wrong, because the cable's own width also has to be accounted for.
    expect(index.size).toBe(2);
  });

  it("refuses to insert into a row that has nothing in it yet", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 0, 5); // row 5 has content, row 9 doesn't

    expect(canInsertAt(index, 3, 9)).toBe(false);
    expect(isEmptyChange(insertChange(index, "knit", 3, 9))).toBe(true);
  });

  it("refuses an empty cell that isn't actually adjacent to a stitch, even in a populated row", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 0, 0);
    place(index, "purl", 10, 0); // a wide gap between the two

    expect(canInsertAt(index, 5, 0)).toBe(false); // middle of the gap
    // ...but the cells touching either stitch are still fair game.
    expect(canInsertAt(index, 1, 0)).toBe(true);
    expect(canInsertAt(index, 9, 0)).toBe(true);
  });

  it("does not touch a different row", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 0, 0);
    place(index, "purl", 0, 1);

    apply(index, insertChange(index, "yarn_over", 0, 0));
    expect(index.placementAt(0, 1)!.symbolId).toBe("purl");
  });
});

describe("query", () => {
  it("returns only placements intersecting the bounds", () => {
    const index = DocIndex.from([]);
    place(index, "knit", 0, 0);
    place(index, "knit", 500, 500);

    const near = index.query({ minCol: -2, maxCol: 2, minRow: -2, maxRow: 2 });
    expect(near.map((p) => p.col)).toEqual([0]);
  });

  it("finds a wide stitch whose anchor is outside the bounds", () => {
    const index = DocIndex.from([]);
    place(index, WIDE, 0, 0); // spans 0..11

    const found = index.query({ minCol: 10, maxCol: 14, minRow: 0, maxRow: 0 });
    expect(found).toHaveLength(1);
  });

  it("works across chunk boundaries and negative coordinates", () => {
    const index = DocIndex.from([]);
    place(index, CABLE, CHUNK - 3, -CHUNK - 1); // straddles a chunk edge

    const found = index.query({
      minCol: CHUNK - 1,
      maxCol: CHUNK + 1,
      minRow: -CHUNK - 1,
      maxRow: -CHUNK - 1,
    });
    expect(found).toHaveLength(1);
  });
});

describe("DocIndex.from", () => {
  it("rebuilds occupancy from a plain placement list", () => {
    const placements: Placement[] = [
      { id: "a", symbolId: CABLE, col: 0, row: 0 },
      { id: "b", symbolId: "knit", col: 20, row: 3 },
    ];
    const index = DocIndex.from(placements);
    expect(index.size).toBe(2);
    expect(index.occupancy.size).toBe(7); // 6 cable cells + 1 knit
    expect(index.placementAt(5, 0)!.id).toBe("a");
  });
});
