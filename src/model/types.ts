import { CELL } from "../canvas/camera";

/** One stitch placed on the grid. */
export type Placement = {
  id: string;
  /** Slug into the symbol registry, e.g. "k2tog" or "3_3_left_cable". */
  symbolId: string;
  /** Leftmost cell the stitch occupies. It also covers col .. col + span - 1. */
  col: number;
  /** Row index. +row is UP: row 0 is the bottom of a chart. */
  row: number;
  /** Independent repeat/group instance this placement belongs to. */
  groupId?: string;
};

export type RepeatStitch = { symbolId: string; col: number; row: number };

/** A reusable stitch sequence stored only with the chart that created it. */
export type RepeatDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  stitches: RepeatStitch[];
};

/**
 * A reversible edit. Applying it removes `removed` and adds `added`; the
 * inverse is simply the two swapped, which is what makes undo/redo a single
 * code path rather than an operation-by-operation special case.
 */
export type Change = {
  added: Placement[];
  removed: Placement[];
};

export const EMPTY_CHANGE: Change = { added: [], removed: [] };

export const isEmptyChange = (c: Change): boolean =>
  c.added.length === 0 && c.removed.length === 0;

/**
 * A chart's identity and bookkeeping — everything except the stitches.
 *
 * No `userId`: the Supabase column defaults to `auth.uid()` and the row-level
 * security policy enforces it, so the client never sends an owner and can't
 * claim to be someone else. Ownership is the database's business.
 */
export type DocMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Opaque token for the exact stored revision, changed on every write.
   *
   * Saves pass back the rev they loaded so a stale write can be rejected
   * instead of clobbering someone — realistically the same designer with two
   * tabs open. A timestamp can't do this job: two saves inside the same
   * millisecond would compare equal and the stale one would be let through.
   */
  rev: string;
};

/** A chart as the app holds it: metadata plus live placements. */
export type DocSnapshot = DocMeta & { placements: Placement[] };

/**
 * A pattern screenshot placed behind the chart to trace against.
 *
 * Position and size are in world units (the same space as a placement's
 * `col`/`row` times `CELL`), anchored at the image's bottom-left corner —
 * the natural anchor here, matching how a chart itself grows upward from
 * its bottom-left. Not part of undo/redo, same as camera pan/zoom.
 */
export type ReferenceImage = {
  /**
   * Either a `data:` URL (a locally-stored chart, not signed in) or a path
   * within the `reference-images` Supabase Storage bucket (resolved to a
   * signed URL at render time) — never a bare, permanent URL either way.
   */
  ref: string;
  x: number;
  y: number;
  /**
   * Width and height in world units, independent of each other and of the
   * source image's own aspect ratio - a scanned or photographed chart
   * doesn't always have square stitches, so squashing/stretching the image
   * to match the app's square grid has to be possible, not just uniform
   * scaling.
   */
  width: number;
  height: number;
  /**
   * The uploaded file's own pixel dimensions, captured once at upload time.
   * Used only as the 100% baseline for the manual size controls and as the
   * default aspect ratio for a fresh upload - `width`/`height` above are the
   * source of truth for how the image actually draws.
   */
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /**
   * Draw the image over the chart rather than behind it - for checking your
   * stitches against the source by eye, where having the original on top
   * (at partial opacity) is what makes a mismatch obvious. Optional so
   * charts stored before this existed still load: absent means behind.
   */
  inFront?: boolean;
  /**
   * The bottom-left corner of the one stitch the designer boxed with "Set
   * stitch size", kept after calibration rather than discarded - it's what
   * every later resize is anchored to, so that aligning the first stitch to
   * the grid is done once and stays done.
   *
   * Only the corner is stored, because the box it implies is *always*
   * exactly one cell (see `stitchBoxRect`). Storing its size too let the
   * box drift to some other size as the image was rescaled, which defeated
   * the point: a box that isn't cell-sized can't be compared to a grid cell
   * by eye, so it stopped being usable as the thing you align against.
   *
   * A fraction of the image (0..1 from its bottom-left), never world units,
   * so it travels with the image for free: moving or resizing the image
   * carries it along with no separate bookkeeping to keep in sync.
   */
  stitchPin?: { u: number; v: number };
  /**
   * Stitches boxed by "Set scale from stitches", each naming the stitch and
   * row printed on the chart beside it - typically one in each corner.
   *
   * Stored with the image rather than held in UI state: boxing four of them
   * accurately is real work, and losing it to a refresh - or to flipping to
   * another chart and back - made the feature feel like it was eating
   * progress. They also belong to this photo specifically, which is exactly
   * what the image record is.
   */
  calibrationMarks?: CalibrationMark[];
};

/**
 * One stitch on the reference photo that the designer has boxed and named.
 *
 * A box rather than a point, drawn the same way "Set stitch size" is drawn:
 * framing a stitch is how you say *which* stitch you mean, and a rectangle
 * you can see the edges of is far easier to put on the right one than a
 * cross-hair with nothing to line up against.
 *
 * `u`/`v` are its bottom-left corner and `w`/`h` its size, all as fractions
 * of the image (0..1) rather than world units, so a mark travels with the
 * image for free while it is moved or rescaled - including the rescale the
 * calibration itself applies, which is what lets the fit be re-run after
 * adjusting one mark.
 */
export type CalibrationMark = {
  id: string;
  u: number;
  v: number;
  w: number;
  h: number;
  /** Numbers as *printed on the chart*, not grid coordinates. Null until typed. */
  stitch: number | null;
  row: number | null;
};

/** The middle of a boxed stitch, as a fraction of the image. */
export const markCentre = (mark: CalibrationMark): { u: number; v: number } => ({
  u: mark.u + mark.w / 2,
  v: mark.v + mark.h / 2,
});

/**
 * A rectangle's four corners, named by world-space position - `b`ottom is
 * the smaller y, since +y is up here.
 */
export type Corner = "bl" | "br" | "tl" | "tr";

export const CORNERS: readonly Corner[] = ["bl", "br", "tl", "tr"];

/** A rectangle's four sides. */
export type Edge = "l" | "r" | "t" | "b";

export const EDGES: readonly Edge[] = ["l", "r", "t", "b"];

/** Anything on a bounding box you can grab to resize it. */
export type BoxHandle = Corner | Edge;

/**
 * Which way each axis moves when `handle` is dragged outward, and which
 * axes it touches at all: 0 means the handle leaves that axis alone, which
 * is exactly what makes an edge an edge rather than a corner.
 */
export function handleSigns(handle: BoxHandle): { sx: -1 | 0 | 1; sy: -1 | 0 | 1 } {
  return {
    sx: handle === "r" || handle === "br" || handle === "tr" ? 1
      : handle === "l" || handle === "bl" || handle === "tl" ? -1
      : 0,
    sy: handle === "t" || handle === "tl" || handle === "tr" ? 1
      : handle === "b" || handle === "bl" || handle === "br" ? -1
      : 0,
  };
}

/** The corner a drag holds still: the one diagonally across from it. */
export const OPPOSITE_CORNER: Record<Corner, Corner> = {
  bl: "tr",
  br: "tl",
  tl: "br",
  tr: "bl",
};

/** Where `corner` sits on `rect`, in whatever space `rect` is expressed in. */
export function cornerPoint(
  rect: { x: number; y: number; width: number; height: number },
  corner: Corner,
): { x: number; y: number } {
  return {
    x: corner === "br" || corner === "tr" ? rect.x + rect.width : rect.x,
    y: corner === "tl" || corner === "tr" ? rect.y + rect.height : rect.y,
  };
}

/**
 * The calibrated stitch's box in world space, or null if the image has
 * never been calibrated. `x`/`y` are its bottom-left corner - the point the
 * size controls are pinned to.
 *
 * Always exactly one cell, so it can be read against the chart's own grid
 * at a glance: lined up with a grid cell means the photo is calibrated and
 * positioned, and any mismatch is exactly the correction still to make.
 * Its size is never stored, so nothing can knock it off that.
 */
export function stitchBoxRect(
  image: Pick<ReferenceImage, "x" | "y" | "width" | "height" | "stitchPin">,
): { x: number; y: number; width: number; height: number } | null {
  const pin = image.stitchPin;
  if (!pin) return null;
  return {
    x: image.x + pin.u * image.width,
    y: image.y + pin.v * image.height,
    width: CELL,
    height: CELL,
  };
}

/**
 * The transform that resizes `image` to `newWidth`/`newHeight` while keeping
 * `anchor` - a world-space point - visually fixed: everything else in the
 * image scales around it. Once the image has a `stitchPin`, that stitch box's
 * bottom-left corner is the anchor for every resize, so the stitch the
 * designer lined up with the grid stays lined up; before then it's the
 * image's own centre, so a resize doesn't fling it off-screen. `newWidth`
 * and `newHeight` are independent, so this covers both uniform and
 * stretched resizing.
 */
export function resizeReferenceImageAround(
  image: Pick<ReferenceImage, "x" | "y" | "width" | "height">,
  newWidth: number,
  newHeight: number,
  anchor: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  const relX = (anchor.x - image.x) / image.width;
  const relY = (anchor.y - image.y) / image.height;
  return {
    width: newWidth,
    height: newHeight,
    x: anchor.x - relX * newWidth,
    y: anchor.y - relY * newHeight,
  };
}
