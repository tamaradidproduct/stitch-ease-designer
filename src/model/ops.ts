import { spanOf } from "../symbols/registry";
import type { DocIndex } from "./docIndex";
import { EMPTY_CHANGE, type Change, type Placement } from "./types";

/**
 * Every mutation goes through here and produces a `Change`, so undo is never a
 * bespoke inverse per operation.
 */

/**
 * Placement ids are runtime-only: they key the occupancy map and the undo
 * stack, and nothing persisted depends on them, so loading a stored chart
 * mints fresh ones rather than round-tripping the originals.
 */
export const newPlacementId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const newId = newPlacementId;

/**
 * Apply a change and return its inverse.
 *
 * Removals run first: placing a wide stitch over narrower ones has to clear
 * their cells before the new one claims them, or the occupancy map ends up
 * with cells still pointing at a placement that's gone.
 */
export function apply(index: DocIndex, change: Change): Change {
  for (const p of change.removed) index.remove(p.id);
  for (const p of change.added) index.add(p);
  return { added: change.removed, removed: change.added };
}

/**
 * Place `symbolId` with its leftmost cell at (col, row).
 *
 * Anything the new stitch overlaps is removed *whole*. A stitch is indivisible:
 * dropping a knit into the middle of a 3/3 cable deletes the cable rather than
 * leaving four orphaned cells that no longer mean anything.
 */
export function placeChange(
  index: DocIndex,
  symbolId: string,
  col: number,
  row: number,
): Change {
  const span = spanOf(symbolId);
  const evicted = new Map<string, Placement>();

  for (let c = col; c < col + span; c++) {
    const hit = index.placementAt(c, row);
    if (hit) evicted.set(hit.id, hit);
  }

  const placement: Placement = { id: newId(), symbolId, col, row };

  // Replacing a stitch with the same symbol in the same spot is a no-op, so
  // drag-painting across a cell repeatedly doesn't pile up history entries.
  if (evicted.size === 1) {
    const only = [...evicted.values()][0]!;
    if (only.symbolId === symbolId && only.col === col && only.row === row) {
      return EMPTY_CHANGE;
    }
  }

  return { added: [placement], removed: [...evicted.values()] };
}

/** Remove whatever covers this cell, anchor cell or not. */
export function eraseChange(index: DocIndex, col: number, row: number): Change {
  const hit = index.placementAt(col, row);
  return hit ? { added: [], removed: [hit] } : EMPTY_CHANGE;
}

/** Merge changes made during one drag into a single undo entry. */
export function mergeChanges(changes: Change[]): Change {
  const added = new Map<string, Placement>();
  const removed = new Map<string, Placement>();

  for (const change of changes) {
    for (const p of change.removed) {
      // A placement created earlier in the same stroke and removed later never
      // existed as far as the outside world is concerned.
      if (added.delete(p.id)) continue;
      if (!removed.has(p.id)) removed.set(p.id, p);
    }
    for (const p of change.added) added.set(p.id, p);
  }

  return { added: [...added.values()], removed: [...removed.values()] };
}
