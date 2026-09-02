import { describe, expect, it } from "vitest";
import { allSymbols } from "../symbols/registry";
import { searchSymbols } from "./symbolSearch";

const ids = (q: string) => searchSymbols(allSymbols(), q).map((s) => s.id);

describe("searchSymbols", () => {
  it("returns everything for an empty query", () => {
    expect(searchSymbols(allSymbols(), "")).toHaveLength(allSymbols().length);
    expect(searchSymbols(allSymbols(), "   ")).toHaveLength(allSymbols().length);
  });

  it("ranks the exact stitch above stitches merely containing the word", () => {
    expect(ids("purl")[0]).toBe("purl");
    expect(ids("knit")[0]).toBe("knit");
  });

  it("finds cables written the way knitters write them", () => {
    // "3/3" in prose, "3_3" in the id.
    const found = ids("3/3 left");
    expect(found).toContain("3_3_left_cable");
    expect(found).toContain("3_3_left_cable_hr");
    expect(found).not.toContain("2_2_left_cable");
  });

  it("keeps a cable's two counts paired", () => {
    // Splitting "3/3" into two "3" tokens would let 3/4 match as well.
    expect(ids("3/3 left")).toEqual(["3_3_left_cable", "3_3_left_cable_hr"]);
    expect(ids("3/3")).not.toContain("3_4_left_cable");
    expect(ids("3_4")).toEqual(
      expect.arrayContaining(["3_4_left_cable", "3_4_right_cable"]),
    );
  });

  it("is case insensitive and matches labels as well as ids", () => {
    expect(ids("K2TOG")).toContain("k2tog");
    // label is "Central double decrease"
    expect(ids("double decrease")).toContain("central_double_decrease");
    // label is "No stitch"; the id is "empty"
    expect(ids("no stitch")).toEqual(["empty"]);
  });

  it("matches the prose descriptions that became labels", () => {
    expect(ids("back loop")).toEqual(expect.arrayContaining(["ktbl", "ptbl"]));
  });

  it("searches by category", () => {
    const cables = ids("cable");
    expect(cables.length).toBe(allSymbols().filter((s) => s.category === "cable").length);
  });

  it("requires every token to match", () => {
    expect(ids("purl cable right hr")).toEqual([
      "1_1_right_purl_cable_hr",
      "2_1_right_purl_cable_hr",
      "2_2_right_purl_cable_hr",
    ]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(ids("zzzz")).toEqual([]);
  });
});
