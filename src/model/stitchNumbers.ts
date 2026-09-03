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

export type ChartTopology = {
  groups: StitchGroup[];
  groupByCell: Map<string, StitchGroup>;
};

const topologyCache = new WeakMap<DocIndex, { revision: number; topology: ChartTopology }>();

/**
 * Infer temporary chart scopes from touching placements. Horizontal, vertical,
 * and diagonal neighbours belong to one group, which keeps ordinary shaping
 * connected while allowing distant motifs to number independently.
 */
function buildTopology(index: DocIndex): ChartTopology {
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
  const groupByCell = new Map<string, StitchGroup>();
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
    if (stitchColsByRow.size) {
      const group = { cells: groupCells, stitchColsByRow };
      groups.push(group);
      for (const cell of groupCells) groupByCell.set(cell, group);
    }
  }

  return { groups, groupByCell };
}

/** Builds chart-wide numbering topology once per document revision. */
export function chartTopology(index: DocIndex, revision: number): ChartTopology {
  const cached = topologyCache.get(index);
  if (cached?.revision === revision) return cached.topology;
  const topology = buildTopology(index);
  topologyCache.set(index, { revision, topology });
  return topology;
}

export function stitchGroups(index: DocIndex, revision?: number): StitchGroup[] {
  return revision === undefined ? buildTopology(index).groups : chartTopology(index, revision).groups;
}

export function stitchGroupAt(
  index: DocIndex,
  col: number,
  row: number,
  revision?: number,
): StitchGroup | null {
  if (revision !== undefined) return chartTopology(index, revision).groupByCell.get(key(col, row)) ?? null;
  return stitchGroups(index).find((group) => group.cells.has(key(col, row))) ?? null;
}

/** Stitch numbers for one row of one connected group, read right to left. */
export function roundStitchNumbers(
  index: DocIndex,
  col: number,
  row: number,
  revision?: number,
): Map<number, number> {
  const group = stitchGroupAt(index, col, row, revision);
  const cols = [...(group?.stitchColsByRow.get(row) ?? [])].sort((a, b) => b - a);
  return new Map(cols.map((stitchCol, i) => [stitchCol, i + 1]));
}

export function roundStitchNumberAt(
  index: DocIndex,
  col: number,
  row: number,
  revision?: number,
): number | null {
  return roundStitchNumbers(index, col, row, revision).get(col) ?? null;
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
  revision?: number,
): number | null {
  const group = stitchGroupAt(index, col, row, revision);
  return group ? knittedRowNumbers(group).get(row) ?? null : null;
}
