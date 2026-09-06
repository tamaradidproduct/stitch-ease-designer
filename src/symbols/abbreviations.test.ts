import { describe, expect, it } from "vitest";
import { abbreviationFor, deriveAbbreviation } from "./abbreviations";

describe("abbreviationFor", () => {
  it("uses the hand-picked code for a known symbol", () => {
    expect(abbreviationFor("knit")).toBe("K");
    expect(abbreviationFor("purl")).toBe("P");
    expect(abbreviationFor("k2tog")).toBe("K2tog");
    expect(abbreviationFor("yarn_over")).toBe("YO");
  });

  it("distinguishes a cable's plain, purl, and HR variants", () => {
    expect(abbreviationFor("1_1_left_cable")).toBe("1/1LC");
    expect(abbreviationFor("1_1_left_purl_cable")).toBe("1/1LPC");
    expect(abbreviationFor("1_1_left_cable_hr")).toBe("1/1LC-HR");
  });

  it("falls back to the raw id for a symbol the registry doesn't know either", () => {
    expect(abbreviationFor("not_a_real_symbol_id")).toBe("not_a_real_symbol_id");
  });
});

describe("deriveAbbreviation", () => {
  it("takes initials of each word in the label", () => {
    expect(deriveAbbreviation("Double moss stitch")).toBe("DMS");
  });

  it("caps the result at 6 characters", () => {
    expect(deriveAbbreviation("A very long descriptive knit stitch name")).toBe("AVLDKS");
  });
});
