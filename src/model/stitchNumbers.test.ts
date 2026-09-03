import { describe, expect, it } from "vitest";
import { DocIndex } from "./docIndex";
import {
  knittedRowNumberAt,
  knittedRowNumbers,
  roundStitchNumberAt,
  roundStitchNumbers,
  stitchGroups,
} from "./stitchNumbers";
import type { Placement } from "./types";

const stitch = (id: string, symbolId: string, col: number, row: number): Placement => ({
  id,
  symbolId,
  col,
  row,
});

describe("knitted row numbering", () => {
  it("counts actual stitched rows bottom to top and skips unused canvas rows", () => {
    const index = DocIndex.from([
      stitch("bottom", "purl", 4, -3),
      stitch("top", "knit", 4, -2),
    ]);

    expect([...knittedRowNumbers(stitchGroups(index)[0]!)]).toEqual([
      [-3, 1],
      [-2, 2],
    ]);
    expect(knittedRowNumberAt(index, 4, 0)).toBeNull();
  });

  it("does not count a row containing only no-stitch symbols", () => {
    const index = DocIndex.from([
      stitch("bottom", "knit", 0, 2),
      stitch("gap", "empty", 0, 3),
      stitch("top", "knit", 0, 4),
    ]);

    expect(knittedRowNumberAt(index, 0, 2)).toBe(1);
    expect(knittedRowNumberAt(index, 0, 3)).toBeNull();
    expect(knittedRowNumberAt(index, 0, 4)).toBe(2);
  });

  it("restarts row numbers for distant groups", () => {
    const index = DocIndex.from([
      stitch("group-a", "knit", 0, 0),
      stitch("group-b", "knit", 20, 20),
    ]);

    expect(knittedRowNumberAt(index, 0, 0)).toBe(1);
    expect(knittedRowNumberAt(index, 20, 20)).toBe(1);
  });
});

describe("round stitch numbering", () => {
  it("counts placed stitches right to left and restarts on each row", () => {
    const index = DocIndex.from([
      stitch("a", "knit", 2, 0),
      stitch("b", "purl", 3, 0),
      stitch("c", "knit", 3, 1),
    ]);

    expect([...roundStitchNumbers(index, 2, 0)]).toEqual([
      [3, 1],
      [2, 2],
    ]);
    expect(roundStitchNumberAt(index, 3, 1)).toBe(1);
  });

  it("ignores empty cells and explicit no-stitch placements", () => {
    const index = DocIndex.from([
      stitch("a", "knit", 1, 0),
      stitch("gap", "empty", 2, 0),
      stitch("b", "purl", 3, 0),
    ]);

    expect(roundStitchNumberAt(index, 3, 0)).toBe(1);
    expect(roundStitchNumberAt(index, 2, 0)).toBeNull();
    expect(roundStitchNumberAt(index, 1, 0)).toBe(2);
    expect(roundStitchNumberAt(index, 6, 0)).toBeNull();
  });

  it("counts every covered cell of a multi-stitch symbol", () => {
    const index = DocIndex.from([
      stitch("cable", "3_3_left_cable", 10, 0),
      stitch("right", "knit", 16, 0),
    ]);

    expect(roundStitchNumberAt(index, 16, 0)).toBe(1);
    expect(roundStitchNumberAt(index, 15, 0)).toBe(2);
    expect(roundStitchNumberAt(index, 10, 0)).toBe(7);
  });

  it("restarts stitch numbers for separated groups on the same row", () => {
    const index = DocIndex.from([
      stitch("left", "knit", 0, 0),
      stitch("right", "knit", 20, 0),
    ]);

    expect(roundStitchNumberAt(index, 0, 0)).toBe(1);
    expect(roundStitchNumberAt(index, 20, 0)).toBe(1);
  });
});
