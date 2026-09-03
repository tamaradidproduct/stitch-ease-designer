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
