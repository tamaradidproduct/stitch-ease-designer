import { describe, expect, it } from "vitest";
import { DocIndex } from "./docIndex";
import type { Placement } from "./types";

const stitch = (id: string, col: number, row: number, groupId?: string): Placement => ({
  id,
  symbolId: "knit",
  col,
  row,
  ...(groupId ? { groupId } : {}),
});

describe("DocIndex.groupMembers", () => {
  it("returns every placement sharing a groupId", () => {
    const index = DocIndex.from([
      stitch("a", 0, 0, "g1"),
      stitch("b", 1, 0, "g1"),
      stitch("c", 2, 0, "g2"),
    ]);

    expect(index.groupMembers("g1").map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(index.groupMembers("g2").map((p) => p.id)).toEqual(["c"]);
  });

  it("returns an empty array for an unknown or ungrouped id", () => {
    const index = DocIndex.from([stitch("a", 0, 0)]);
    expect(index.groupMembers("nope")).toEqual([]);
  });

  it("drops a placement from its group on remove, and forgets the group once empty", () => {
    const index = DocIndex.from([stitch("a", 0, 0, "g1"), stitch("b", 1, 0, "g1")]);

    index.remove("a");
    expect(index.groupMembers("g1").map((p) => p.id)).toEqual(["b"]);

    index.remove("b");
    expect(index.groupMembers("g1")).toEqual([]);
  });
});

describe("DocIndex.from", () => {
  it("rebuilds occupancy from a plain placement list", () => {
    const index = DocIndex.from([
      { id: "a", symbolId: "3_3_left_cable", col: 0, row: 0 }, // 6 cells
      stitch("b", 20, 3),
    ]);
    expect(index.size).toBe(2);
    expect(index.occupancy.size).toBe(7); // 6 cable cells + 1 knit
    expect(index.placementAt(5, 0)!.id).toBe("a");
  });
});
