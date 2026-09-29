import { describe, expect, it } from "vitest";
import type { CalibrationMark, ReferenceImage } from "../model/types";
import { cellWithinCalibratedCrop } from "./referenceImageCrop";

const namedMark = (over: Partial<CalibrationMark>): CalibrationMark => ({
  id: "mark-1",
  u: 0.25,
  v: 0.25,
  w: 0.5,
  h: 0.5,
  stitch: 3,
  row: 3,
  ...over,
});

const image = (over: Partial<ReferenceImage>): ReferenceImage => ({
  id: "image-1",
  number: 1,
  ref: "user-1/chart-1/reference.png",
  // 10x10 cells at CELL=24: a 240x240 world-unit image anchored at the origin.
  x: 0,
  y: 0,
  width: 240,
  height: 240,
  naturalWidth: 240,
  naturalHeight: 240,
  opacity: 0.5,
  visible: true,
  locked: false,
  ...over,
});

describe("cellWithinCalibratedCrop", () => {
  it("imposes no restriction when cropToCalibration is off", () => {
    const img = image({ cropToCalibration: false, calibrationMarks: [namedMark({})] });
    // Cell (0, 0) sits outside the marks' 0.25..0.75 span but should still pass.
    expect(cellWithinCalibratedCrop(img, 0, 0)).toBe(true);
  });

  it("imposes no restriction when no mark has been named yet", () => {
    const img = image({ cropToCalibration: true, calibrationMarks: [] });
    expect(cellWithinCalibratedCrop(img, 0, 0)).toBe(true);
  });

  it("accepts a cell fully inside the named marks' span", () => {
    // Marks span u/v 0.25..0.75, i.e. world 60..180 on both axes (of 240).
    // Cell (col 3, row 3) -> world 72..96, well inside.
    const img = image({ cropToCalibration: true, calibrationMarks: [namedMark({})] });
    expect(cellWithinCalibratedCrop(img, 3, 3)).toBe(true);
  });

  it("rejects a cell outside the named marks' span", () => {
    const img = image({ cropToCalibration: true, calibrationMarks: [namedMark({})] });
    // Cell (0, 0) -> world 0..24, entirely below the marks' 60..180 span.
    expect(cellWithinCalibratedCrop(img, 0, 0)).toBe(false);
  });

  it("ignores unnamed boxes when computing the calibrated span", () => {
    const img = image({
      cropToCalibration: true,
      calibrationMarks: [namedMark({ stitch: null, row: null, u: 0, v: 0, w: 1, h: 1 }), namedMark({})],
    });
    // The unnamed box covers the whole image, but only the named one counts.
    expect(cellWithinCalibratedCrop(img, 0, 0)).toBe(false);
  });
});
