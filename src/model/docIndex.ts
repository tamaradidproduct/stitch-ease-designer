import { spanOf } from "../symbols/registry";
import type { Placement } from "./types";

/**
 * Placements plus the two derived indexes the canvas needs.
 *
 * Neither index is persisted — both are rebuilt from the placement list on
 * load, so a snapshot stays a plain array of stitches and can't disagree with
 * itself.
 */

/** Cells per chunk, per axis. Chunks exist purely to make culling cheap. */
export const CHUNK = 64;

const cellKey = (col: number, row: number) => `${col},${row}`;
const chunkKey = (col: number, row: number) =>
  `${Math.floor(col / CHUNK)},${Math.floor(row / CHUNK)}`;

export type CellBounds = {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
};

export class DocIndex {
  readonly placements = new Map<string, Placement>();
  /** Every covered cell -> the placement covering it. */
  readonly occupancy = new Map<string, string>();
  private readonly chunks = new Map<string, Set<string>>();
  private readonly groups = new Map<string, Set<string>>();

  static from(placements: Iterable<Placement>): DocIndex {
    const index = new DocIndex();
    for (const p of placements) index.add(p);
    return index;
  }

  get size(): number {
    return this.placements.size;
  }

  spanOf(p: Placement): number {
    return spanOf(p.symbolId);
  }

  add(p: Placement): void {
    this.placements.set(p.id, p);
    if (p.groupId) {
      let members = this.groups.get(p.groupId);
      if (!members) this.groups.set(p.groupId, (members = new Set()));
      members.add(p.id);
    }
    const span = this.spanOf(p);
    for (let c = p.col; c < p.col + span; c++) {
      this.occupancy.set(cellKey(c, p.row), p.id);
      const key = chunkKey(c, p.row);
      let bucket = this.chunks.get(key);
      if (!bucket) this.chunks.set(key, (bucket = new Set()));
      bucket.add(p.id);
    }
  }

  remove(id: string): Placement | undefined {
    const p = this.placements.get(id);
    if (!p) return undefined;
    this.placements.delete(id);
    if (p.groupId) {
      const members = this.groups.get(p.groupId);
      if (members) {
        members.delete(id);
        if (members.size === 0) this.groups.delete(p.groupId);
      }
    }

    const span = this.spanOf(p);
    for (let c = p.col; c < p.col + span; c++) {
      const cell = cellKey(c, p.row);
      // Only clear the cell if this placement still owns it.
      if (this.occupancy.get(cell) === id) this.occupancy.delete(cell);

      const key = chunkKey(c, p.row);
      const bucket = this.chunks.get(key);
      if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) this.chunks.delete(key);
      }
    }
    return p;
  }

  /** The placement covering this cell, wherever its anchor happens to be. */
  placementAt(col: number, row: number): Placement | undefined {
    const id = this.occupancy.get(cellKey(col, row));
    return id === undefined ? undefined : this.placements.get(id);
  }

  /** Every placement in one explicit repeat/group instance. */
  groupMembers(groupId: string): Placement[] {
    return [...(this.groups.get(groupId) ?? [])]
      .map((id) => this.placements.get(id))
      .filter((placement): placement is Placement => !!placement);
  }

  /**
   * Every placement whose cells intersect `bounds`. Reads only the chunks the
   * viewport touches, so cost scales with what's on screen rather than with
   * document size.
   */
  query(bounds: CellBounds): Placement[] {
    const out: Placement[] = [];
    const seen = new Set<string>();

    const c0 = Math.floor(bounds.minCol / CHUNK);
    const c1 = Math.floor(bounds.maxCol / CHUNK);
    const r0 = Math.floor(bounds.minRow / CHUNK);
    const r1 = Math.floor(bounds.maxRow / CHUNK);

    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        const bucket = this.chunks.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const id of bucket) {
          if (seen.has(id)) continue;
          seen.add(id);
          const p = this.placements.get(id);
          if (!p) continue;
          if (p.row < bounds.minRow || p.row > bounds.maxRow) continue;
          if (p.col + this.spanOf(p) - 1 < bounds.minCol || p.col > bounds.maxCol) continue;
          out.push(p);
        }
      }
    }
    return out;
  }

  toArray(): Placement[] {
    return [...this.placements.values()];
  }
}
