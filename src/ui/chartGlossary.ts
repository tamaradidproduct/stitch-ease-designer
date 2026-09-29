import { useMemo } from "react";
import { getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import type { Placement } from "../model/types";
import { DEFAULT_STITCH_IDS, parseQuickSlotId, quickSlotKey } from "../model/quickSlots";
import { useDocStore } from "../state/docStore";

/** Every fresh pattern starts with the two foundational knit stitches. */
export const DEFAULT_GLOSSARY_IDS = DEFAULT_STITCH_IDS;

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

export function saveGlossaryIds(_chartId: string | undefined, ids: readonly string[]): void {
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
 * Per-symbol counts for a plain (uncolored) glossary row, excluding
 * still-pending suggestions and, per DNT-13, excluding colored placements of
 * that same symbol - a colored combo is a separate inventory line with its
 * own count. Without this exclusion a plain "Purl" row can read "3" while
 * zero actual uncolored purls exist, because every colored purl would be
 * counted twice: once on its own colored row, once folded into the plain one.
 */
export function countConfirmedStitches(placements: readonly Placement[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    if (placement.suggested || placement.colorId) continue;
    counts.set(placement.symbolId, (counts.get(placement.symbolId) ?? 0) + 1);
  }
  return counts;
}

/** Per (symbol, color) combo counts, confirmed placements only - the colored counterpart of `countConfirmedStitches`. */
export function countConfirmedColoredStitches(placements: readonly Placement[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    if (placement.suggested || !placement.colorId) continue;
    const key = quickSlotKey(placement.symbolId, placement.colorId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Stable identity for a colored glossary/quick-slot entry - alias of `quickSlotKey` for call sites in glossary/picker code. */
export const coloredEntryKey = quickSlotKey;

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

/** Memoized glossary entries for the open chart - combines explicit + derived, dedup'd. */
export function useColoredGlossary(placements: readonly Placement[]): GlossaryEntry[] {
  const addedIds = useGlossaryIds();
  return useMemo(() => collectColoredGlossaryEntries(addedIds, placements), [addedIds, placements]);
}
