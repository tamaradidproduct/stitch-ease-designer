import { describe, expect, it } from "vitest";
import { collectGlossarySymbols } from "./chartGlossary";

describe("collectGlossarySymbols", () => {
  it("keeps explicit glossary order and appends placed stitch types once", () => {
    expect(collectGlossarySymbols(
      ["purl", "knit"],
      ["knit", "yarn_over", "purl", "yarn_over"],
    ).map((symbol) => symbol.id)).toEqual(["purl", "knit", "yarn_over"]);
  });

  it("ignores unknown legacy symbol ids", () => {
    expect(collectGlossarySymbols(["missing", "knit"], []).map((symbol) => symbol.id))
      .toEqual(["knit"]);
  });
});
