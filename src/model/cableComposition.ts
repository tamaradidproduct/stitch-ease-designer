import { getSymbol, spanOf } from "../symbols/registry";
import type { Placement } from "./types";

/**
 * What a cable is made of, cell by cell (FR-65). The library draws each
 * cable as one picture, so the stitches it crosses are implied by its name
 * rather than stored: an `a_b_left|right[_purl]_cable` crosses `a` knit
 * stitches over `b` stitches that are knit too, or purl for a purl cable.
 * A left cross ends with the `a` knits on the left; a right cross on the
 * right. Cells run left to right, as on the chart. The library's "(HR)"
 * variants are 4 cells wider than their cross, so no default is implied
 * for them - their cells start unset (still editable).
 */
export function defaultBase(symbolId: string): string[] | null {
  const match = /^(\d+)_(\d+)_(left|right)(_purl)?_cable/.exec(symbolId);
  if (!match) return null;
  const front = Number(match[1]);
  const back = Number(match[2]);
  if (front + back !== spanOf(symbolId)) return null;
  const crossing = Array<string>(front).fill("knit");
  const behind = Array<string>(back).fill(match[4] ? "purl" : "knit");
  return match[3] === "left" ? [...crossing, ...behind] : [...behind, ...crossing];
}

/**
 * A stitch a cable cell can be made of: a single-cell knit/purl-family
 * stitch (knit, purl, through the back loop, slipped, brioche) - never a
 * decrease, increase or another cable, which would change the stitch count
 * or the cross itself.
 */
export function isBaseStitch(symbolId: string): boolean {
  const symbol = getSymbol(symbolId);
  return !!symbol && symbol.span === 1 && (symbol.category === "basic" || symbol.category === "brioche");
}

/** Each cell's stitch: the designer's change if there is one, else what the cable implies. */
export function effectiveBase(placement: Pick<Placement, "symbolId" | "base">): (string | null)[] {
  const fallback = defaultBase(placement.symbolId) ?? [];
  return Array.from({ length: spanOf(placement.symbolId) }, (_, i) => placement.base?.[i] ?? fallback[i] ?? null);
}

/**
 * `placement` with only real changes kept in its base: entries that aren't
 * a knit/purl-family stitch (left by an earlier build that allowed any
 * one-cell stitch) or that just repeat what the cable implies are dropped,
 * so they can't show as changes nobody made.
 */
export function normalizeBase<T extends Pick<Placement, "symbolId" | "base">>(placement: T): T {
  if (!placement.base) return placement;
  const fallback = defaultBase(placement.symbolId) ?? [];
  const base = placement.base.map((id, i) => (id && isBaseStitch(id) && id !== fallback[i] ? id : null));
  const next = { ...placement };
  if (base.some(Boolean)) next.base = base;
  else delete next.base;
  return next;
}

/** Cells whose stitch the designer changed from what the cable implies. */
export function changedBaseCells(placement: Pick<Placement, "symbolId" | "base">): number[] {
  const fallback = defaultBase(placement.symbolId) ?? [];
  return (placement.base ?? []).flatMap((id, i) => (id && id !== fallback[i] ? [i] : []));
}
