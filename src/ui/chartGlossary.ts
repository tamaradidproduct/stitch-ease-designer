import { getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import type { Placement } from "../model/types";

/** Every fresh pattern starts with the two foundational knit stitches. */
export const DEFAULT_GLOSSARY_IDS = ["knit", "purl"];

export function loadGlossaryIds(chartId?: string): string[] {
  if (!chartId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`stitch-ease:glossary:${chartId}`);
    // No chart-specific glossary has been saved yet: start with the two
    // stitches every pattern is likely to need. Once a designer removes one,
    // their explicit stored list (including an empty one) takes precedence.
    if (raw === null) return [...DEFAULT_GLOSSARY_IDS];
    const stored: unknown = JSON.parse(raw);
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string")
      : [...DEFAULT_GLOSSARY_IDS];
  } catch {
    return [...DEFAULT_GLOSSARY_IDS];
  }
}

/**
 * Combines explicitly-added glossary stitches with stitches already placed
 * on the chart. Placement ids come second so the designer's glossary order
 * remains stable, and duplicates or unknown legacy ids are ignored.
 */
export function collectGlossarySymbols(
  addedIds: readonly string[],
  placementIds: readonly string[],
): StitchSymbol[] {
  const seen = new Set<string>();
  return [...addedIds, ...placementIds].flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const symbol = getSymbol(id);
    return symbol ? [symbol] : [];
  });
}

/**
 * Per-symbol counts for the glossary's displayed count, excluding
 * still-pending suggestions - confirming one must visibly increment its
 * symbol's count by one, which it can't do if it was already counted the
 * moment Suggest guessed it (FR-13, Gotcha G-8).
 */
export function countConfirmedStitches(placements: readonly Placement[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    if (placement.suggested) continue;
    counts.set(placement.symbolId, (counts.get(placement.symbolId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Which symbols have any placement at all, confirmed or still-suggested -
 * the separate check "safe to remove from glossary" must use. Reusing
 * `countConfirmedStitches` for that decision would let a symbol with only a
 * pending suggestion look removable when it isn't (FR-14, Gotcha G-9).
 */
export function symbolsWithAnyPlacement(placements: readonly Placement[]): Set<string> {
  return new Set(placements.map((placement) => placement.symbolId));
}
