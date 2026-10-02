import { spanOf } from "../symbols/registry";
import { cellKey } from "./cellKey";
import { rowDirectionAt } from "./rowDirection";
import type { MotifCopy, Placement, RepeatDefinition, RepeatStitch } from "./types";

/**
 * Motifs (stored as `RepeatDefinition`s) and their linked copies
 * (`MotifCopy`s). Copies are always materialized as ordinary placements
 * sharing the instance's `groupId`; everything here is pure geometry over
 * those placements - which stitches a copy *should* have, how it differs
 * from that (its overrides), and how to re-derive it after its motif
 * changes. Overrides are derived, never stored, so no edit path has to keep
 * a second record in sync.
 */

/**
 * Quick-slot / glossary key for a motif pen. Symbol ids never contain `:`,
 * so the prefix can't collide with a `symbolId` or `symbolId::colorId` key.
 */
export const MOTIF_KEY_PREFIX = "motif:";

export const motifKey = (motifId: string): string => `${MOTIF_KEY_PREFIX}${motifId}`;

export const isMotifKey = (key: string): boolean => key.startsWith(MOTIF_KEY_PREFIX);

export const motifIdFromKey = (key: string): string | null =>
  isMotifKey(key) ? key.slice(MOTIF_KEY_PREFIX.length) : null;

/**
 * Directional stitches and their horizontal mirror image. A mirrored copy
 * swaps these so a left-leaning decrease stays a decrease leaning the other
 * way, rather than a glyph that merely got moved.
 */
const MIRROR_PAIRS: readonly [string, string][] = [
  ["k2tog", "skpo"],
  ["k2tog_alt", "ssk_alt"],
  ["p2tog", "ssp"],
  ["tk2tog", "tssk"],
  ["m1l", "m1r"],
  ["m1lp", "m1rp"],
];

const MIRROR = new Map<string, string>();
for (const [a, b] of MIRROR_PAIRS) {
  MIRROR.set(a, b);
  MIRROR.set(b, a);
}

export function mirrorSymbolId(symbolId: string): string {
  const paired = MIRROR.get(symbolId);
  if (paired) return paired;
  // Cables: every "_left_" has a "_right_" twin (purl and _hr variants included).
  if (symbolId.includes("_left_")) return symbolId.replace("_left_", "_right_");
  if (symbolId.includes("_right_")) return symbolId.replace("_right_", "_left_");
  return symbolId;
}

/** A stitch at a concrete grid position. */
export type WorldStitch = { symbolId: string; col: number; row: number; colorId?: string; base?: (string | null)[] };

/** A multi-cell stitch's base layer, flipped with it: cells reversed, each base stitch mirrored too. */
export function mirrorBase(base: (string | null)[] | undefined): (string | null)[] | undefined {
  return base && [...base].reverse().map((id) => (id ? mirrorSymbolId(id) : null));
}

/** `stitch` (motif-relative) flipped within a footprint `width` wide. */
function mirrorStitch(stitch: RepeatStitch, width: number): RepeatStitch {
  return {
    ...stitch,
    symbolId: mirrorSymbolId(stitch.symbolId),
    col: width - (stitch.col + spanOf(stitch.symbolId)),
    ...(stitch.base ? { base: mirrorBase(stitch.base)! } : {}),
  };
}

/** The stitches `motif` puts on the grid for a copy at `instance`. */
export function expectedStitches(
  motif: RepeatDefinition,
  instance: { col: number; row: number; mirrored?: boolean | undefined },
): WorldStitch[] {
  return motif.stitches.map((stitch) => {
    const local = instance.mirrored ? mirrorStitch(stitch, motif.width) : stitch;
    return {
      symbolId: local.symbolId,
      col: instance.col + local.col,
      row: instance.row + local.row,
      ...(local.colorId ? { colorId: local.colorId } : {}),
      ...(local.base ? { base: local.base } : {}),
    };
  });
}

export type Footprint = { col: number; row: number; width: number; height: number };

export const footprintOf = (
  motif: Pick<RepeatDefinition, "width" | "height">,
  instance: Pick<MotifCopy, "col" | "row">,
): Footprint => ({ col: instance.col, row: instance.row, width: motif.width, height: motif.height });

/** Whether every cell `symbolId` covers at `col`/`row` lies inside `fp`. */
export function footprintContains(fp: Footprint, symbolId: string, col: number, row: number): boolean {
  return (
    row >= fp.row &&
    row < fp.row + fp.height &&
    col >= fp.col &&
    col + spanOf(symbolId) <= fp.col + fp.width
  );
}

const stitchKey = (s: { symbolId: string; col: number; row: number; colorId?: string; base?: (string | null)[] }) =>
  `${s.col},${s.row}|${s.symbolId}|${s.colorId ?? ""}|${(s.base ?? []).map((id) => id ?? "").join(",")}`;

function coveredCells(s: { symbolId: string; col: number; row: number }): string[] {
  const cells: string[] = [];
  for (let c = s.col; c < s.col + spanOf(s.symbolId); c++) cells.push(cellKey(c, s.row));
  return cells;
}

export type Overrides = {
  /** Members that aren't what the motif puts there (painted, replaced, recolored). */
  changed: Placement[];
  /** Stitches the motif puts there that this copy no longer has. */
  missing: WorldStitch[];
};

export function deriveOverrides(
  motif: RepeatDefinition,
  instance: MotifCopy,
  members: readonly Placement[],
): Overrides {
  const expected = expectedStitches(motif, instance);
  const expectedKeys = new Set(expected.map(stitchKey));
  const memberKeys = new Set(members.map(stitchKey));
  return {
    changed: members.filter((m) => !expectedKeys.has(stitchKey(m))),
    missing: expected.filter((s) => !memberKeys.has(stitchKey(s))),
  };
}

export const hasOverrides = (o: Overrides): boolean => o.changed.length > 0 || o.missing.length > 0;

/** Every cell an override touches - for marking them on the canvas. */
export function overrideCells(o: Overrides): { col: number; row: number }[] {
  const seen = new Set<string>();
  const out: { col: number; row: number }[] = [];
  for (const s of [...o.changed, ...o.missing]) {
    const key = cellKey(s.col, s.row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ col: s.col, row: s.row });
  }
  return out;
}

/** This copy's current stitches, as the motif they'd make (un-mirrored). */
export function motifStitchesFromMembers(
  motif: RepeatDefinition,
  instance: MotifCopy,
  members: readonly Placement[],
): RepeatStitch[] {
  return members
    .map((m) => {
      const local: RepeatStitch = {
        symbolId: m.symbolId,
        col: m.col - instance.col,
        row: m.row - instance.row,
        ...(m.colorId ? { colorId: m.colorId } : {}),
        ...(m.base ? { base: m.base } : {}),
      };
      return instance.mirrored ? mirrorStitch(local, motif.width) : local;
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * What a copy should become once its motif changes from `before` to
 * `after`, keeping its own overrides: members that already differed from
 * `before` stay exactly as they are, and cells it had cleared stay clear.
 * Everything else follows `after`. `isBlocked` reports a cell held by
 * something outside this copy, which is never overwritten.
 */
export function rematerialize(
  before: RepeatDefinition,
  after: RepeatDefinition,
  instance: MotifCopy,
  members: readonly Placement[],
  isBlocked: (col: number, row: number) => boolean,
  keepOverrides = true,
): { keep: Placement[]; remove: Placement[]; add: WorldStitch[] } {
  const overrides = keepOverrides ? deriveOverrides(before, instance, members) : { changed: [], missing: [] };
  const keep = overrides.changed;
  const keepIds = new Set(keep.map((p) => p.id));
  const remove = members.filter((m) => !keepIds.has(m.id));

  const reserved = new Set<string>();
  for (const s of [...overrides.changed, ...overrides.missing]) {
    for (const cell of coveredCells(s)) reserved.add(cell);
  }
  const add = expectedStitches(after, instance).filter((s) => {
    for (let c = s.col; c < s.col + spanOf(s.symbolId); c++) {
      if (reserved.has(cellKey(c, s.row)) || isBlocked(c, s.row)) return false;
    }
    return true;
  });
  return { keep, remove, add };
}

/**
 * Where a copy's footprint goes when the stamp is hovering `cell`: the
 * hovered cell is the footprint's row-start corner on its bottom row, so a
 * motif grows away from wherever knitting that row begins (FR-64).
 */
export function stampOrigin(
  motif: Pick<RepeatDefinition, "width">,
  cell: { col: number; row: number },
): { col: number; row: number } {
  return rowDirectionAt(cell.row) === "rtl"
    ? { col: cell.col - motif.width + 1, row: cell.row }
    : { col: cell.col, row: cell.row };
}

/**
 * Origins for a drag-fill from `start` (where the pointer went down) to
 * `end`. The first copy is always exactly the click stamp at `start` - it
 * never moves while dragging - and further copies tile edge to edge in the
 * drag's direction, one more each time the pointer enters the next
 * footprint's columns/rows.
 */
export function fillOrigins(
  motif: Pick<RepeatDefinition, "width" | "height">,
  start: { col: number; row: number },
  end: { col: number; row: number },
): { origins: { col: number; row: number }[]; across: number; up: number } {
  const first = stampOrigin(motif, start);
  const lastCol = first.col + motif.width - 1;
  const lastRow = first.row + motif.height - 1;
  const beyondRight = end.col - lastCol;
  const beyondLeft = first.col - end.col;
  const beyondUp = end.row - lastRow;
  const beyondDown = first.row - end.row;
  const stepCol = beyondRight > 0 ? 1 : beyondLeft > 0 ? -1 : 0;
  const stepRow = beyondUp > 0 ? 1 : beyondDown > 0 ? -1 : 0;
  const across = 1 + Math.ceil(Math.max(beyondRight, beyondLeft, 0) / motif.width);
  const up = 1 + Math.ceil(Math.max(beyondUp, beyondDown, 0) / motif.height);
  const origins: { col: number; row: number }[] = [];
  for (let j = 0; j < up; j++) {
    for (let i = 0; i < across; i++) {
      origins.push({
        col: first.col + stepCol * i * motif.width,
        row: first.row + stepRow * j * motif.height,
      });
    }
  }
  return { origins, across, up };
}
