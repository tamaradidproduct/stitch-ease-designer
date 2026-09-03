import { describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import type { PickerTarget } from "../state/uiStore";
import { pickerTargetFootprint } from "./renderer";

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
