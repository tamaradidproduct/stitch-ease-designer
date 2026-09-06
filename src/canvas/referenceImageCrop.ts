import { CELL, cellToWorld } from "./camera";
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
