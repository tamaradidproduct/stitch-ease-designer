import { describe, expect, it } from "vitest";
import { cellKey, parseCellKey, unoccupiedCellsFromKeys } from "./cellKey";

describe("cellKey", () => {
  it("round-trips positive, zero, and negative integer coordinates", () => {
    for (const cell of [
      { col: 4, row: 8 },
      { col: 0, row: 0 },
      { col: -12, row: 3 },
    ]) {
      expect(parseCellKey(cellKey(cell.col, cell.row))).toEqual(cell);
    }
  });

  it("rejects malformed and fractional coordinates", () => {
    for (const key of ["", "1", "1,2,3", "1.5,2", "x,2", "1, 2"]) {
      expect(parseCellKey(key)).toBeNull();
    }
  });
});

describe("unoccupiedCellsFromKeys", () => {
  it("drops malformed and newly occupied marker cells", () => {
    const occupied = new Set([cellKey(2, 3)]);

    expect(
      unoccupiedCellsFromKeys([cellKey(1, 3), "invalid", cellKey(2, 3)], (col, row) =>
        occupied.has(cellKey(col, row)),
      ),
    ).toEqual([{ col: 1, row: 3 }]);
  });
});
