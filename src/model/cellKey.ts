export type GridCell = { col: number; row: number };

/** Stable serialization for maps and sets keyed by a single canvas cell. */
export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Parse a serialized cell key, rejecting malformed or fractional coordinates. */
export function parseCellKey(key: string): GridCell | null {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return null;

  const col = Number(match[1]);
  const row = Number(match[2]);
  return Number.isSafeInteger(col) && Number.isSafeInteger(row) ? { col, row } : null;
}

/**
 * Resolve serialized cells that are still empty.
 *
 * Suggest markers can outlive the action that created them. Keeping this
 * filtering here ensures every UI reports the same live set when a stitch has
 * since been placed over a marker or persisted data contains an invalid key.
 */
export function unoccupiedCellsFromKeys(
  keys: Iterable<string>,
  isOccupied: (col: number, row: number) => boolean,
): GridCell[] {
  const cells: GridCell[] = [];
  for (const key of keys) {
    const cell = parseCellKey(key);
    if (cell && !isOccupied(cell.col, cell.row)) cells.push(cell);
  }
  return cells;
}
