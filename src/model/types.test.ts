import { describe, expect, it } from "vitest";
import { CELL } from "../canvas/camera";
import {
  handleSigns,
  resizeReferenceImageAround,
  stitchBoxRect,
  type ReferenceImage,
} from "./types";

function image(overrides: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    ref: "data:image/png;base64,x",
    x: 100,
    y: 50,
    width: 800,
    height: 600,
    naturalWidth: 800,
    naturalHeight: 600,
    opacity: 0.5,
    visible: true,
    locked: false,
    ...overrides,
  };
}

/** A stitch pinned a quarter in from the image's bottom-left. */
const CALIBRATED = { u: 0.25, v: 0.25 };

describe("stitchBoxRect", () => {
  it("is null until the image has been calibrated", () => {
    expect(stitchBoxRect(image())).toBeNull();
  });

  it("resolves the stored fractions against the image's current geometry", () => {
    const rect = stitchBoxRect(image({ stitchPin: CALIBRATED }));
    expect(rect).toEqual({ x: 100 + 200, y: 50 + 150, width: CELL, height: CELL });
  });

  it("travels with the image when it moves, with no bookkeeping of its own", () => {
    const before = stitchBoxRect(image({ stitchPin: CALIBRATED }))!;
    const after = stitchBoxRect(image({ stitchPin: CALIBRATED, x: 140, y: 90 }))!;
    expect(after.x - before.x).toBe(40);
    expect(after.y - before.y).toBe(40);
    expect(after.width).toBe(before.width);
  });
});

describe("resizing around the calibrated stitch", () => {
  it("leaves the pinned bottom-left corner exactly where it was", () => {
    const img = image({ stitchPin: CALIBRATED });
    const pin = stitchBoxRect(img)!;

    const resized = { ...img, ...resizeReferenceImageAround(img, 950, 400, { x: pin.x, y: pin.y }) };

    const moved = stitchBoxRect(resized)!;
    expect(moved.x).toBeCloseTo(pin.x, 10);
    expect(moved.y).toBeCloseTo(pin.y, 10);
  });

  it("holds the pin across a long run of 1% steps, the way the panel drives it", () => {
    let img = image({ stitchPin: CALIBRATED });
    const pin = stitchBoxRect(img)!;

    // Width up 1% a click, then height down 1% a click - independently, as
    // the two steppers do, since a stretched chart is the whole reason
    // these axes are separate.
    for (let i = 1; i <= 25; i++) {
      img = { ...img, ...resizeReferenceImageAround(img, img.naturalWidth * (1 + i / 100), img.height, { x: pin.x, y: pin.y }) };
    }
    for (let i = 1; i <= 25; i++) {
      img = { ...img, ...resizeReferenceImageAround(img, img.width, img.naturalHeight * (1 - i / 100), { x: pin.x, y: pin.y }) };
    }

    const after = stitchBoxRect(img)!;
    expect(after.x).toBeCloseTo(pin.x, 8);
    expect(after.y).toBeCloseTo(pin.y, 8);
  });

  it("stays exactly one cell however far the image is rescaled", () => {
    // The box is what you compare against a grid cell by eye, so it has to
    // *be* a grid cell - letting it drift to some other size (which storing
    // its own width used to do) made it useless for that.
    const img = image({ stitchPin: CALIBRATED });
    const pin = stitchBoxRect(img)!;
    expect(pin.width).toBe(CELL);

    const stretched = { ...img, ...resizeReferenceImageAround(img, 1600, 240, { x: pin.x, y: pin.y }) };
    expect(stitchBoxRect(stretched)!.width).toBe(CELL);
    expect(stitchBoxRect(stretched)!.height).toBe(CELL);
  });

  it("still anchors on the image centre when there is nothing calibrated", () => {
    const img = image();
    const centre = { x: img.x + img.width / 2, y: img.y + img.height / 2 };
    const resized = resizeReferenceImageAround(img, 400, 300, centre);
    expect(resized.x + resized.width / 2).toBeCloseTo(centre.x, 10);
    expect(resized.y + resized.height / 2).toBeCloseTo(centre.y, 10);
  });
});

describe("handleSigns", () => {
  it("gives corners both axes", () => {
    expect(handleSigns("bl")).toEqual({ sx: -1, sy: -1 });
    expect(handleSigns("br")).toEqual({ sx: 1, sy: -1 });
    expect(handleSigns("tl")).toEqual({ sx: -1, sy: 1 });
    expect(handleSigns("tr")).toEqual({ sx: 1, sy: 1 });
  });

  it("gives each edge exactly one axis, leaving the other untouched", () => {
    // The zero is what makes a side drag stretch one way only.
    expect(handleSigns("l")).toEqual({ sx: -1, sy: 0 });
    expect(handleSigns("r")).toEqual({ sx: 1, sy: 0 });
    expect(handleSigns("b")).toEqual({ sx: 0, sy: -1 });
    expect(handleSigns("t")).toEqual({ sx: 0, sy: 1 });
  });
});
