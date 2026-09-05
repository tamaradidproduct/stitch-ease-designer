import { CELL } from "../canvas/camera";
import { markCentre, type CalibrationMark, type ReferenceImage } from "./types";

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
export function scaleFromCalibrationMarks(
  image: Pick<ReferenceImage, "x" | "y" | "width" | "height" | "naturalWidth" | "naturalHeight">,
  allMarks: CalibrationMark[],
): Partial<ReferenceImage> | null {
  const marks = allMarks.filter((m) => m.stitch !== null && m.row !== null);
  if (marks.length < 2) return null;

  // The fit runs on the *centres* of the boxes, not their sizes. A box is
  // twenty-odd source pixels across, and measuring a stitch from one is
  // exactly the imprecision this whole flow exists to escape: the distance
  // between two corners of the chart is the same measurement taken over a
  // hundred times the span, so its error is a hundredth the size. The boxes
  // are there to say *which* stitch, and to be adjustable, not to be
  // measured.
  const centres = marks.map(markCentre);
  const perStitch = slope(marks.map((m) => m.stitch!), centres.map((c) => c.u));
  const perRow = slope(marks.map((m) => m.row!), centres.map((c) => c.v));
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
  const meanU = centres.reduce((a, c) => a + c.u, 0) / centres.length;
  const meanV = centres.reduce((a, c) => a + c.v, 0) / centres.length;
  const anchorX = image.x + meanU * image.width;
  const anchorY = image.y + meanV * image.height;
  const x = anchorX - meanU * width;
  const y = anchorY - meanV * height;

  // Pin the bottom-left mark's own stitch, matching what "Set stitch size"
  // establishes - the boxed stitch's bottom-left corner, so it can be
  // snapped onto a grid line and hold every later resize.
  const anchor = marks.reduce((best, m) => (m.u + m.v < best.u + best.v ? m : best));
  const pin = { u: clamp01(anchor.u), v: clamp01(anchor.v) };

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

/** A fresh mark id. Only has to be unique within one image's list. */
export function newCalibrationMarkId(): string {
  return `mark_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const addCalibrationMark = (
  marks: CalibrationMark[] | undefined,
  mark: CalibrationMark,
): CalibrationMark[] => [...(marks ?? []), mark];

export const patchCalibrationMark = (
  marks: CalibrationMark[] | undefined,
  id: string,
  patch: Partial<CalibrationMark>,
): CalibrationMark[] => (marks ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));

export const withoutCalibrationMark = (
  marks: CalibrationMark[] | undefined,
  id: string,
): CalibrationMark[] => (marks ?? []).filter((m) => m.id !== id);
