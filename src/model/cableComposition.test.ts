import { describe, expect, it } from "vitest";
import { changedBaseCells, defaultBase, effectiveBase, isBaseStitch } from "./cableComposition";

describe("defaultBase", () => {
  it("reads a cable's stitches from its name, left to right", () => {
    expect(defaultBase("2_2_left_cable")).toEqual(["knit", "knit", "knit", "knit"]);
    expect(defaultBase("2_2_left_purl_cable")).toEqual(["knit", "knit", "purl", "purl"]);
    expect(defaultBase("2_1_right_purl_cable")).toEqual(["purl", "knit", "knit"]);
    // HR variants are 4 cells wider than their cross; no guessed default.
    expect(defaultBase("2_1_right_purl_cable_hr")).toBeNull();
    expect(defaultBase("1_1_right_purl_cable")).toEqual(["purl", "knit"]);
    expect(defaultBase("knit")).toBeNull();
  });
});

describe("isBaseStitch", () => {
  it("allows only one-cell knit/purl-family stitches", () => {
    for (const id of ["knit", "purl", "ktbl", "ptbl", "sl_wyib", "brp"]) expect(isBaseStitch(id)).toBe(true);
    for (const id of ["k2tog", "yarn_over", "m1l", "empty", "1_1_left_cable"]) expect(isBaseStitch(id)).toBe(false);
  });
});

describe("effectiveBase / changedBaseCells", () => {
  it("falls back to what the cable implies and reports only real changes", () => {
    const cable = { symbolId: "2_2_left_purl_cable", base: [null, "ktbl", "purl", null] };
    expect(effectiveBase(cable)).toEqual(["knit", "ktbl", "purl", "purl"]);
    expect(changedBaseCells(cable)).toEqual([1]);
  });
});
