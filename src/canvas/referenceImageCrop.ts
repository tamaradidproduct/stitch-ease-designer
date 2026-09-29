import { CELL, cellToWorld } from "./camera";
import { calibratedImageBounds } from "../model/referenceCalibration";
import type { ReferenceImage } from "../model/types";

export const DEFAULT_CROP_SIZE = 32;

/**
 * Crops the reference image to whatever falls under one grid cell, using the
 * same world<->image-pixel transform the calibration tool relies on: the
 * image's `x`/`y`/`width`/`height` (world units) against its own
 * `naturalWidth`/`naturalHeight` (source pixels) gives pixels-per-world-unit
 * on each axis independently, since the image can be stretched non-uniformly.
 */
export function cropReferenceImageCell(
  image: ReferenceImage,
  img: CanvasImageSource,
  col: number,
  row: number,
  size = DEFAULT_CROP_SIZE,
): HTMLCanvasElement {
  const world = cellToWorld(col, row);
  const pxPerUnitX = image.naturalWidth / image.width;
  const pxPerUnitY = image.naturalHeight / image.height;

  // World +y is up; the image's own pixel rows grow downward from its top
  // edge (world y + height), so a cell's *top* in image-pixel space comes
  // from its world *top* (row + 1), not its own row origin.
  const srcX = (world.x - image.x) * pxPerUnitX;
  const srcY = (image.y + image.height - (world.y + CELL)) * pxPerUnitY;
  const srcW = CELL * pxPerUnitX;
  const srcH = CELL * pxPerUnitY;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
  return canvas;
}

/**
 * Whether a cell falls entirely within the reference image's own bounds -
 * used to tell "this placement was traced from the reference, so it's a
 * trustworthy exemplar of what that stitch looks like in this photo" apart
 * from "this placement is somewhere else on the infinite canvas and has nothing
 * to do with the image at all".
 */
export function cellWithinReferenceImage(
  image: ReferenceImage,
  col: number,
  row: number,
): boolean {
  const world = cellToWorld(col, row);
  return (
    world.x >= image.x &&
    world.x + CELL <= image.x + image.width &&
    world.y >= image.y &&
    world.y + CELL <= image.y + image.height
  );
}

/**
 * Whether a cell falls entirely within an image's *calibrated* crop -
 * the region actually spanned by its named calibration marks - rather than
 * just its overall bounds. Used to keep Suggest from trusting a region of
 * the photo the designer never actually calibrated against: positional
 * error from the calibration fit is smallest near the marks and grows with
 * distance from them (#266), so a cell outside the calibrated region is
 * excluded from matching entirely instead of matched with unreliable crop
 * bounds.
 *
 * Images that don't opt into `cropToCalibration`, or that have no named
 * marks yet, impose no restriction here - same as before this crop existed.
 */
export function cellWithinCalibratedCrop(
  image: ReferenceImage,
  col: number,
  row: number,
): boolean {
  if (!image.cropToCalibration) return true;
  const bounds = calibratedImageBounds(image.calibrationMarks ?? []);
  if (!bounds) return true;

  const world = cellToWorld(col, row);
  const minX = image.x + bounds.minU * image.width;
  const maxX = image.x + bounds.maxU * image.width;
  const minY = image.y + bounds.minV * image.height;
  const maxY = image.y + bounds.maxV * image.height;
  return world.x >= minX && world.x + CELL <= maxX && world.y >= minY && world.y + CELL <= maxY;
}
