import { SYMBOLS } from "./symbols.generated";
import type { StitchSymbol } from "./types";

const BY_ID = new Map<string, StitchSymbol>(SYMBOLS.map((s) => [s.id, s]));

export const allSymbols = (): readonly StitchSymbol[] => SYMBOLS;

export const getSymbol = (id: string): StitchSymbol | undefined => BY_ID.get(id);

/**
 * Lookup that throws rather than returning undefined, for paths where a
 * missing symbol means the document references something the library no longer
 * has — a real error worth surfacing, not a blank cell to shrug at.
 */
export function requireSymbol(id: string): StitchSymbol {
  const symbol = BY_ID.get(id);
  if (!symbol) throw new Error(`unknown stitch symbol: ${id}`);
  return symbol;
}

export const spanOf = (id: string): number => BY_ID.get(id)?.span ?? 1;

/** Category order for the picker: the stitches used most, first. */
const CATEGORY_ORDER = ["basic", "decrease", "increase", "cable", "brioche", "special"];

export function symbolsByCategory(): { category: string; symbols: StitchSymbol[] }[] {
  const groups = new Map<string, StitchSymbol[]>();
  for (const s of SYMBOLS) {
    let group = groups.get(s.category);
    if (!group) groups.set(s.category, (group = []));
    group.push(s);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    })
    .map(([category, symbols]) => ({ category, symbols }));
}
