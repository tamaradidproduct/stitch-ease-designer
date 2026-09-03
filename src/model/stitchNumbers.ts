import type { DocIndex } from "./docIndex";

/** The library's explicit placeholder: it occupies grid space, but is not knit. */
const NO_STITCH = "empty";
const key = (col: number, row: number) => `${col},${row}`;

export type StitchGroup = {
  /** Every occupied cell, including explicit no-stitch cells used as structure. */
  cells: Set<string>;
  /** Only cells representing stitches the knitter actually works. */
  stitchColsByRow: Map<number, number[]>;
};

/**
 * Infer temporary chart scopes from touching placements. Horizontal, vertical,
 * and diagonal neighbours belong to one group, which keeps ordinary shaping
 * connected while allowing distant motifs to number independently.
 */
export function stitchGroups(index: DocIndex): StitchGroup[] {
  const cells = new Map<string, { col: number; row: number; isStitch: boolean }>();

  for (const placement of index.placements.values()) {
    for (let offset = 0; offset < index.spanOf(placement); offset++) {
      const col = placement.col + offset;
      cells.set(key(col, placement.row), {
        col,
        row: placement.row,
        isStitch: placement.symbolId !== NO_STITCH,
      });
    }
  }

  const unseen = new Set(cells.keys());
  const groups: StitchGroup[] = [];
  while (unseen.size) {
    const first = unseen.values().next().value as string;
    const queue = [first];
    const groupCells = new Set<string>();
    const stitchColsByRow = new Map<number, number[]>();
    unseen.delete(first);

    while (queue.length) {
      const currentKey = queue.pop()!;
      const current = cells.get(currentKey)!;
      groupCells.add(currentKey);
      if (current.isStitch) {
        const cols = stitchColsByRow.get(current.row) ?? [];
        cols.push(current.col);
        stitchColsByRow.set(current.row, cols);
      }

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const neighbour = key(current.col + dx, current.row + dy);
          if (unseen.delete(neighbour)) queue.push(neighbour);
        }
      }
    }

    // No-stitch placeholders can bridge real stitches, but a placeholder-only
    // island does not have knitter-facing numbering of its own.
    if (stitchColsByRow.size) groups.push({ cells: groupCells, stitchColsByRow });
  }

  return groups;
}

export function stitchGroupAt(
  index: DocIndex,
  col: number,
  row: number,
): StitchGroup | null {
  return stitchGroups(index).find((group) => group.cells.has(key(col, row))) ?? null;
}

/** Stitch numbers for one row of one connected group, read right to left. */
export function roundStitchNumbers(
  index: DocIndex,
  col: number,
  row: number,
): Map<number, number> {
  const group = stitchGroupAt(index, col, row);
  const cols = [...(group?.stitchColsByRow.get(row) ?? [])].sort((a, b) => b - a);
  return new Map(cols.map((stitchCol, i) => [stitchCol, i + 1]));
}

export function roundStitchNumberAt(
  index: DocIndex,
  col: number,
  row: number,
): number | null {
  return roundStitchNumbers(index, col, row).get(col) ?? null;
}

/** Knitter-facing rows for one connected group, counted bottom to top. */
export function knittedRowNumbers(group: StitchGroup): Map<number, number> {
  return new Map(
    [...group.stitchColsByRow.keys()]
      .sort((a, b) => a - b)
      .map((groupRow, i) => [groupRow, i + 1]),
  );
}

export function knittedRowNumberAt(
  index: DocIndex,
  col: number,
  row: number,
): number | null {
  const group = stitchGroupAt(index, col, row);
  return group ? knittedRowNumbers(group).get(row) ?? null : null;
}
