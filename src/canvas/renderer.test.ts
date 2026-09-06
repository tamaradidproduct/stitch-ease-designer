import { describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import type { PickerTarget } from "../state/uiStore";
import { numberingHiddenAt, pickerTargetFootprint } from "./renderer";

const target = (col: number, row: number): PickerTarget => ({ col, row, x: 0, y: 0 });

describe("pickerTargetFootprint", () => {
  it("highlights one cell when the picker targets empty space", () => {
    expect(pickerTargetFootprint(DocIndex.from([]), target(4, 7))).toEqual({
      col: 4,
      row: 7,
      span: 1,
    });
  });

  it("highlights the entire placement when a covered cell of a multi-cell stitch is clicked", () => {
    const index = DocIndex.from([
      { id: "cable", symbolId: "1_1_left_cable", col: 4, row: 7 },
    ]);

    expect(pickerTargetFootprint(index, target(5, 7))).toEqual({
      col: 4,
      row: 7,
      span: 2,
    });
  });
});

describe("numberingHiddenAt", () => {
  const index = DocIndex.from([{ id: "a", symbolId: "knit", col: 4, row: 7 }]);

  it("hides a label over a cell that already holds a placement", () => {
    expect(numberingHiddenAt(index, null, 4, 7)).toBe(true);
  });

  it("leaves a label over an empty cell alone", () => {
    expect(numberingHiddenAt(index, null, 5, 7)).toBe(false);
  });

  it("hides a label under the currently hovered cell, even if it's empty", () => {
    expect(numberingHiddenAt(index, { col: 9, row: 2 }, 9, 2)).toBe(true);
  });

  it("doesn't hide a label just because something is hovered elsewhere", () => {
    expect(numberingHiddenAt(index, { col: 9, row: 2 }, 5, 2)).toBe(false);
  });
});
