import { CELL } from "../canvas/camera";
import type { ReferenceImage } from "./types";

/**
 * One place on the reference photo the designer has identified, by reading
 * the stitch and row numbers printed along the chart's edges.
 *
 * Stored as a fraction of the image (0..1 from its bottom-left) rather than
 * in world units, so the marks travel with the image for free while it is
 * moved or rescaled - including the rescale this calibration itself
 * applies, which is what lets the fit be re-run after nudging one mark.
 */
export type CalibrationPoint = {
  id: string;
  u: number;
  v: number;
  /**
   * Numbers as *printed on the chart*, not grid coordinates. Null until
   * typed - a mark can be placed before it's labelled.
   */
  stitch: number | null;
  row: number | null;
};

/** Smallest the fit is allowed to scale an image to, in world units: one cell. */
const MIN_SIZE = 24;
/**
 * Fewest source pixels per stitch the fit will accept.
 *
 * A guard against a typo in the numbers rather than against unusual charts:
 * "stitch 1 to stitch 10000" across one photo asks for a scale at which a
 * stitch is a twentieth of a pixel, which no photograph carries and no
 * chart has. Expressed against the source resolution rather than as a flat
 * size cap, because that's the thing that actually decides whether the
 * marks could have been read off the image in the first place.
 */
const MIN_SOURCE_PX_PER_STITCH = 2;

/**
 * Least-squares slope of `ys` against `xs`, or null when `xs` has no spread
 * to regress against - all the marks naming the same stitch number, say,
 * which pins down no scale at all.
 */
function slope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    num += dx * (ys[i]! - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  const b = num / den;
  return Number.isFinite(b) && b !== 0 ? b : null;
}

/**
 * Scales the image so the stitches the designer identified come out one
 * cell apart, and positions it so those stitches land on the grid.
 *
 * Only the *spread* of the typed numbers is used, never their absolute
 * value: the fit asks "how much image is one stitch worth?", which is a
 * question about differences. That sidesteps the fact that charts number
 * stitches right-to-left, so stitch 36 sits to the *left* of stitch 24 and
 * a naive number-to-column mapping would come out mirrored. Taking the
 * magnitude of each slope means either direction calibrates the same.
 *
 * Both axes are fit independently over every labelled mark, so four marks
 * over-determine the two scales and a mark placed slightly off centre is
 * averaged out rather than skewing the result - the reason for asking for
 * four rather than the two that would suffice.
 *
 * Returns null when the marks don't determine a scale: fewer than two
 * labelled, or no spread in the stitch numbers or the row numbers.
 */
export function scaleFromCalibrationPoints(
  image: Pick<ReferenceImage, "x" | "y" | "width" | "height" | "naturalWidth" | "naturalHeight">,
  points: CalibrationPoint[],
): Partial<ReferenceImage> | null {
  const marks = points.filter((p) => p.stitch !== null && p.row !== null);
  if (marks.length < 2) return null;

  // Fraction-of-image per stitch, and per row.
  const perStitch = slope(marks.map((p) => p.stitch!), marks.map((p) => p.u));
  const perRow = slope(marks.map((p) => p.row!), marks.map((p) => p.v));
  if (perStitch === null || perRow === null) return null;

  const width = CELL / Math.abs(perStitch);
  const height = CELL / Math.abs(perRow);
  if (width < MIN_SIZE || height < MIN_SIZE) return null;
  if (
    (image.naturalWidth * CELL) / width < MIN_SOURCE_PX_PER_STITCH ||
    (image.naturalHeight * CELL) / height < MIN_SOURCE_PX_PER_STITCH
  ) {
    return null;
  }

  // Scale about the centroid of the marks, so the region actually being
  // matched stays put instead of sliding off while everything around it
  // grows.
  const meanU = marks.reduce((a, p) => a + p.u, 0) / marks.length;
  const meanV = marks.reduce((a, p) => a + p.v, 0) / marks.length;
  const anchorX = image.x + meanU * image.width;
  const anchorY = image.y + meanV * image.height;
  const x = anchorX - meanU * width;
  const y = anchorY - meanV * height;

  // Pin the bottom-left mark's own stitch, matching what "Set stitch size"
  // establishes: marks name the centre of a stitch, and the pin is that
  // cell's bottom-left corner, so it can be snapped onto a grid line.
  const anchorMark = marks.reduce((best, p) => (p.u + p.v < best.u + best.v ? p : best));
  const pin = {
    u: clamp01(anchorMark.u - CELL / 2 / width),
    v: clamp01(anchorMark.v - CELL / 2 / height),
  };

  const snapped = snapImageToGrid(x, y, { width, height }, pin);
  return { ...snapped, width, height, stitchPin: pin };
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Nudges a candidate image position so the calibrated stitch lands squarely
 * on a grid cell.
 *
 * The stitch box is exactly one cell, so putting its bottom-left on a grid
 * intersection makes it coincide with a cell outright - which is the whole
 * goal of positioning a chart photo, and fiddly to hit by hand at any
 * useful zoom. The nearest intersection is always within half a cell, so
 * this needs no threshold: it can only ever pull the image a short way.
 */
export function snapImageToGrid(
  x: number,
  y: number,
  size: { width: number; height: number },
  pin: { u: number; v: number },
): { x: number; y: number } {
  const pinX = x + pin.u * size.width;
  const pinY = y + pin.v * size.height;
  return {
    x: x + (Math.round(pinX / CELL) * CELL - pinX),
    y: y + (Math.round(pinY / CELL) * CELL - pinY),
  };
}
