import type { Placement } from "./types";
import { spanOf } from "../symbols/registry";

export type ChartBounds = { minCol: number; maxCol: number; minRow: number; maxRow: number };

/** The smallest rectangle covering every placement, spans included. Null for an empty chart. */
export function chartBounds(placements: Iterable<Placement>): ChartBounds | null {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;

  for (const p of placements) {
    const span = spanOf(p.symbolId);
    minCol = Math.min(minCol, p.col);
    maxCol = Math.max(maxCol, p.col + span - 1);
    minRow = Math.min(minRow, p.row);
    maxRow = Math.max(maxRow, p.row);
  }

  return Number.isFinite(minCol) ? { minCol, maxCol, minRow, maxRow } : null;
}
