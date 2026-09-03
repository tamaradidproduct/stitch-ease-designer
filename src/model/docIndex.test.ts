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
