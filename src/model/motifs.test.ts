import { describe, expect, it } from "vitest";
import {
  deriveOverrides,
  expectedStitches,
  fillOrigins,
  hasOverrides,
  isMotifKey,
  mirrorSymbolId,
  motifIdFromKey,
  motifKey,
  motifStitchesFromMembers,
  rematerialize,
  stampOrigin,
} from "./motifs";
import type { MotifCopy, Placement, RepeatDefinition } from "./types";

const motif: RepeatDefinition = {
  id: "repeat_a",
  name: "Motif 1",
  width: 3,
  height: 2,
  stitches: [
    { symbolId: "k2tog", col: 0, row: 0 },
    { symbolId: "knit", col: 2, row: 0 },
    { symbolId: "yarn_over", col: 1, row: 1 },
  ],
};

const instance: MotifCopy = { id: "group_1", col: 10, row: 5 };

const members = (inst: MotifCopy, def = motif): Placement[] =>
  expectedStitches(def, inst).map((s, i) => ({ id: `p${i}`, groupId: inst.id, ...s }));

describe("motif keys", () => {
  it("round-trips and never matches a symbol key", () => {
    expect(motifIdFromKey(motifKey("repeat_a"))).toBe("repeat_a");
    expect(isMotifKey("knit")).toBe(false);
    expect(isMotifKey("knit::#fff")).toBe(false);
    expect(motifIdFromKey("knit")).toBeNull();
  });
});

describe("mirrorSymbolId", () => {
  it("swaps directional stitches and leaves symmetric ones", () => {
    expect(mirrorSymbolId("k2tog")).toBe("skpo");
    expect(mirrorSymbolId("skpo")).toBe("k2tog");
    expect(mirrorSymbolId("m1lp")).toBe("m1rp");
    expect(mirrorSymbolId("2_2_left_purl_cable_hr")).toBe("2_2_right_purl_cable_hr");
    expect(mirrorSymbolId("3_3_right_cable")).toBe("3_3_left_cable");
    expect(mirrorSymbolId("knit")).toBe("knit");
  });
});

describe("expectedStitches", () => {
  it("offsets by the instance origin", () => {
    expect(expectedStitches(motif, instance)).toEqual([
      { symbolId: "k2tog", col: 10, row: 5 },
      { symbolId: "knit", col: 12, row: 5 },
      { symbolId: "yarn_over", col: 11, row: 6 },
    ]);
  });

  it("mirrors columns within the footprint, respecting span", () => {
    const cable: RepeatDefinition = {
      ...motif,
      width: 5,
      stitches: [
        { symbolId: "1_1_left_cable", col: 0, row: 0 },
        { symbolId: "purl", col: 4, row: 0 },
      ],
    };
    expect(expectedStitches(cable, { col: 0, row: 0, mirrored: true })).toEqual([
      { symbolId: "1_1_right_cable", col: 3, row: 0 },
      { symbolId: "purl", col: 0, row: 0 },
    ]);
  });
});

describe("deriveOverrides", () => {
  it("is empty for a pristine copy", () => {
    expect(hasOverrides(deriveOverrides(motif, instance, members(instance)))).toBe(false);
  });

  it("reports changed and missing stitches", () => {
    const m = members(instance);
    m[1] = { ...m[1]!, symbolId: "purl" };
    const o = deriveOverrides(motif, instance, m.slice(0, 2));
    expect(o.changed.map((p) => p.symbolId)).toEqual(["purl"]);
    expect(o.missing.map((s) => s.symbolId).sort()).toEqual(["knit", "yarn_over"]);
  });
});

describe("motifStitchesFromMembers", () => {
  it("un-mirrors a mirrored copy back into motif space", () => {
    const mirrored = { ...instance, mirrored: true };
    const back = motifStitchesFromMembers(motif, mirrored, members(mirrored));
    expect(back).toEqual([...motif.stitches].sort((a, b) => a.row - b.row || a.col - b.col));
  });
});

describe("rematerialize", () => {
  const after: RepeatDefinition = {
    ...motif,
    stitches: [
      { symbolId: "k2tog", col: 0, row: 0 },
      { symbolId: "purl", col: 2, row: 0 },
      { symbolId: "knit", col: 1, row: 1 },
    ],
  };

  it("keeps a copy's overrides while following the new motif elsewhere", () => {
    // Override: the yarn over was erased, the k2tog recolored.
    const m = members(instance).filter((p) => p.symbolId !== "yarn_over");
    m[0] = { ...m[0]!, colorId: "#f00" };
    const { keep, remove, add } = rematerialize(motif, after, instance, m, () => false);
    expect(keep.map((p) => p.colorId)).toEqual(["#f00"]);
    expect(remove.map((p) => p.symbolId)).toEqual(["knit"]);
    // The erased cell stays clear; the recolored cell isn't overwritten.
    expect(add).toEqual([{ symbolId: "purl", col: 12, row: 5 }]);
  });

  it("drops overrides when asked (Reset) and never overwrites outsiders", () => {
    const m = members(instance);
    m[1] = { ...m[1]!, symbolId: "purl" };
    const { keep, add } = rematerialize(motif, motif, instance, m, (c, r) => c === 11 && r === 6, false);
    expect(keep).toEqual([]);
    expect(add.map((s) => s.symbolId)).toEqual(["k2tog", "knit"]);
  });
});

describe("stampOrigin / fillOrigins", () => {
  it("anchors at the row-start (right, for rtl rows) bottom corner", () => {
    expect(stampOrigin(motif, { col: 20, row: 3 })).toEqual({ col: 18, row: 3 });
  });

  it("tiles whole copies from the row-start corner of the drag", () => {
    const { origins, across, up } = fillOrigins(motif, { col: 0, row: 0 }, { col: 7, row: 4 });
    expect([across, up]).toEqual([2, 2]);
    expect(origins).toEqual([
      { col: 5, row: 0 },
      { col: 2, row: 0 },
      { col: 5, row: 2 },
      { col: 2, row: 2 },
    ]);
  });

  it("a click-sized drag is a single stamp", () => {
    const { origins } = fillOrigins(motif, { col: 20, row: 3 }, { col: 20, row: 3 });
    expect(origins).toEqual([stampOrigin(motif, { col: 20, row: 3 })]);
  });
});
