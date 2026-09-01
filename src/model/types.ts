/** One stitch placed on the grid. */
export type Placement = {
  id: string;
  /** Slug into the symbol registry, e.g. "k2tog" or "3_3_left_cable". */
  symbolId: string;
  /** Leftmost cell the stitch occupies. It also covers col .. col + span - 1. */
  col: number;
  /** Row index. +row is UP: row 0 is the bottom of a chart. */
  row: number;
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

/** Serialised form. Shaped for a Supabase row so the later move is a no-op. */
export type DocSnapshot = {
  version: number;
  id: string;
  name: string;
  /** Null until accounts exist; the column is here from the start. */
  userId: string | null;
  updatedAt: string;
  placements: Placement[];
};

export type DocMeta = Pick<DocSnapshot, "id" | "name" | "updatedAt">;

export const SNAPSHOT_VERSION = 1;
