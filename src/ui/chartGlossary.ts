import { getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import type { Placement } from "../model/types";
import { parseQuickSlotId, quickSlotKey } from "../model/quickSlots";
import { useDocStore } from "../state/docStore";

/**
 * Chart-scoped, persisted with the chart itself (see `docStore`'s
 * `glossaryIds`/`setGlossaryIds` and `serialize.ts`) - not a browser-local
 * side channel. Kept as a small wrapper (rather than reading `useDocStore`
 * directly at every call site) only so callers don't need to know the
 * underlying store shape.
 */
export function useGlossaryIds(): string[] {
  return useDocStore((s) => s.glossaryIds);
}

export function saveGlossaryIds(ids: readonly string[]): void {
  useDocStore.getState().setGlossaryIds([...ids]);
}

/** One glossary/quick-row entry: a resolved (symbol, color) pen. */
export type GlossaryEntry = {
  /** Quick-slot key - `symbolId` or `symbolId::colorId`. */
  key: string;
  symbol: StitchSymbol;
  colorId?: string;
};

/**
 * Combines explicitly-added glossary keys with keys derived from placements
 * already on the chart. Placement-derived keys come second so the
 * designer's glossary order remains stable, and duplicates or unknown
 * legacy ids are ignored (FR-24: a placed (symbol, color) combo becomes a
 * glossary entry automatically, deduplicated by identity).
 */
export function collectColoredGlossaryEntries(
  addedKeys: readonly string[],
  placements: readonly Placement[],
): GlossaryEntry[] {
  const placementKeys = placements.map((p) => quickSlotKey(p.symbolId, p.colorId));
  const seen = new Set<string>();
  return [...addedKeys, ...placementKeys].flatMap((key) => {
    if (seen.has(key)) return [];
    seen.add(key);
    const { symbolId, colorId } = parseQuickSlotId(key);
    const symbol = getSymbol(symbolId);
    if (!symbol) return [];
    return [{ key, symbol, ...(colorId ? { colorId } : {}) }];
  });
}

/** The confirmed placements for one stitch-and-color glossary swatch. */
export function selectableGlossaryEntryPlacementIds(
  placements: readonly Placement[],
  key: string,
): string[] {
  return placements
    .filter((placement) => !placement.suggested && quickSlotKey(placement.symbolId, placement.colorId) === key)
    .map((placement) => placement.id);
}

/**
 * How many of each glossary entry the chart holds, keyed by quick-slot key
 * (`symbolId`, or `symbolId::colorId` - per DNT-13 a colored combo is its own
 * inventory line, never folded into the plain one). Callers pass loose
 * placements only: a motif copy's stitches belong to its motif row (FR-64).
 * A cable counts once, as itself - the stitches it's worked as aren't
 * counted on their own rows. Still-pending suggestions don't count (FR-13,
 * G-8).
 */
export function countGlossaryStitches(placements: readonly Placement[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    if (placement.suggested) continue;
    const key = quickSlotKey(placement.symbolId, placement.colorId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Which (symbol, color) combos have any placement at all, confirmed or
 * still-suggested - the separate check "safe to remove from glossary" must
 * use. Reusing the confirmed-only counts for that decision would let a combo
 * with only a pending suggestion look removable when it isn't.
 */
export function symbolsWithAnyPlacement(placements: readonly Placement[]): Set<string> {
  const keys = new Set<string>();
  for (const placement of placements) {
    keys.add(placement.symbolId);
    keys.add(quickSlotKey(placement.symbolId, placement.colorId));
  }
  return keys;
}
