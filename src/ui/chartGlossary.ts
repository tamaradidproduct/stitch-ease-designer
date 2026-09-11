import { getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";

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
