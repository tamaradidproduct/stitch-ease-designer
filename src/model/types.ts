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
};

/**
 * The transform that resizes `image` to `newWidth`/`newHeight` while keeping
 * `anchor` - a world-space point - visually fixed: everything else in the
 * image scales around it. Used for the drag-a-box calibration (anchored on
 * the box's own centre) and the manual size controls (anchored on the
 * image's current centre) - either way, resizing shouldn't make the image
 * jump somewhere else on screen as a side effect. `newWidth` and `newHeight`
 * are independent, so this covers both uniform and stretched resizing.
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
