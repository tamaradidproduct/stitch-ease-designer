import { describe, expect, it } from "vitest";
import type { Placement } from "../model/types";
import { chartToCsv } from "./exportCsv";

const place = (symbolId: string, col: number, row: number): Placement => ({
  id: `${col},${row}`,
  symbolId,
  col,
  row,
});

describe("chartToCsv", () => {
  it("is empty for an empty chart", () => {
    expect(chartToCsv([])).toBe("");
  });

  it("transcribes a small grid top row first, left to right, with position headers", () => {
    const csv = chartToCsv([
      place("knit", 0, 1),
      place("purl", 1, 1),
      place("purl", 0, 0),
      place("knit", 1, 0),
    ]);
    expect(csv.split("\r\n")).toEqual([",1,2", "1,K,P", "2,P,K"]);
  });

  it("leaves gaps blank and a multi-column symbol's continuation cells blank", () => {
    const csv = chartToCsv([place("knit", 0, 0), place("3_3_left_cable", 2, 0)]);
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(",1,2,3,4,5,6,7,8");
    // col 1 (K), col 2 blank (gap), cols 3-8 the cable's span - only the
    // anchor (col 3, the symbol's own start) carries the abbreviation.
    expect(rows[1]).toBe("1,K,,3/3LC,,,,,");
  });
});
