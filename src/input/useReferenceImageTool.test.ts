import { describe, expect, it } from "vitest";
import { CELL } from "../canvas/camera";
import { cornerPoint, stitchBoxRect, type ReferenceImage } from "../model/types";
import {
  calibrationTransform,
  handleAt,
  snapImageToGrid,
  stitchResizeTransform,
} from "./useReferenceImageTool";

/**
 * Deliberately the shape that used to break: a chart photo scaled down to
 * 18%, where one stitch is only a few world units across even though it's
 * comfortably big on screen once you've zoomed in.
 */
function smallImage(): ReferenceImage {
  return {
    ref: "data:image/png;base64,x",
    x: 0,
    y: 0,
    width: 183.5,
    height: 134.6,
    naturalWidth: 1020,
    naturalHeight: 748,
    opacity: 0.5,
    visible: true,
    locked: false,
  };
}

/** One stitch on that image: ~5.1 world units across, ~3.7 down. */
const oneStitch = { start: { x: 40, y: 40 }, current: { x: 45.1, y: 43.7 } };

describe("calibrationTransform", () => {
  it("accepts a one-stitch box on a scaled-down image when zoomed in to draw it", () => {
    // 3.7 world units at 288% zoom is ~10.7 screen px - an unmistakably
    // deliberate drag, and the case that used to be rejected outright.
    expect(calibrationTransform(smallImage(), oneStitch, 2.88)).not.toBeNull();
  });

  it("still rejects the same box when it really is a few pixels on screen", () => {
    // At 100% zoom that box is 3.7px tall - nobody drew that on purpose.
    expect(calibrationTransform(smallImage(), oneStitch, 1)).toBeNull();
  });

  it("rejects a click that never dragged, at any zoom", () => {
    const click = { start: { x: 40, y: 40 }, current: { x: 40, y: 40 } };
    expect(calibrationTransform(smallImage(), click, 10)).toBeNull();
  });

  it("makes the boxed stitch exactly one cell, on both axes independently", () => {
    const image = smallImage();
    const next = { ...image, ...calibrationTransform(image, oneStitch, 2.88)! };
    const box = stitchBoxRect(next)!;
    expect(box.width).toBeCloseTo(CELL, 6);
    expect(box.height).toBeCloseTo(CELL, 6);
  });

  it("leaves the box's bottom-left corner exactly where it was drawn", () => {
    const image = smallImage();
    const next = { ...image, ...calibrationTransform(image, oneStitch, 2.88)! };
    const box = stitchBoxRect(next)!;
    expect(box.x).toBeCloseTo(oneStitch.start.x, 6);
    expect(box.y).toBeCloseTo(oneStitch.start.y, 6);
  });

  it("anchors on the drawn corner however the box was dragged out", () => {
    const image = smallImage();
    // Dragged bottom-right to top-left: same rectangle, opposite direction.
    const reversed = { start: oneStitch.current, current: oneStitch.start };
    const next = { ...image, ...calibrationTransform(image, reversed, 2.88)! };
    const box = stitchBoxRect(next)!;
    expect(box.x).toBeCloseTo(oneStitch.start.x, 6);
    expect(box.y).toBeCloseTo(oneStitch.start.y, 6);
  });
});

describe("handleAt", () => {
  const image = (): ReferenceImage => ({
    ...smallImage(),
    x: 0,
    y: 0,
    width: 480,
    height: 360,
    stitchPin: { u: 0.25, v: 0.25 },
  });

  it("finds every one of the image's four corners, not just the old bottom-right", () => {
    const img = image();
    const found = (["bl", "br", "tl", "tr"] as const).map((corner) => {
      const p = cornerPoint(img, corner);
      return handleAt(img, p, 1)?.handle;
    });
    expect(found).toEqual(["bl", "br", "tl", "tr"]);
  });

  it("finds the stitch box's four corners too", () => {
    const img = image();
    const box = stitchBoxRect(img)!;
    for (const corner of ["bl", "br", "tl", "tr"] as const) {
      expect(handleAt(img, cornerPoint(box, corner), 1)).toEqual({ target: "stitch", handle: corner });
    }
  });

  it("prefers the stitch box, which sits inside the image and is the finer control", () => {
    // A stitch box cornered exactly on the image's bottom-left: both boxes
    // have a handle at the same point, and the smaller one has to win or it
    // would be permanently unreachable.
    const img = { ...image(), stitchPin: { u: 0, v: 0 } };
    expect(handleAt(img, { x: 0, y: 0 }, 1)?.target).toBe("stitch");
  });

  it("ignores stitch handles once the box is too small on screen to aim at", () => {
    // Zoomed out far enough that the whole box is a few pixels: its four
    // handles would otherwise blanket the image and swallow every drag.
    const img = image();
    const box = stitchBoxRect(img)!;
    expect(handleAt(img, cornerPoint(box, "tr"), 0.05)).not.toEqual({
      target: "stitch",
      handle: "tr",
    });
  });

  it("is null out in open space", () => {
    expect(handleAt(image(), { x: 240, y: 180 }, 1)).toBeNull();
  });

  it("finds each of the image's four edges between its corners", () => {
    const img = image();
    expect(handleAt(img, { x: 0, y: 180 }, 1)).toEqual({ target: "image", handle: "l" });
    expect(handleAt(img, { x: 480, y: 180 }, 1)).toEqual({ target: "image", handle: "r" });
    expect(handleAt(img, { x: 240, y: 0 }, 1)).toEqual({ target: "image", handle: "b" });
    expect(handleAt(img, { x: 240, y: 360 }, 1)).toEqual({ target: "image", handle: "t" });
  });

  it("gives a corner priority over the two edges meeting there", () => {
    // Dead on the bottom-left corner is also dead on both the left and
    // bottom edges - the corner has to win or it becomes unhittable.
    expect(handleAt(image(), { x: 0, y: 0 }, 1)?.handle).toBe("bl");
  });

  it("does not treat a point far past the end of an edge line as on it", () => {
    // Level with the left edge but well below the image: on the infinite
    // line, not on the box.
    expect(handleAt(image(), { x: 0, y: -200 }, 1)).toBeNull();
  });
});

describe("stitchResizeTransform", () => {
  const startImage = { x: 0, y: 0, width: 480, height: 360 };
  // Box from (100,100) to (124,124) - one cell, bottom-left anchored.
  const anchorWorld = { x: 100, y: 100 };
  const anchorFrac = { x: 100 / 480, y: 100 / 360 };

  it("leaves the anchored corner exactly where it was", () => {
    const next = stitchResizeTransform(startImage, anchorWorld, anchorFrac, { x: 160, y: 150 }, 1)!;
    const box = stitchBoxRect({ ...startImage, ...next } as never)!;
    expect(box.x).toBeCloseTo(anchorWorld.x, 8);
    expect(box.y).toBeCloseTo(anchorWorld.y, 8);
  });

  it("always resolves the box back to exactly one cell", () => {
    for (const cursor of [
      { x: 160, y: 150 },
      { x: 112, y: 118 },
      { x: 300, y: 280 },
    ]) {
      const next = stitchResizeTransform(startImage, anchorWorld, anchorFrac, cursor, 1)!;
      const box = stitchBoxRect({ ...startImage, ...next } as never)!;
      expect(box.width).toBeCloseTo(CELL, 8);
      expect(box.height).toBeCloseTo(CELL, 8);
    }
  });

  it("scales the image up when the drawn stitch is smaller than a cell", () => {
    // Dragging in to a 12-world-unit box says each stitch is half a cell,
    // so the image has to double to make it one.
    const next = stitchResizeTransform(startImage, anchorWorld, anchorFrac, { x: 112, y: 112 }, 1)!;
    expect(next.width).toBeCloseTo(960, 6);
    expect(next.height).toBeCloseTo(720, 6);
  });

  it("anchors a corner on the far side just as firmly", () => {
    // Anchor at the box's top-right instead: dragging the bottom-left corner.
    const farAnchor = { x: 124, y: 124 };
    const farFrac = { x: 124 / 480, y: 124 / 360 };
    const next = stitchResizeTransform(startImage, farAnchor, farFrac, { x: 80, y: 90 }, 1)!;
    const box = stitchBoxRect({ ...startImage, ...next } as never)!;
    expect(box.x + box.width).toBeCloseTo(farAnchor.x, 8);
    expect(box.y + box.height).toBeCloseTo(farAnchor.y, 8);
  });

  it("refuses a box too small to be a real drag, instead of exploding the scale", () => {
    expect(stitchResizeTransform(startImage, anchorWorld, anchorFrac, { x: 101, y: 101 }, 1)).toBeNull();
    // ...but the same drag is fine once zoomed in enough to have meant it.
    expect(stitchResizeTransform(startImage, anchorWorld, anchorFrac, { x: 101, y: 101 }, 8)).not.toBeNull();
  });

  it("keeps the recalibrated pin on the image when a handle is dragged past an edge", () => {
    const next = stitchResizeTransform(startImage, anchorWorld, anchorFrac, { x: -100, y: -100 }, 1)!;

    expect(next.stitchPin).toEqual({ u: 0, v: 0 });
  });
});

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
    const img = { ...smallImage(), ...size, stitchPin: pin };
    const snapped = { ...img, ...snapImageToGrid(11, 7, size, pin) };
    const box = stitchBoxRect(snapped)!;
    // Same size as a cell and on a cell boundary: it *is* a cell.
    expect(box.width).toBe(CELL);
    expect(box.height).toBe(CELL);
    expect(Math.round(box.x / CELL) * CELL).toBeCloseTo(box.x, 9);
    expect(Math.round(box.y / CELL) * CELL).toBeCloseTo(box.y, 9);
  });
});
