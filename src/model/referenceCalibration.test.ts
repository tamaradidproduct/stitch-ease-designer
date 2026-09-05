import { describe, expect, it } from "vitest";
import { CELL } from "../canvas/camera";
import { scaleFromCalibrationMarks, snapImageToGrid } from "./referenceCalibration";
import { stitchBoxRect, type ReferenceImage } from "./types";

function image(overrides: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    ref: "data:image/png;base64,x",
    x: 0,
    y: 0,
    width: 480,
    height: 360,
    naturalWidth: 480,
    naturalHeight: 360,
    opacity: 0.5,
    visible: true,
    locked: false,
    ...overrides,
  };
}

describe("snapImageToGrid", () => {
  const size = { width: 480, height: 360 };
  const pin = { u: 0.25, v: 0.5 }; // pin sits 120 right and 180 up from the origin

  const pinAt = (x: number, y: number) => ({
    x: x + pin.u * size.width,
    y: y + pin.v * size.height,
  });

  it("lands the pin exactly on a grid intersection", () => {
    const next = snapImageToGrid(7, -3, size, pin);
    const p = pinAt(next.x, next.y);
    expect(p.x % CELL).toBeCloseTo(0, 9);
    expect(p.y % CELL).toBeCloseTo(0, 9);
  });

  it("picks the nearest intersection, so it never pulls more than half a cell", () => {
    for (const [x, y] of [
      [0, 0],
      [5, 5],
      [-13, 41],
      [1000.4, -777.9],
    ]) {
      const next = snapImageToGrid(x!, y!, size, pin);
      expect(Math.abs(next.x - x!)).toBeLessThanOrEqual(CELL / 2 + 1e-9);
      expect(Math.abs(next.y - y!)).toBeLessThanOrEqual(CELL / 2 + 1e-9);
    }
  });

  it("leaves an already-aligned image exactly alone", () => {
    const aligned = snapImageToGrid(0, 0, size, pin);
    expect(snapImageToGrid(aligned.x, aligned.y, size, pin)).toEqual(aligned);
  });

  it("makes the stitch box coincide with a real chart cell", () => {
    const img = { ...image(), ...size, stitchPin: pin };
    const snapped = { ...img, ...snapImageToGrid(11, 7, size, pin) };
    const box = stitchBoxRect(snapped)!;
    // Same size as a cell and on a cell boundary: it *is* a cell.
    expect(box.width).toBe(CELL);
    expect(box.height).toBe(CELL);
    expect(Math.round(box.x / CELL) * CELL).toBeCloseTo(box.x, 9);
    expect(Math.round(box.y / CELL) * CELL).toBeCloseTo(box.y, 9);
  });
});

describe("scaleFromCalibrationMarks", () => {
  const base = image({ x: 0, y: 0, width: 480, height: 360 });

  // A box a twentieth of the image across, centred on (u, v) - the marks
  // are boxes drawn around a stitch, and the fit reads their centres.
  const BOX = 0.02;
  const mark = (
    id: string,
    u: number,
    v: number,
    stitch: number | null,
    row: number | null,
  ) => ({ id, u: u - BOX / 2, v: v - BOX / 2, w: BOX, h: BOX, stitch, row });

  /**
   * Four marks on a photo where one stitch spans 0.05 of the image's width
   * and one row spans 0.02 of its height, numbered right-to-left the way a
   * chart actually is.
   */
  const FOUR = [
    mark("a", 0.1, 0.1, 36, 1),
    mark("b", 0.4, 0.1, 30, 1),
    mark("c", 0.1, 0.5, 36, 21),
    mark("d", 0.4, 0.5, 30, 21),
  ];

  it("scales so one stitch and one row each come out a cell", () => {
    const fit = scaleFromCalibrationMarks(base, FOUR)!;
    expect(fit.width).toBeCloseTo(CELL / 0.05, 8);
    expect(fit.height).toBeCloseTo(CELL / 0.02, 8);
  });

  it("gives the same scale whichever way the chart numbers its stitches", () => {
    // Charts number right-to-left, so stitch 36 sits left of stitch 30 - but
    // a chart numbered the other way has to calibrate identically, since
    // only the spread carries the information.
    const mirrored = FOUR.map((p) => ({ ...p, stitch: 66 - p.stitch! }));
    const fit = scaleFromCalibrationMarks(base, mirrored)!;
    const straight = scaleFromCalibrationMarks(base, FOUR)!;
    expect(fit.width).toBeCloseTo(straight.width!, 8);
    expect(fit.height).toBeCloseTo(straight.height!, 8);
  });

  it("ignores how big the boxes are, only where their centres sit", () => {
    // A box is a couple of dozen source pixels across; measuring a stitch
    // from one is the imprecision the whole flow exists to escape. Drawing
    // them sloppily must not move the scale.
    const sloppy = FOUR.map((m, i) => {
      const grow = 0.01 * (i + 1);
      return { ...m, u: m.u - grow / 2, v: m.v - grow / 2, w: m.w + grow, h: m.h + grow };
    });
    const fit = scaleFromCalibrationMarks(base, sloppy)!;
    const exact = scaleFromCalibrationMarks(base, FOUR)!;
    expect(fit.width).toBeCloseTo(exact.width!, 8);
    expect(fit.height).toBeCloseTo(exact.height!, 8);
  });

  it("lands the marked stitch squarely on a grid cell", () => {
    const fit = scaleFromCalibrationMarks(base, FOUR)!;
    const box = stitchBoxRect({ ...base, ...fit })!;
    expect(box.x / CELL).toBeCloseTo(Math.round(box.x / CELL), 8);
    expect(box.y / CELL).toBeCloseTo(Math.round(box.y / CELL), 8);
    expect(box.width).toBe(CELL);
  });

  it("averages a mark placed slightly off, rather than obeying it", () => {
    // The whole reason for asking for four marks: two would take this 12%
    // slip at face value and scale the photo by it.
    const slipped = FOUR.map((p) => (p.id === "b" ? { ...p, u: 0.436 - BOX / 2 } : p));
    const off = scaleFromCalibrationMarks(base, slipped)!;
    const exact = scaleFromCalibrationMarks(base, FOUR)!;

    // What the same slip would do with only that pair to go on.
    const twoPointError = Math.abs(CELL / (0.336 / 6) - exact.width!);
    const fourPointError = Math.abs(off.width! - exact.width!);
    expect(fourPointError).toBeLessThan(twoPointError * 0.6);
  });

  it("ignores marks that have not been labelled yet", () => {
    const partial = [...FOUR, mark("e", 0.9, 0.9, null, null)];
    const fit = scaleFromCalibrationMarks(base, partial)!;
    expect(fit.width).toBeCloseTo(CELL / 0.05, 8);
  });

  it("refuses a fit that no scale follows from", () => {
    const one = [FOUR[0]!];
    expect(scaleFromCalibrationMarks(base, one)).toBeNull();
    // Every mark naming the same stitch: no horizontal spread to fit.
    const sameStitch = FOUR.map((p) => ({ ...p, stitch: 36 }));
    expect(scaleFromCalibrationMarks(base, sameStitch)).toBeNull();
    // ...and the same for rows.
    const sameRow = FOUR.map((p) => ({ ...p, row: 1 }));
    expect(scaleFromCalibrationMarks(base, sameRow)).toBeNull();
  });

  it("refuses a scale the photo could not possibly carry", () => {
    // A typo: two marks a whole image apart, called 10000 stitches apart.
    // That asks for a stitch a twentieth of a source pixel wide.
    const absurd = [mark("a", 0, 0, 1, 1), mark("b", 1, 1, 10000, 10000)];
    expect(scaleFromCalibrationMarks(base, absurd)).toBeNull();

    // The same marks at a believable count are fine.
    const sane = [mark("a", 0, 0, 1, 1), mark("b", 1, 1, 20, 15)];
    expect(scaleFromCalibrationMarks(base, sane)).not.toBeNull();
  });
});
