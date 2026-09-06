import { describe, expect, it } from "vitest";
import type { Placement } from "./types";
import { chartBounds } from "./chartBounds";

const place = (symbolId: string, col: number, row: number): Placement => ({
  id: `${col},${row}`,
  symbolId,
  col,
  row,
});

describe("chartBounds", () => {
  it("returns null for an empty chart", () => {
    expect(chartBounds([])).toBeNull();
  });

  it("covers a single single-cell placement", () => {
    expect(chartBounds([place("knit", 3, 5)])).toEqual({ minCol: 3, maxCol: 3, minRow: 5, maxRow: 5 });
  });

  it("spans multiple placements", () => {
    const bounds = chartBounds([place("knit", 0, 0), place("purl", 4, 2), place("knit", -2, 1)]);
    expect(bounds).toEqual({ minCol: -2, maxCol: 4, minRow: 0, maxRow: 2 });
  });

  it("extends the bounds by a multi-column symbol's span", () => {
    // "3_3_left_cable" is 6 cells wide starting at its own col.
    const bounds = chartBounds([place("3_3_left_cable", 2, 0)]);
    expect(bounds).toEqual({ minCol: 2, maxCol: 7, minRow: 0, maxRow: 0 });
  });
});
